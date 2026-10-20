'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { DoubanCard } from './video-card';
import { triggerTopProgress } from './top-progress-bar';
import { cn } from '@/lib/utils';

interface ChannelHomeSectionProps {
  title: string;
  icon: string;
  channelId: 'movie' | 'tv' | 'short_drama' | 'ai' | 'anime' | 'variety' | 'documentary';
  subTitle: string;
  onPick: (title: string) => void;
}

const DEFAULT_SOURCE_URL = 'https://tyyszyapi.com/api.php/provide/vod';

/**
 * 首页各个栏目双排卡片组件（每个栏目两列/两排最近更新剧集 + 换一批 + 更多跳转）：
 * 1. 桌面端 2 排 x 6 列（共 12 部），移动端自适应 2 列；
 * 2. 右侧提供「换一批」与「查看更多 ›」直达对应频道大厅；
 * 3. 点击「换一批」提供 0ms 即时旋转加载反馈与平滑淡入淡出过渡。
 */
export function ChannelHomeSection({
  title,
  icon,
  channelId,
  subTitle,
  onPick,
}: ChannelHomeSectionProps) {
  const [page, setPage] = useState(1);
  const yellowFilter = useAppStore((s) => s.yellowFilter);

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ['home-channel-section', channelId, page, yellowFilter],
    queryFn: async ({ signal }) => {
      try {
        const keyword = channelId === 'ai' ? 'AI' : undefined;
        const res = await api.cmsCatalog(
          {
            url: DEFAULT_SOURCE_URL,
            type: channelId,
            keyword,
            page,
            pageSize: 12,
            filterAdult: yellowFilter,
          },
          signal
        );
        if (res.items && res.items.length > 0) {
          return res.items.slice(0, 12);
        }
      } catch (err) {
        console.warn(`[ChannelHomeSection] 获取 ${channelId} 失败:`, err);
      }

      // 降级兜底：豆瓣/360 热榜
      try {
        if (channelId === 'short_drama') {
          const res = await api.hotList('short_drama', signal, (page - 1) * 12);
          return res.items.slice(0, 12);
        }
        if (channelId === 'ai') {
          const res = await api.douban('movie', '科幻', (page - 1) * 12, 12, signal);
          return res.items.slice(0, 12);
        }
        const res = await api.douban(channelId, '热门', (page - 1) * 12, 12, signal);
        return res.items.slice(0, 12);
      } catch {
        return [];
      }
    },
    staleTime: 3 * 60_000,
  });

  const handleRefreshNext = () => {
    triggerTopProgress();
    setPage((prev) => (prev >= 10 ? 1 : prev + 1));
  };

  const items = data ?? [];

  return (
    <section className="space-y-3.5 pt-2">
      {/* 栏目头部：图标 + 标题 + 最近更新标 + 右侧（换一批 + 更多跳转） */}
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
          <span className="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-[10px] font-semibold hidden md:inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            最近更新
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
            <div key={i} className="aspect-[2/3] rounded-xl bg-chip/60 animate-pulse border border-line/40" />
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
              item={item}
              onClick={() => onPick(item.title)}
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
