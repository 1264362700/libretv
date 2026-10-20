'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { HeroBillboardBanner } from '@/components/hero-billboard-banner';
import { MediaCarouselRow } from '@/components/media-carousel-row';
import { WeeklySchedule } from '@/components/weekly-schedule';
import { AggregatedCard, aggregateResults } from '@/components/video-card';
import {
  useAppStore,
  resolveSource,
  isInDisabledSubscription,
  isSourceDisabled,
} from '@/lib/store';
import { api } from '@/lib/client-api';
import type { SourceSearchOutcome } from '@/lib/types';
import {
  SearchHistoryDropdown,
  useSearchHistory,
  TRENDING_SEARCH_KEYWORDS,
} from '@/components/search-history';
import { cn, validateSourceUrl, buildWatchUrl } from '@/lib/utils';
import { useAuth } from '@/components/auth';
import { EmptyState } from '@/components/states';
import { SiteFooter } from '@/components/site-footer';
import {
  fetchDoubanCollectionItems,
  fetchBangumiSchedule,
  syncRecentUpdates,
  type MediaItem,
} from '@/lib/media-library-service';

const RESULT_PAGE_SIZE = 60;

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { verified } = useAuth();
  const urlQuery = searchParams.get('s') || '';

  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const selectedKeys = useAppStore((s) => s.selectedKeys);
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const sourceHealth = useAppStore((s) => s.sourceHealth);
  const subscriptions = useAppStore((s) => s.subscriptions);

  const [input, setInput] = useState(urlQuery);
  const [streamedOutcomes, setStreamedOutcomes] = useState<SourceSearchOutcome[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // 收集当前可用源，首个为主力源
  const selectedSources = useMemo(() => {
    const seen = new Set<string>();
    return selectedKeys
      .map((key) => resolveSource({ customAPIs, envSources }, key))
      .filter((s): s is NonNullable<typeof s> => {
        if (!s || !validateSourceUrl(s.url) || seen.has(s.key)) return false;
        seen.add(s.key);
        return true;
      })
      .filter((s) => !isSourceDisabled({ sourceHealth }, s.key))
      .filter((s) => !isInDisabledSubscription({ subscriptions }, s.key));
  }, [customAPIs, envSources, selectedKeys, sourceHealth, subscriptions]);

  const masterSource = selectedSources[0] || envSources[0];

  // 1. 主力采集源最近更新静默对齐服务 (RecentUpdatesSyncer)
  const recentUpdatesQuery = useQuery({
    queryKey: ['recent-updates-syncer', masterSource?.key],
    queryFn: ({ signal }) => syncRecentUpdates(masterSource, signal),
    staleTime: 5 * 60_000,
    enabled: Boolean(masterSource?.url),
  });

  const cmsRemarksMap = useMemo(() => {
    return recentUpdatesQuery.data?.remarksMap ?? new Map<string, string>();
  }, [recentUpdatesQuery.data]);

  const recentList = useMemo(() => {
    return recentUpdatesQuery.data?.recentList ?? [];
  }, [recentUpdatesQuery.data]);

  // 2. 首屏巨幕轮播大片 (Hero Billboard)
  const heroQuery = useQuery({
    queryKey: ['home-hero-billboard'],
    queryFn: async ({ signal }): Promise<MediaItem[]> => {
      try {
        const [movies, tvs] = await Promise.all([
          fetchDoubanCollectionItems('movie_hot', 0, 4, signal),
          fetchDoubanCollectionItems('tv_hot', 0, 4, signal),
        ]);
        const combined = [...movies.items, ...tvs.items];
        return combined.slice(0, 6);
      } catch {
        return [];
      }
    },
    staleTime: 30 * 60_000,
    enabled: !urlQuery,
  });

  // 3. Bangumi 每周放送日历 (追番新番表)
  const bangumiQuery = useQuery({
    queryKey: ['home-bangumi-schedule'],
    queryFn: ({ signal }) => fetchBangumiSchedule(signal),
    staleTime: 60 * 60_000,
    enabled: !urlQuery,
  });

  // 4. 固定横向分类海报轨道数据
  const hotMoviesQuery = useQuery({
    queryKey: ['home-hot-movies'],
    queryFn: ({ signal }) => fetchDoubanCollectionItems('movie_hot', 0, 14, signal),
    staleTime: 30 * 60_000,
    enabled: !urlQuery,
  });

  const hotTvsQuery = useQuery({
    queryKey: ['home-hot-tvs'],
    queryFn: ({ signal }) => fetchDoubanCollectionItems('tv_hot', 0, 14, signal),
    staleTime: 30 * 60_000,
    enabled: !urlQuery,
  });

  const top250Query = useQuery({
    queryKey: ['home-top250-movies'],
    queryFn: ({ signal }) => fetchDoubanCollectionItems('movie_top250', 0, 14, signal),
    staleTime: 60 * 60_000,
    enabled: !urlQuery,
  });

  const animeVarietyQuery = useQuery({
    queryKey: ['home-anime-variety'],
    queryFn: async ({ signal }) => {
      const [anime, variety] = await Promise.all([
        fetchDoubanCollectionItems('tv_animation', 0, 8, signal),
        fetchDoubanCollectionItems('tv_variety_show', 0, 8, signal),
      ]);
      return [...anime.items, ...variety.items];
    },
    staleTime: 30 * 60_000,
    enabled: !urlQuery,
  });



  // 播放前强制校验登录并直通播放页
  const handlePlayMedia = (item: MediaItem) => {
    const isCustomRecent = item.id.startsWith('recent_');
    const doubanId = isCustomRecent ? undefined : item.id;
    const watchUrl = buildWatchUrl({
      title: item.title,
      doubanId,
      year: item.year,
    });
    if (!verified) {
      router.push(`/login?redirect=${encodeURIComponent(watchUrl)}`);
      return;
    }
    router.push(watchUrl);
  };

  // URL 驱动搜索逻辑
  useEffect(() => {
    if (urlQuery) setInput(urlQuery);
  }, [urlQuery]);

  const searchHistory = useSearchHistory(input);

  const runSearch = (keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      router.push('/');
      return;
    }
    searchHistory.record(trimmed);
    searchHistory.close();
    router.push(`/?s=${encodeURIComponent(trimmed)}`);
  };

  const pickHistory = (kw: string) => {
    setInput(kw);
    runSearch(kw);
  };

  // 搜索 Query
  const searchQuery = useQuery({
    queryKey: ['search', urlQuery, selectedSources.map((s) => s.key).sort().join(','), yellowFilter],
    queryFn: ({ signal }) => {
      setStreamedOutcomes([]);
      return api.search(urlQuery.slice(0, 100), selectedSources, yellowFilter, {
        signal,
        onSource: (outcome) => setStreamedOutcomes((prev) => [...prev, outcome]),
      });
    },
    enabled: Boolean(urlQuery) && selectedSources.length > 0,
    staleTime: 60_000,
  });

  const isSearching = Boolean(urlQuery) && searchQuery.isFetching && !searchQuery.data;
  const streamedList = useMemo(() => streamedOutcomes.flatMap((o) => o.list), [streamedOutcomes]);
  const searchResults = useMemo(
    () => searchQuery.data?.list ?? (isSearching ? streamedList : []),
    [searchQuery.data, isSearching, streamedList]
  );
  const groups = useMemo(() => aggregateResults(searchResults), [searchResults]);

  const [visibleCount, setVisibleCount] = useState(RESULT_PAGE_SIZE);
  const visibleGroups = useMemo(() => groups.slice(0, visibleCount), [groups, visibleCount]);
  useEffect(() => setVisibleCount(RESULT_PAGE_SIZE), [groups]);

  return (
    <div className="min-h-screen flex flex-col bg-page text-content transition-colors duration-200">
      {/* 1. 顶部沉浸式毛玻璃导航栏 */}
      <Header />

      <main className="relative flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-24 md:pb-6 overflow-x-hidden">
        {/* 搜索模式：直接展示搜索结果 */}
        {urlQuery ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-line">
              <h2 className="text-lg font-bold text-content flex items-center gap-2">
                <span>🔍 搜索结果:</span>
                <span className="text-accent">“{urlQuery}”</span>
              </h2>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="text-xs text-muted hover:text-content px-3 py-1.5 rounded-lg bg-chip hover:bg-hover transition-colors cursor-pointer border border-line/50"
              >
                返回首页大厅
              </button>
            </div>

            {visibleGroups.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                  {visibleGroups.map((group) => (
                    <AggregatedCard
                      key={group.key}
                      group={group}
                      onOpen={() => {
                        const watchUrl = buildWatchUrl({
                          title: group.name,
                          year: group.year,
                        });
                        if (!verified) {
                          router.push(`/login?redirect=${encodeURIComponent(watchUrl)}`);
                          return;
                        }
                        router.push(watchUrl);
                      }}
                    />
                  ))}
                </div>
                {visibleCount < groups.length && (
                  <div className="flex justify-center mt-6">
                    <button
                      className="px-6 py-2.5 rounded-xl bg-chip hover:bg-hover text-xs font-semibold text-content border border-line/60 transition-all cursor-pointer"
                      onClick={() => setVisibleCount((v) => v + RESULT_PAGE_SIZE)}
                    >
                      加载更多（还剩 {groups.length - visibleCount} 部）
                    </button>
                  </div>
                )}
              </>
            ) : isSearching ? (
              <div className="py-20 text-center text-muted">正在流式并发检索几十个苹果CMS播放源…</div>
            ) : (
              <EmptyState
                icon="search"
                title="未搜到匹配影片"
                description="请尝试其他关键词或在设置中启用更多播放源"
                className="!py-16"
              />
            )}
          </section>
        ) : (
          /* 流媒体暗黑大厅 6 层标准布局 */
          <div className="space-y-10 animate-fade-in">
            {/* 2. 首屏巨幕轮播区 (Hero Billboard Banner) */}
            <HeroBillboardBanner
              items={heroQuery.data ?? []}
              cmsRemarksMap={cmsRemarksMap}
              onPlay={handlePlayMedia}
              onDetail={handlePlayMedia}
            />

            {/* 搜索胶囊栏（带防抖联想与热词） */}
            <section className="flex flex-col items-center">
              <div ref={searchHistory.containerRef} className="relative w-full max-w-2xl">
                <form
                  className="w-full"
                  onSubmit={(e) => {
                    e.preventDefault();
                    runSearch(input);
                  }}
                >
                  <div
                    className={cn(
                      'flex items-stretch min-h-12 pl-4 border transition-all duration-200',
                      searchHistory.visible
                        ? 'rounded-t-xl rounded-b-none border-accent bg-surface-raised shadow-lg'
                        : 'rounded-xl border-line bg-surface/90 hover:border-accent/40 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30 shadow-sm'
                    )}
                  >
                    <input
                      ref={inputRef}
                      role="combobox"
                      className="flex-1 min-w-0 pr-2 bg-transparent text-sm text-content placeholder:text-faint focus:outline-none"
                      placeholder="搜索全网海量电影、电视剧、动漫、短剧..."
                      value={input}
                      maxLength={100}
                      aria-autocomplete="list"
                      aria-controls="home-search-history"
                      aria-expanded={searchHistory.visible}
                      onChange={(e) => {
                        setInput(e.target.value);
                        searchHistory.resetActive();
                      }}
                      onFocus={searchHistory.onFocus}
                      onKeyDown={(e) => searchHistory.onKeyDown(e, pickHistory)}
                    />
                    <button
                      type="submit"
                      className="px-5 bg-accent hover:bg-accent-hover text-on-accent text-xs font-bold rounded-r-xl transition-all active:scale-95 cursor-pointer"
                    >
                      搜索
                    </button>
                  </div>
                </form>

                {searchHistory.visible && (
                  <SearchHistoryDropdown
                    id="home-search-history"
                    matches={searchHistory.matches}
                    activeIndex={searchHistory.activeIndex}
                    onPick={pickHistory}
                    onRemove={searchHistory.remove}
                    onClearAll={searchHistory.clearAll}
                  />
                )}
              </div>

              {/* 热门搜索推荐词 */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 max-w-2xl">
                <span className="text-[11px] text-faint">大家都在搜:</span>
                {TRENDING_SEARCH_KEYWORDS.slice(0, 6).map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => pickHistory(kw)}
                    className="text-[11px] text-muted hover:text-accent hover:bg-chip px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </section>

            {/* 3. 板块一：「📡 实时连载 · 今日最新更新剧集/动漫」（横向滑动轨道） */}
            {recentList.length > 0 && (
              <MediaCarouselRow
                title="实时连载 · 今日最新更新"
                subTitle="采集源最新出炉剧集 · 呼吸灯高亮秒播"
                icon="📡"
                badge="刚刚更新"
                items={recentList.slice(0, 16)}
                cmsRemarksMap={cmsRemarksMap}
                onPick={handlePlayMedia}
                isLoading={recentUpdatesQuery.isLoading}
              />
            )}

            {/* 4. 板块二：「📅 每日追番 / 追剧放送表」（周历切换组件） */}
            <WeeklySchedule
              schedule={bangumiQuery.data ?? []}
              cmsRemarksMap={cmsRemarksMap}
              onPick={handlePlayMedia}
              isLoading={bangumiQuery.isLoading}
            />

            {/* 5. 板块三 ~ 五：分类横向海报轨道 */}
            <MediaCarouselRow
              title="正在热映 · 热门电影榜"
              subTitle="院线热映 · 高分大片"
              icon="🎬"
              badge="豆瓣热榜"
              moreHref="/catalog?type=movie"
              items={hotMoviesQuery.data?.items ?? []}
              cmsRemarksMap={cmsRemarksMap}
              onPick={handlePlayMedia}
              isLoading={hotMoviesQuery.isLoading}
            />

            <MediaCarouselRow
              title="近期霸屏 · 热播电视剧榜"
              subTitle="华语热剧 · 精彩连载"
              icon="📺"
              badge="热播剧集"
              moreHref="/catalog?type=tv"
              items={hotTvsQuery.data?.items ?? []}
              cmsRemarksMap={cmsRemarksMap}
              onPick={handlePlayMedia}
              isLoading={hotTvsQuery.isLoading}
            />

            <MediaCarouselRow
              title="口碑神作 · 豆瓣高分经典榜"
              subTitle="殿堂级影史神作 · 值得反复重温"
              icon="🏆"
              badge="Top 250"
              moreHref="/catalog?type=movie&sort=rank"
              items={top250Query.data?.items ?? []}
              cmsRemarksMap={cmsRemarksMap}
              onPick={handlePlayMedia}
              isLoading={top250Query.isLoading}
            />

            <MediaCarouselRow
              title="二次元 & 热门综艺"
              subTitle="高人气新番动画 · 爆笑下饭综艺"
              icon="⚡"
              badge="动漫综艺"
              moreHref="/catalog?type=anime"
              items={animeVarietyQuery.data ?? []}
              cmsRemarksMap={cmsRemarksMap}
              onPick={handlePlayMedia}
              isLoading={animeVarietyQuery.isLoading}
            />
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
