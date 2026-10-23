'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { HeroBillboardBanner } from '@/components/hero-billboard-banner';
import { MediaCarouselRow } from '@/components/media-carousel-row';
import { RecommendSection } from '@/components/douban-section';
import { ContinueWatchingRow } from '@/components/continue-watching-row';
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

  // 收集当前可用播放采集源
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

  // 1. 主力采集源最近更新静默对齐服务 (用于匹配更新集数角标)
  const recentUpdatesQuery = useQuery({
    queryKey: ['recent-updates-syncer', masterSource?.key],
    queryFn: ({ signal }) => syncRecentUpdates(masterSource, signal),
    staleTime: 30 * 60_000,
    enabled: Boolean(masterSource?.url),
  });

  const cmsRemarksMap = useMemo(() => {
    return recentUpdatesQuery.data?.remarksMap ?? new Map<string, string>();
  }, [recentUpdatesQuery.data]);

  // 2. TMDB 全球 4K 趋势大片（供首屏 Hero 巨幕使用）
  const trendingHeroQuery = useQuery({
    queryKey: ['home-tmdb-trending-hero'],
    queryFn: ({ signal }) => fetchDoubanCollectionItems('trending', 0, 8, signal),
    staleTime: 30 * 60_000,
    enabled: !urlQuery,
  });

  const heroBillboardItems = useMemo(() => {
    return (trendingHeroQuery.data?.items ?? []).slice(0, 6);
  }, [trendingHeroQuery.data]);

  // 3. TMDB 影史高分殿堂
  const topRatedQuery = useQuery({
    queryKey: ['home-tmdb-top-rated'],
    queryFn: ({ signal }) => fetchDoubanCollectionItems('movie_top250', 0, 14, signal),
    staleTime: 60 * 60_000,
    enabled: !urlQuery,
  });

  // 播放前强制校验登录并直通 LibreTV 多源测速播放页
  const handlePlayMedia = (item: MediaItem) => {
    const watchUrl = buildWatchUrl({
      title: item.title,
      year: item.year,
    });
    if (!verified) {
      router.push(`/login?redirect=${encodeURIComponent(watchUrl)}`);
      return;
    }
    router.push(watchUrl);
  };

  const handlePickByTitle = (title: string) => {
    handlePlayMedia({
      id: '',
      title,
      cover: '',
    });
  };

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

  // 全网多采集源流式并发搜索
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
      <Header />

      <main className="relative flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-24 md:pb-8 overflow-x-hidden">
        {urlQuery ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between py-2.5 px-4 rounded-2xl ios-glass">
              <h2 className="text-base sm:text-lg font-bold text-content flex items-center gap-2">
                <span>🔍 全网播放源聚合搜索:</span>
                <span className="text-accent">“{urlQuery}”</span>
              </h2>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="text-xs text-muted hover:text-content px-3.5 py-1.5 rounded-full ios-pill transition-all cursor-pointer"
              >
                返回首页大厅
              </button>
            </div>

            {visibleGroups.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4">
                  {visibleGroups.map((group) => (
                    <AggregatedCard
                      key={group.key}
                      group={group}
                      onOpen={() => {
                        const primary = group.items[0];
                        if (typeof window !== 'undefined' && primary?.sourceKey && primary?.vodId) {
                          try {
                            const cached = group.items.map((it) => ({
                              sourceKey: it.sourceKey,
                              sourceName: it.sourceName,
                              sourceVodId: it.vodId,
                              sourceUrl: it.sourceUrl,
                              remarks: it.remarks,
                            }));
                            sessionStorage.setItem(
                              `libretv:matched:${primary.sourceKey}:${primary.vodId}`,
                              JSON.stringify(cached)
                            );
                          } catch {}
                        }
                        const watchUrl = buildWatchUrl({
                          title: group.name,
                          year: group.year,
                          sourceKey: primary?.sourceKey,
                          vodId: primary?.vodId,
                          sourceUrl: primary?.sourceUrl,
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
                      className="px-6 py-2.5 rounded-full ios-pill text-xs font-semibold text-content hover:opacity-90 transition-all cursor-pointer"
                      onClick={() => setVisibleCount((v) => v + RESULT_PAGE_SIZE)}
                    >
                      加载更多（还剩 {groups.length - visibleCount} 部）
                    </button>
                  </div>
                )}
              </>
            ) : isSearching ? (
              <div className="py-20 text-center text-muted ios-glass rounded-3xl">
                正在流式并发检索全网点播采集源…
              </div>
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
          <div className="space-y-8 animate-fade-in">
            {/* 1. 首屏 4K 宽画幅巨幕轮播 (TMDB Official) */}
            <HeroBillboardBanner
              items={heroBillboardItems}
              cmsRemarksMap={cmsRemarksMap}
              onPlay={handlePlayMedia}
              onDetail={handlePlayMedia}
            />

            {/* 2. iOS 27 悬浮空间液态毛玻璃搜索舱 */}
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
                      'flex items-stretch min-h-12 pl-5 pr-1.5 py-1.5 transition-all duration-200 ios-glass',
                      searchHistory.visible ? 'rounded-t-2xl rounded-b-none' : 'rounded-full'
                    )}
                  >
                    <input
                      ref={inputRef}
                      role="combobox"
                      className="flex-1 min-w-0 pr-3 bg-transparent text-sm text-content placeholder:text-faint focus:outline-none"
                      placeholder="搜索全网电影、剧集、动漫，多源并发测速秒播..."
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
                      className="px-6 rounded-full ios-pill-active text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                    >
                      全网搜索
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

              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 max-w-2xl">
                <span className="text-[11px] text-faint">热门搜索:</span>
                {TRENDING_SEARCH_KEYWORDS.slice(0, 6).map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => pickHistory(kw)}
                    className="text-[11px] text-muted hover:text-content px-2.5 py-0.5 rounded-full ios-pill transition-colors cursor-pointer"
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </section>

            {/* 3. 继续观看与追剧进度轨道 */}
            <ContinueWatchingRow
              cmsRemarksMap={cmsRemarksMap}
              onNavigate={(watchUrl) => {
                if (!verified) {
                  router.push(`/login?redirect=${encodeURIComponent(watchUrl)}`);
                  return;
                }
                router.push(watchUrl);
              }}
            />

            {/* 4. 核心片库舞台：TMDB 多维探索网格 (左 9 列) + TMDB 全球热力榜 TOP 10 (右 3 列) */}
            <Suspense fallback={null}>
              <RecommendSection onPick={handlePickByTitle} />
            </Suspense>

            {/* 5. TMDB 影史高分殿堂横向精选轨道 */}
            <MediaCarouselRow
              title="TMDB 影史高分殿堂"
              subTitle="全球影迷高分认证 · 4K 典藏佳作"
              icon="🏆"
              badge="TMDB Top Rated"
              moreHref="/catalog?type=movie&sort=rank"
              items={topRatedQuery.data?.items ?? []}
              cmsRemarksMap={cmsRemarksMap}
              onPick={handlePlayMedia}
              isLoading={topRatedQuery.isLoading}
            />
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
