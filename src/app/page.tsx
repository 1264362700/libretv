'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { HeroBillboardBanner } from '@/components/hero-billboard-banner';
import { RecommendSection } from '@/components/douban-section';
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

  const [streamedOutcomes, setStreamedOutcomes] = useState<SourceSearchOutcome[]>([]);

  // 收集当前可用播放采集源（供全网搜索与点击秒播使用）
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

  // 全球 4K 趋势大片（供首屏 HeroBillboard 巨幕轮播使用）
  const trendingHeroQuery = useQuery({
    queryKey: ['home-trending-hero'],
    queryFn: ({ signal }) => fetchDoubanCollectionItems('trending', 0, 8, signal),
    staleTime: 30 * 60_000,
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
    enabled: Boolean(masterSource && !urlQuery),
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
      {/* Top Glass Navigation */}
      <Header />

      {urlQuery ? (
        <main className="relative flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12 overflow-x-hidden">
          <section className="space-y-5">
            <div className="flex items-center justify-between py-3 px-4 rounded-2xl glass-panel">
              <h2 className="text-base sm:text-lg font-bold text-content flex items-center gap-2">
                <span>🔍 全网播放源聚合搜索:</span>
                <span className="text-amber-500 dark:text-amber-400">“{urlQuery}”</span>
              </h2>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="text-xs text-muted hover:text-amber-500 dark:hover:text-amber-400 px-3.5 py-1.5 rounded-xl bg-chip hover:bg-hover border border-line transition-all cursor-pointer"
              >
                返回首页大厅
              </button>
            </div>

            {visibleGroups.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
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
                      type="button"
                      className="px-6 py-2.5 rounded-xl glass-panel text-xs font-semibold text-content hover:text-amber-500 dark:hover:text-amber-400 transition-all cursor-pointer"
                      onClick={() => setVisibleCount((v) => v + RESULT_PAGE_SIZE)}
                    >
                      加载更多（还剩 {groups.length - visibleCount} 部）
                    </button>
                  </div>
                )}
              </>
            ) : isSearching ? (
              <div className="py-20 text-center text-muted glass-panel rounded-2xl">
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
