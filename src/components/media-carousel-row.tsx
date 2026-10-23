'use client';

import { useRef } from 'react';
import Link from 'next/link';
import type { MediaItem } from '@/lib/media-library-service';
import { resolveEpisodeBadge } from '@/lib/media-library-service';
import { cn } from '@/lib/utils';
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
  /** 是否在桌面端右侧并排渲染 9zhoukj 同款「TOP 10 热播飙升榜」侧栏 */
  showHotRank?: boolean;
  rankTitle?: string;
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
  showHotRank = false,
  rankTitle,
}: MediaCarouselRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const clientWidth = scrollRef.current.clientWidth;
    const scrollAmount = direction === 'left' ? -clientWidth * 0.75 : clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  const rankItems = items.slice(0, 10);
  const topOne = rankItems[0];

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
          {!showHotRank && (
            <>
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
            </>
          )}

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

      {/* 主体展示区：支持纯横向滑轨 或 9zhoukj 左图右榜双栏布局 */}
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
        showHotRank ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px] gap-4 sm:gap-5 items-stretch">
            {/* 左侧：双行精选海报宫格（窄屏自适应为横向滑轨或双列） */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-3.5 content-start">
              {items.slice(0, 8).map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  cmsRemarksMap={cmsRemarksMap}
                  onClick={() => onPick(item)}
                />
              ))}
            </div>

            {/* 右侧：9zhoukj 经典「🔥 热播飙升榜 TOP 10」 */}
            <aside className="rounded-2xl bg-surface border border-line/70 p-3.5 sm:p-4 flex flex-col justify-between shadow-sm">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-line/60">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">🔥</span>
                    <h3 className="text-sm font-extrabold text-content tracking-tight">
                      {rankTitle || '热播飙升榜 TOP 10'}
                    </h3>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    实时热度
                  </span>
                </div>

                {/* NO.1 榜首带图高亮展位 */}
                {topOne && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onPick(topOne)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPick(topOne);
                      }
                    }}
                    className="group/top flex items-center gap-3 p-2 rounded-xl bg-chip/60 hover:bg-hover border border-line/60 hover:border-amber-500/40 transition-all cursor-pointer"
                  >
                    <div className="relative w-14 aspect-[2/3] rounded-lg overflow-hidden bg-chip shrink-0 shadow-sm">
                      {topOne.cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={topOne.cover}
                          alt={topOne.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover/top:scale-105 transition-transform duration-300"
                        />
                      )}
                      <span className="absolute top-0 left-0 px-1.5 py-0.5 rounded-br-md bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-[10px] leading-none">
                        NO.1
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-xs sm:text-sm font-bold text-content group-hover/top:text-accent truncate transition-colors">
                        {topOne.title}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        {topOne.rating && (
                          <span className="text-amber-400 font-bold font-mono">★ {topOne.rating}</span>
                        )}
                        <span className="text-muted truncate">
                          {resolveEpisodeBadge(topOne, cmsRemarksMap)}
                        </span>
                      </div>
                      <p className="text-[11px] text-faint line-clamp-1">
                        {topOne.card_subtitle || topOne.typeName || '全网热播榜首佳作'}
                      </p>
                    </div>
                  </div>
                )}

                {/* NO.2 ~ NO.10 紧凑单行金银铜升降列表 */}
                <div className="divide-y divide-line/30">
                  {rankItems.slice(1).map((item, idx) => {
                    const rankNum = idx + 2;
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onPick(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onPick(item);
                          }
                        }}
                        className="group/item py-2 px-1.5 flex items-center gap-2.5 hover:bg-hover/70 rounded-lg transition-colors cursor-pointer"
                      >
                        <span
                          className={cn(
                            'w-5 h-5 rounded-md text-[11px] font-extrabold font-mono flex items-center justify-center shrink-0',
                            rankNum === 2
                              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                              : rankNum === 3
                                ? 'bg-amber-600/20 text-amber-500 border border-amber-600/30'
                                : 'bg-chip text-muted'
                          )}
                        >
                          {rankNum}
                        </span>
                        <span className="flex-1 min-w-0 text-xs font-medium text-content group-hover/item:text-accent truncate transition-colors">
                          {item.title}
                        </span>
                        <span className="shrink-0 text-[11px] font-mono text-amber-400/90">
                          {item.rating ? `★ ${item.rating}` : resolveEpisodeBadge(item, cmsRemarksMap)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {moreHref && (
                <Link
                  href={moreHref}
                  className="mt-3 w-full py-1.5 rounded-xl bg-chip/70 hover:bg-hover text-center text-xs font-medium text-muted hover:text-content border border-line/50 transition-colors"
                >
                  查看完整榜单 ›
                </Link>
              )}
            </aside>
          </div>
        ) : (
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
        )
      ) : (
        <div className="py-8 text-center text-xs text-muted border border-dashed border-line/60 rounded-xl bg-surface/30">
          暂无影片更新…
        </div>
      )}
    </section>
  );
}
