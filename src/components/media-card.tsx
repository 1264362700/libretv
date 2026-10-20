'use client';

import { useMemo, useState } from 'react';
import type { MediaItem } from '@/lib/media-library-service';
import { resolveEpisodeBadge } from '@/lib/media-library-service';
import { cn } from '@/lib/utils';

export interface MediaCardProps {
  item: MediaItem;
  cmsRemarksMap?: Map<string, string>;
  onClick: () => void;
  className?: string;
  showSubtitle?: boolean;
}

/**
 * 标准影视海报卡片 (MediaCard)
 * 严格遵循 Netflix / Apple TV+ 暗黑流媒体规范：
 * 1. 2:3 黄金比例海报
 * 2. 顶部左右角标：[⭐ 8.9 金标] 与 [年份/类型]（毛玻璃半透明底色）
 * 3. 左下角：[🟢 更新至 18 集] 状态强提示呼吸灯胶囊
 * 4. 图片防裂图双保险：直连 -> weserv.nl 公共代理 -> 暗色 SVG 占位图
 * 5. hover 悬停时海报放大 1.05 倍并浮现「▶ 播放」图标
 */
export function MediaCard({
  item,
  cmsRemarksMap,
  onClick,
  className,
  showSubtitle = true,
}: MediaCardProps) {
  // 图片防裂图状态：0=直连, 1=weserv代理, 2=完全失效展示SVG兜底
  const [imgStage, setImgStage] = useState<0 | 1 | 2>(0);

  const imgSrc = useMemo(() => {
    if (!item.cover || imgStage === 2) return '';
    if (imgStage === 1) {
      return `https://images.weserv.nl/?url=${encodeURIComponent(item.cover)}&w=400&q=80`;
    }
    return item.cover;
  }, [item.cover, imgStage]);

  // 计算角标文本（优先级：采集源实时更新备注 > 豆瓣 episodes_info > 正则提取 > 年份）
  const episodeBadge = useMemo(() => {
    return resolveEpisodeBadge(item, cmsRemarksMap);
  }, [item, cmsRemarksMap]);

  // 格式化纯数字评分
  const ratingText = useMemo(() => {
    if (!item.rating) return null;
    const r = parseFloat(String(item.rating));
    return Number.isFinite(r) && r > 0 ? r.toFixed(1) : null;
  }, [item.rating]);

  // 顶部右侧标签（年份或类型）
  const topBadge = useMemo(() => {
    if (item.year && item.typeName) return `${item.year}/${item.typeName}`;
    if (item.year) return item.year;
    if (item.typeName) return item.typeName;
    return null;
  }, [item.year, item.typeName]);

  // 副标题（演员名单或剧情标签）
  const subtitleText = useMemo(() => {
    if (item.actors && item.actors.length > 0) {
      return item.actors.slice(0, 3).join(' / ');
    }
    return item.card_subtitle || item.remarks || '';
  }, [item.actors, item.card_subtitle, item.remarks]);

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl overflow-hidden cursor-pointer select-none',
        'bg-[#161F30]/80 border border-slate-700/40 hover:border-blue-500/50',
        'hover:shadow-2xl hover:shadow-black/50 hover:-translate-y-1.5 active:scale-95',
        'transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 touch-manipulation',
        className
      )}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* 2:3 黄金比例海报容器 */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-900/80">
        {imgSrc && imgStage !== 2 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={item.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgStage((prev) => (prev === 0 ? 1 : 2))}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800/70 p-4 text-center">
            <svg
              className="w-10 h-10 text-slate-600 mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 4v16m10-16v16M3 6a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm8 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6z"
              />
            </svg>
            <span className="text-[10px] text-slate-500 line-clamp-1">{item.title}</span>
          </div>
        )}

        {/* 顶部左右角标栏 */}
        <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none z-10 gap-1.5">
          {ratingText ? (
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md border border-white/10 text-amber-400 font-extrabold text-[11px] shadow-sm">
              <span>★</span>
              <span>{ratingText}</span>
            </span>
          ) : (
            <span />
          )}

          {topBadge && (
            <span className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md border border-white/10 text-slate-200 text-[10px] font-medium tracking-tight shadow-sm truncate max-w-[55%]">
              {topBadge}
            </span>
          )}
        </div>

        {/* 底部多层暗部渐变遮罩 */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/60 to-transparent pointer-events-none" />

        {/* 左下角：集数/状态呼吸灯强提示胶囊 */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950/85 backdrop-blur-md border border-slate-700/60 text-slate-100 text-[11px] font-medium shadow-sm max-w-full">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="truncate">{episodeBadge}</span>
          </span>

          {item.isRecent && (
            <span className="px-1.5 py-0.5 rounded bg-rose-600/90 text-white font-black text-[9px] uppercase tracking-wider shrink-0 shadow-sm">
              NEW
            </span>
          )}
        </div>

        {/* Hover 时悬浮浮现的半透明播放按钮 (Netflix 质感) */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1.5px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center pointer-events-none z-20">
          <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-600/50 transform scale-75 group-hover:scale-100 transition-transform duration-300">
            <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* 卡片底部标题与副文本 */}
      <div className="p-2.5 flex flex-col flex-1 justify-between gap-1">
        <h3
          className="text-xs sm:text-sm font-semibold text-slate-100 truncate group-hover:text-blue-400 transition-colors"
          title={item.title}
        >
          {item.title}
        </h3>
        {showSubtitle && subtitleText && (
          <p className="text-[11px] text-slate-400 truncate leading-relaxed">
            {subtitleText}
          </p>
        )}
      </div>
    </div>
  );
}
