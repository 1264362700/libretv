'use client';

import { useMemo } from 'react';
import type { MediaItem } from '@/lib/media-library-service';
import { useToast } from './toast';
import { SmartImage } from './smart-image';
import { usePosterCardData } from './use-poster-card-data';
import { useTranslation } from '@/lib/i18n';
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
 * 4. 图片加载统一走 SmartImage：直连优先，仅遇明确防盗链（403/418）时按配置降级代理
 * 5. hover 悬停时海报放大 1.05 倍并浮现「▶ 播放」图标
 */
export function MediaCard({
  item,
  cmsRemarksMap,
  onClick,
  className,
  showSubtitle = true,
}: MediaCardProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const {
    imageProxyMode,
    customImageProxy,
    setImgFailed,
    showImg,
    ratingText,
    episodeBadge,
    castLine,
    isFavorited,
    toggleFav,
  } = usePosterCardData(item, cmsRemarksMap);

  // 顶部右侧标签（年份或类型）
  const topBadge = useMemo(() => {
    if (item.year && item.typeName) return `${item.year}/${item.typeName}`;
    if (item.year) return item.year;
    if (item.typeName) return item.typeName;
    return null;
  }, [item.year, item.typeName]);

  // 副标题（演员阵容行，缺省回落到备注）
  const subtitleText = castLine || item.remarks || '';

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl overflow-hidden cursor-pointer select-none animate-stagger-up',
        'bg-surface border border-line/60 hover:border-accent/60',
        'hover:shadow-2xl hover:shadow-black/50 hover:-translate-y-1.5 active:scale-95',
        'transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent focus-visible:-translate-y-1 touch-manipulation',
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
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-chip">
        {showImg ? (
          <SmartImage
            url={item.cover}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            onExhausted={() => setImgFailed(true)}
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
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

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

        {/* Hover 时悬浮浮现的半透明播放按钮 + 9zhoukj 快捷追剧与剧情看点预览浮层 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/30 backdrop-blur-[1.5px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-2.5 pointer-events-none z-20">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                const added = await toggleFav();
                toast(
                  added ? `已将「${item.title}」加入追剧单` : `已将「${item.title}」移出追剧单`,
                  added ? 'success' : 'info'
                );
              }}
              className={cn(
                'pointer-events-auto px-2 py-0.5 rounded-full text-[10px] font-semibold border backdrop-blur-md transition-all cursor-pointer flex items-center gap-0.5 shadow-sm',
                isFavorited
                  ? 'bg-amber-500/85 text-slate-950 border-amber-300'
                  : 'bg-black/65 hover:bg-accent text-white border-white/20'
              )}
              title={isFavorited ? t('card.fav.remove') : t('card.fav.add')}
            >
              <span>{isFavorited ? '★' : '☆'}</span>
              <span>{isFavorited ? t('card.fav.active') : t('card.fav.inactive')}</span>
            </button>
          </div>

          <div className="self-center w-11 h-11 rounded-full bg-accent text-on-accent flex items-center justify-center shadow-xl shadow-accent/50 transform scale-75 group-hover:scale-100 transition-transform duration-300">
            <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>

          <div className="space-y-0.5 text-left">
            <p className="text-[10px] text-white/90 line-clamp-2 leading-snug font-medium">
              {item.card_subtitle || subtitleText || `${item.year || ''} ${item.typeName || t('card.quality.default')}`.trim()}
            </p>
          </div>
        </div>
      </div>

      {/* 卡片底部标题与副文本 */}
      <div className="p-2.5 flex flex-col flex-1 justify-between gap-1">
        <h3
          className="text-xs sm:text-sm font-semibold text-content truncate group-hover:text-accent transition-colors"
          title={item.title}
        >
          {item.title}
        </h3>
        {showSubtitle && subtitleText && (
          <p className="text-[11px] text-muted truncate leading-relaxed">
            {subtitleText}
          </p>
        )}
      </div>
    </div>
  );
}
