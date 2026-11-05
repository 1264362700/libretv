'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { HeroBillboardBanner } from '@/components/hero-billboard-banner';
import { ContinueWatchingRow } from '@/components/continue-watching-row';
import { RecommendSection } from '@/components/douban-section';
import { MediaCard } from '@/components/media-card';
import { AggregatedCard, aggregateResults } from '@/components/video-card';
import {
  useAppStore,
  resolveSource,
  isInDisabledSubscription,
  isSourceDisabled,
} from '@/lib/store';
import { api } from '@/lib/client-api';
import type { SourceSearchOutcome } from '@/lib/types';
import { validateSourceUrl, buildWatchUrl } from '@/lib/utils';
import { useAuth } from '@/components/auth';
import { EmptyState } from '@/components/states';
import { SiteFooter } from '@/components/site-footer';
import {
  fetchTmdbClient,
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

  const [streamedOutcomes, setStreamedOutcomes] = useState<SourceSearchOutcome[]>([]);
  const [remarksSyncEnabled, setRemarksSyncEnabled] = useState(false);

  // 主采集源备注同步不是首屏展示的必要条件，延后至首屏完全呈现后启动，避免与首屏资料流请求抢占连接。
  useEffect(() => {
    const timer = window.setTimeout(() => setRemarksSyncEnabled(true), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  // 收集当前可用播放采集源（供全网搜索与点击秒播使用）
  const selectedSources = useMemo(() => {
    const seen = new Set<string>();
    const rawList = selectedKeys
      .map((key) => resolveSource({ customAPIs, envSources }, key))
      .filter((s): s is NonNullable<typeof s> => {
        if (!s || !validateSourceUrl(s.url) || seen.has(s.key)) return false;
        seen.add(s.key);
        return true;
      })
      .filter((s) => !isSourceDisabled({ sourceHealth }, s.key))
      .filter((s) => !isInDisabledSubscription({ subscriptions }, s.key));

    // 优先保持预置权威优先顺序（顶级海外专线与无版权审查大源排在最前列）
    const orderMap = new Map<string, number>();
    envSources.forEach((s, idx) => orderMap.set(s.key, idx));
    return rawList.sort((a, b) => {
      const oA = orderMap.has(a.key) ? (orderMap.get(a.key) as number) : 9999;
      const oB = orderMap.has(b.key) ? (orderMap.get(b.key) as number) : 9999;
      return oA - oB;
    });
  }, [customAPIs, envSources, selectedKeys, sourceHealth, subscriptions]);

  // 全球 4K 趋势大片（供首屏 HeroBillboard 巨幕轮播使用，与右侧热播飙升榜共享 QueryKey 与单次网络请求）
  const trendingHeroQuery = useQuery({
    queryKey: ['novatv-top10-trending'],
    queryFn: ({ signal }) => fetchTmdbClient({ type: 'trending', page: 1 }, signal),
    staleTime: 10 * 60_000,
    enabled: !urlQuery,
  });

  const heroBillboardItems = useMemo(() => {
    return (trendingHeroQuery.data?.items ?? []).slice(0, 6);
  }, [trendingHeroQuery.data]);

  // 主力播放采集源实时集数与状态静默对齐服务 (RemarksSyncer)
  const masterSource = selectedSources[0];
  const remarksQuery = useQuery({
    queryKey: ['home-cms-remarks', masterSource?.key],
    queryFn: ({ signal }) =>
      masterSource
        ? syncRecentUpdates(masterSource, signal)
        : Promise.resolve({ remarksMap: new Map<string, string>(), recentList: [] }),
    staleTime: 10 * 60_000,
    enabled: Boolean(masterSource && !urlQuery && remarksSyncEnabled),
  });

  // 播放前强制校验登录并直通多源测速播放页
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

  // 全球官方影视资料库极速精准搜索（返回标准高清海报、正规剧名、真实评分与年份）
  const officialSearchQuery = useQuery({
    queryKey: ['official-search', urlQuery],
    queryFn: ({ signal }) => fetchTmdbClient({ type: 'movie', query: urlQuery, page: 1 }, signal),
    enabled: Boolean(urlQuery),
    staleTime: 60_000,
  });

  const [showRawCmsSearch, setShowRawCmsSearch] = useState(false);

  // 全网多采集源底层流式并发搜索（按需展开用于深度探针）
  const searchQuery = useQuery({
    queryKey: ['search', urlQuery, selectedSources.map((s) => s.key).sort().join(','), yellowFilter],
    queryFn: ({ signal }) => {
      setStreamedOutcomes([]);
      return api.search(urlQuery.slice(0, 100), selectedSources, yellowFilter, {
        signal,
        onSource: (outcome) => setStreamedOutcomes((prev) => [...prev, outcome]),
      });
    },
    enabled: Boolean(urlQuery) && showRawCmsSearch && selectedSources.length > 0,
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

  const officialItems = officialSearchQuery.data?.items ?? [];
  const officialLoading = Boolean(urlQuery) && officialSearchQuery.isLoading;

  return (
    <div className="min-h-screen flex flex-col bg-page text-content transition-colors duration-200">
      {/* Top Glass Navigation */}
      <Header />

      {urlQuery ? (
        <main className="relative flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12 overflow-x-hidden">
          <section className="space-y-6">
            <div className="flex items-center justify-between py-3.5 px-4 sm:px-5 rounded-2xl glass-panel">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-bold text-content">🔍 搜索结果:</span>
                <span className="text-base sm:text-lg font-bold text-amber-500 dark:text-amber-400">“{urlQuery}”</span>
                {officialItems.length > 0 && (
                  <span className="text-xs text-muted font-normal ml-2 hidden sm:inline">
                    （找到 {officialItems.length} 部官方收录影视）
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="text-xs text-muted hover:text-amber-500 dark:hover:text-amber-400 px-3.5 py-1.5 rounded-xl bg-chip hover:bg-hover border border-line transition-all cursor-pointer"
              >
                返回首页大厅
              </button>
            </div>

            {/* 优先呈现：官方全维资料库结果（标准海报、纯净简介、即点即播） */}
            {officialLoading ? (
              <div className="py-20 text-center text-muted glass-panel rounded-2xl">
                正在检索权威影视资料库…
              </div>
            ) : officialItems.length > 0 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                  {officialItems.map((item) => (
                    <MediaCard
                      key={item.id}
                      item={item as MediaItem}
                      cmsRemarksMap={remarksQuery.data?.remarksMap}
                      onClick={() => {
                        const watchUrl = buildWatchUrl({
                          title: item.title,
                          year: item.year,
                          doubanId: item.id,
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

                {/* 底部折叠：采集源深度扫描 */}
                <div className="pt-4 border-t border-line/50 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowRawCmsSearch((prev) => !prev)}
                    className="text-xs text-muted hover:text-content px-4 py-2 rounded-xl bg-chip/60 hover:bg-chip border border-line transition-all cursor-pointer"
                  >
                    {showRawCmsSearch ? '▲ 收起底层采集源扫描' : '▼ 未找到想看的内容？展开底层采集源深度扫描'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <EmptyState
                  icon="search"
                  title="未搜到匹配影视"
                  description="资料库中未找到该影视条目，你可以尝试展开底层采集源深度扫描"
                  className="!py-12"
                />
                {!showRawCmsSearch && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowRawCmsSearch(true)}
                      className="text-xs text-accent hover:underline px-4 py-2 rounded-xl bg-accent/10 border border-accent/30 transition-all cursor-pointer"
                    >
                      尝试通过底层采集源深度直搜 →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 底层采集源展开视图 */}
            {showRawCmsSearch && (
              <div className="space-y-4 pt-6 border-t border-line">
                <h3 className="text-sm font-semibold text-muted">全网底层采集源聚合扫描结果:</h3>
                {visibleGroups.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                      {visibleGroups.map((group) => (
                        <AggregatedCard
                          key={group.key}
                          group={group}
                          onOpen={() => {
                            const primary = group.items[0];
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
                          type="button"
                          className="px-6 py-2.5 rounded-xl glass-panel text-xs font-semibold text-content hover:text-amber-500 transition-all cursor-pointer"
                          onClick={() => setVisibleCount((v) => v + RESULT_PAGE_SIZE)}
                        >
                          加载更多采集源结果（还剩 {groups.length - visibleCount} 部）
                        </button>
                      </div>
                    )}
                  </>
                ) : isSearching ? (
                  <div className="py-12 text-center text-muted glass-panel rounded-2xl">
                    正在流式并发检索全网点播采集源…
                  </div>
                ) : (
                  <div className="py-8 text-center text-faint text-xs">
                    底层采集源中暂无匹配结果
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="flex-1 pb-24 md:pb-12">
          {/* 1. Hero 巨幕大轮播 */}
          <HeroBillboardBanner
            items={heroBillboardItems}
            isLoading={trendingHeroQuery.isLoading}
            cmsRemarksMap={remarksQuery.data?.remarksMap}
            onPlay={handlePlayMedia}
            onDetail={handlePlayMedia}
          />

          {/* 1.5 首页“我的追剧·最近更新”动态流专区 (REQ-P0-04) */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 sm:-mt-8 relative z-20 mb-6">
            <ContinueWatchingRow
              cmsRemarksMap={remarksQuery.data?.remarksMap}
              onNavigate={(watchUrl) => {
                if (!verified) {
                  router.push(`/login?redirect=${encodeURIComponent(watchUrl)}`);
                  return;
                }
                router.push(watchUrl);
              }}
            />
          </div>

          {/* 2. 左图右榜双栏楼层（无 LibreTV 冗余搜索框/轮播轨） */}
          <div className="-mt-8 sm:-mt-12 relative z-20 space-y-2">
            <Suspense fallback={null}>
              <RecommendSection
                onPick={handlePickByTitle}
                cmsRemarksMap={remarksQuery.data?.remarksMap}
              />
            </Suspense>
          </div>
        </main>
      )}

      <SiteFooter />
    </div>
  );
}
