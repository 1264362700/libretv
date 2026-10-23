'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/icon';
import { EmptyState } from '@/components/states';
import { DoubanCard } from '@/components/video-card';
import { buildWatchUrl, cn } from '@/lib/utils';
import type { TmdbMediaItem } from '@/lib/tmdb';

export interface WatchRecommendationsProps {
  videoTitle: string;
  recommendCategory: 'tv' | 'anime' | 'variety' | 'documentary' | 'movie';
  onNavigate: (href: string) => void;
}

/**
 * 播放页底部「猜你喜欢」全宽智能推荐专区（纯 TMDB 官方引擎）
 */
export function WatchRecommendations({
  videoTitle,
  recommendCategory,
  onNavigate,
}: WatchRecommendationsProps) {
  const [recPage, setRecPage] = useState(0);
  const [recRefreshing, setRecRefreshing] = useState(false);

  useEffect(() => {
    setRecPage(0);
  }, [videoTitle]);

  const recommendQuery = useQuery({
    queryKey: ['watch-tmdb-recommendations', recommendCategory, recPage, videoTitle],
    queryFn: async ({ signal }) => {
      try {
        const sp = new URLSearchParams({
          type: recommendCategory,
          page: String(recPage + 1),
          sort: 'recommend',
        });
        const res = await fetch(`/api/tmdb?${sp.toString()}`, { signal });
        if (res.ok) {
          const data = await res.json();
          const items: TmdbMediaItem[] = Array.isArray(data.items) ? data.items : [];
          return items.filter(
            (item) => item.title && !videoTitle.includes(item.title) && !item.title.includes(videoTitle)
          );
        }
      } catch {
        // ignore
      }
      return [];
    },
    staleTime: 5 * 60_000,
  });

  const handleRefreshRecommend = () => {
    setRecRefreshing(true);
    setRecPage((p) => (p + 1) % 5);
    setTimeout(() => setRecRefreshing(false), 500);
  };

  return (
    <section className="mt-8 pt-6 border-t border-line/60 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-5 rounded-full bg-accent shrink-0" />
          <h2 className="text-base sm:text-lg font-bold text-content">猜你喜欢</h2>
          <span className="text-xs text-faint hidden sm:inline">
            {recommendCategory === 'tv'
              ? 'TMDB 精选热门电视剧'
              : recommendCategory === 'anime'
                ? 'TMDB 精选热门动漫番剧'
                : recommendCategory === 'variety'
                  ? 'TMDB 精选热门综艺节目'
                  : 'TMDB 精选高分热门电影'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleRefreshRecommend}
          disabled={recommendQuery.isLoading || recRefreshing}
          className="text-xs text-accent hover:text-accent/80 font-medium flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface hover:bg-hover border border-line transition-colors cursor-pointer disabled:opacity-50"
          title="换一批推荐"
        >
          <Icon
            name="refresh"
            className={cn('w-3.5 h-3.5', (recommendQuery.isLoading || recRefreshing) && 'animate-spin')}
          />
          <span>换一批</span>
        </button>
      </div>

      {recommendQuery.isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-xl bg-chip/40 animate-pulse border border-line/40" />
          ))}
        </div>
      ) : (recommendQuery.data?.length ?? 0) === 0 ? (
        <EmptyState variant="plain" title="暂无相关推荐" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
          {recommendQuery.data!.slice(0, 12).map((item) => (
            <DoubanCard
              key={item.id || item.title}
              item={item}
              onClick={() => onNavigate(buildWatchUrl({ title: item.title, year: item.year }))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
