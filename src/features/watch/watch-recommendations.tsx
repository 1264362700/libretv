'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { Icon } from '@/components/icon';
import { EmptyState } from '@/components/states';
import { DoubanCard } from '@/components/video-card';
import { buildWatchUrl, cn } from '@/lib/utils';

export interface WatchRecommendationsProps {
  videoTitle: string;
  recommendCategory: 'tv' | 'anime' | 'variety' | 'documentary' | 'movie';
  onNavigate: (href: string) => void;
}

/**
 * 播放页底部「猜你喜欢」全宽智能推荐专区
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
    queryKey: ['watch-recommendations', recommendCategory, recPage, videoTitle],
    queryFn: async ({ signal }) => {
      try {
        const res = await api.douban(recommendCategory, '热门', recPage * 12, 12, signal);
        if (res.items && res.items.length > 0) {
          const filtered = res.items.filter(
            (item) => item.title && !videoTitle.includes(item.title) && !item.title.includes(videoTitle)
          );
          if (filtered.length > 0) return filtered;
        }
      } catch {
        // 豆瓣源失败，尝试降级
      }

      try {
        const hotKey = recommendCategory === 'tv' ? 'baidu_teleplay' : 'douban_weekly';
        const res = await api.hotList(hotKey, signal);
        if (res.items && res.items.length > 0) {
          return res.items.filter(
            (item) => item.title && !videoTitle.includes(item.title) && !item.title.includes(videoTitle)
          );
        }
      } catch {
        // 降级失败
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
              ? '根据当前剧集精选热门电视剧'
              : recommendCategory === 'anime'
                ? '精选热门动漫番剧'
                : recommendCategory === 'variety'
                  ? '精选热门综艺节目'
                  : '精选高分热门电影'}
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
              onClick={() => onNavigate(buildWatchUrl({ title: item.title }))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
