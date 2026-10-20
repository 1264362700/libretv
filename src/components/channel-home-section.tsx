'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  fetchDoubanCollection,
  fetchDoubanFilter,
  type DoubanSubject,
} from '@/lib/douban-api';
import { DoubanCard } from './video-card';
import { triggerTopProgress } from './top-progress-bar';
import { cn } from '@/lib/utils';

interface ChannelHomeSectionProps {
  title: string;
  icon: string;
  channelId: 'movie' | 'tv' | 'short_drama' | 'ai' | 'anime' | 'variety' | 'documentary';
  subTitle: string;
  onPick: (title: string, doubanId?: string, year?: string) => void;
}

/**
 * 首页各个栏目双排卡片组件（壳肉分离架构 - 豆瓣门面层）：
 * 1. 彻底不直接请求几十个采集源，首页零杂乱、零重复片名、零劣质水印；
 * 2. 统一通过 /api/douban-proxy 请求豆瓣官方公开接口，获取高清海报、权威评分与标准片名；
 * 3. 桌面端 2 排 x 6 列（共 12 部），移动端自适应 2 列；
 * 4. 支持「换一批」（换页取下一组）与「更多」直达对应频道大厅。
 */
export function ChannelHomeSection({
  title,
  icon,
  channelId,
  subTitle,
  onPick,
}: ChannelHomeSectionProps) {
  const [page, setPage] = useState(1);

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ['home-channel-section-douban', channelId, page],
    queryFn: async ({ signal }): Promise<DoubanSubject[]> => {
      const start = (page - 1) * 12;

      try {
        if (channelId === 'movie') {
          const res = await fetchDoubanCollection('movie_hot', start, 12, signal);
          return res.items;
        }
        if (channelId === 'tv') {
          const res = await fetchDoubanCollection('tv_hot', start, 12, signal);
          return res.items;
        }
        if (channelId === 'anime') {
          const res = await fetchDoubanCollection('tv_animation', start, 12, signal);
          return res.items;
        }
        if (channelId === 'variety') {
          const res = await fetchDoubanCollection('tv_variety_show', start, 12, signal);
          return res.items;
        }
        if (channelId === 'short_drama') {
          const res = await fetchDoubanFilter(
            { tags: '电视剧', genres: '短片', sort: 'U', start },
            signal
          );
          if (res.items.length > 0) return res.items.slice(0, 12);
          const fallback = await fetchDoubanCollection('tv_hot', start + 24, 12, signal);
          return fallback.items;
        }
        if (channelId === 'ai') {
          const res = await fetchDoubanFilter(
            { tags: '电影', genres: '科幻', sort: 'U', start },
            signal
          );
          return res.items.slice(0, 12);
        }
        if (channelId === 'documentary') {
          const res = await fetchDoubanCollection('movie_top250', start, 12, signal);
          return res.items;
        }

        const fallback = await fetchDoubanCollection('movie_hot', start, 12, signal);
        return fallback.items;
      } catch (err) {
        console.warn(`[ChannelHomeSection] 获取豆瓣榜单 ${channelId} 异常:`, err);
        return [];
      }
    },
    staleTime: 10 * 60_000,
  });

  const handleRefreshNext = () => {
    triggerTopProgress();
    setPage((prev) => (prev >= 6 ? 1 : prev + 1));
  };

  const items = data ?? [];

  return (
    <section className="space-y-3.5 pt-2">
      {/* 栏目头部：图标 + 标题 + 豆瓣官方热榜标 + 右侧（换一批 + 更多跳转） */}
      <div className="flex items-center justify-between pb-2 border-b border-line/60">
        <div className="flex items-center gap-2">
          <span className="text-xl sm:text-2xl shrink-0">{icon}</span>
          <div className="flex items-baseline gap-2">
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-content">
              {title}
            </h2>
            <span className="hidden sm:inline-block text-[11px] text-muted">
              {subTitle}
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold hidden md:inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            官方榜单
          </span>
        </div>

        {/* 右侧动作按钮组：换一批 + 查看更多 */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={handleRefreshNext}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted hover:text-content hover:bg-hover bg-chip/50 border border-line/50 transition-all active:scale-95 cursor-pointer touch-manipulation group select-none"
            title="换一批影片"
          >
            <svg
              className={cn(
                'w-3.5 h-3.5 transition-transform text-muted group-hover:text-accent',
                isFetching && 'animate-spin text-accent'
              )}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            <span className="group-hover:text-content">换一批</span>
          </button>

          <Link
            href={`/catalog?type=${channelId}`}
            className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent/80 transition-colors p-1 active:scale-95 cursor-pointer group"
          >
            <span>更多</span>
            <span className="transition-transform group-hover:translate-x-0.5">›</span>
          </Link>
        </div>
      </div>

      {/* 卡片栅格：手机端 2 列，平板 3~4 列，大屏 6 列（刚好 2 排 12 部最近更新剧集） */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] rounded-xl bg-chip/60 animate-pulse border border-line/40"
            />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div
          className={cn(
            'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 transition-opacity duration-300',
            isFetching ? 'opacity-60' : 'opacity-100'
          )}
        >
          {items.map((item) => (
            <DoubanCard
              key={item.id}
              item={{
                title: item.title,
                cover: item.cover,
                rating: item.rate,
                year: item.year,
              }}
              onClick={() => onPick(item.title, item.id, item.year)}
            />
          ))}
        </div>
      ) : (
        <div className="py-10 text-center text-xs text-muted border border-dashed border-line/50 rounded-xl bg-surface/30">
          暂无更新，点击“换一批”重试
        </div>
      )}
    </section>
  );
}
