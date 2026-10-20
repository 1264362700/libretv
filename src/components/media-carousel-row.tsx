'use client';

import { useRef } from 'react';
import Link from 'next/link';
import type { MediaItem } from '@/lib/media-library-service';
import { MediaCard } from './media-card';

export interface MediaCarouselRowProps {
  title: string;
  subTitle?: string;
  icon?: string;
  badge?: string;
  moreHref?: string;
  items: MediaItem[];
  cmsRemarksMap?: Map<string, string>;
  onPick: (item: MediaItem) => void;
  isLoading?: boolean;
}

/**
 * 影视横向滑动海报轨道 (MediaCarouselRow)
 * 经典流媒体交互：
 * 1. 轨道标题 + 图标 + 副标题 + 查看更多链接
 * 2. 左右方向翻页按钮（鼠标 hover 浮现）
 * 3. 横向滚动无损吸附展示
 */
export function MediaCarouselRow({
  title,
  subTitle,
  icon,
  badge,
  moreHref,
  items,
  cmsRemarksMap,
  onPick,
  isLoading,
}: MediaCarouselRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const clientWidth = scrollRef.current.clientWidth;
    const scrollAmount = direction === 'left' ? -clientWidth * 0.75 : clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  return (
    <section className="space-y-3 pt-3 group/row">
      {/* 轨道头部栏 */}
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <div className="flex items-center gap-2">
          {icon && <span className="text-xl sm:text-2xl shrink-0">{icon}</span>}
          <div>
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-content flex items-center gap-2">
              <span>{title}</span>
              {badge && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30">
                  {badge}
                </span>
              )}
            </h2>
            {subTitle && <p className="text-[11px] text-muted">{subTitle}</p>}
          </div>
        </div>

        {/* 右侧动作：左右箭头 + 更多 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="w-8 h-8 rounded-full bg-chip hover:bg-hover text-muted hover:text-content border border-line/60 flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 cursor-pointer hidden sm:flex"
            title="向左滚动"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="w-8 h-8 rounded-full bg-chip hover:bg-hover text-muted hover:text-content border border-line/60 flex items-center justify-center transition-all opacity-0 group-hover/row:opacity-100 cursor-pointer hidden sm:flex"
            title="向右滚动"
          >
            ›
          </button>

          {moreHref && (
            <Link
              href={moreHref}
              className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover transition-colors p-1 group"
            >
              <span>更多</span>
              <span className="transition-transform group-hover:translate-x-0.5">›</span>
            </Link>
          )}
        </div>
      </div>

      {/* 横向滚动列表 */}
      {isLoading ? (
        <div className="flex gap-3 sm:gap-4 overflow-hidden py-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-[140px] sm:w-[170px] md:w-[190px] shrink-0 aspect-[2/3] rounded-xl bg-chip animate-pulse border border-line/40"
            />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div
          ref={scrollRef}
          className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar scroll-smooth py-1 px-0.5"
        >
          {items.map((item) => (
            <div
              key={item.id}
              className="w-[140px] sm:w-[170px] md:w-[190px] shrink-0"
            >
              <MediaCard
                item={item}
                cmsRemarksMap={cmsRemarksMap}
                onClick={() => onPick(item)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-muted border border-dashed border-line/60 rounded-xl bg-surface/30">
          暂无影片更新…
        </div>
      )}
    </section>
  );
}
