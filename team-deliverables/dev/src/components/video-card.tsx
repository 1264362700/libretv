'use client';

import { useMemo, useState } from 'react';
import type { SearchResultItem } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import { SmartImage } from './smart-image';
import { usePosterCardData } from './use-poster-card-data';

// —— 跨源同名聚合 ——

export interface AggregatedGroup {
  key: string;
  name: string;
  year?: string;
  typeName?: string;
  pic?: string;
  remarks?: string;
  items: SearchResultItem[];
}

function buildGroup(name: string, year: string | undefined, items: SearchResultItem[]): AggregatedGroup {
  return {
    key: `${name}|${year ?? ''}|${items.map((i) => `${i.sourceKey}_${i.vodId}`).join(',')}`,
    name,
    year,
    typeName: items.find((i) => i.typeName)?.typeName,
    pic: items.find((i) => i.pic)?.pic,
    remarks: items.find((i) => i.remarks)?.remarks,
    items,
  };
}

/**
 * 把扁平的跨源搜索结果按「同名影片」聚合：
 * - 以名称分桶；桶内年份不一致时（同名翻拍）按年份拆分，无年份的条目并入年份桶；
 * - 保持传入顺序（搜索结果已按名称排序）。
 */
export function aggregateResults(list: SearchResultItem[]): AggregatedGroup[] {
  const byName = new Map<string, SearchResultItem[]>();
  for (const item of list) {
    const k = (item.name || '').trim();
    if (!k) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(item);
  }
  const groups: AggregatedGroup[] = [];
  for (const [name, items] of byName) {
    const years = [...new Set(items.map((i) => i.year).filter(Boolean))] as string[];
    if (years.length > 1) {
      for (const y of years) {
        groups.push(buildGroup(name, y, items.filter((i) => i.year === y)));
      }
      const noYear = items.filter((i) => !i.year);
      if (noYear.length) groups.push(buildGroup(name, undefined, noYear));
    } else {
      groups.push(buildGroup(name, years[0], items));
    }
  }
  return groups;
}

/**
 * 聚合影片卡片（现代流媒体 2:3 黄金比例海报竖卡）：
 * 彻底解决横向切分造成的文字挤压错位与折行；
 * 具备评分/源聚合胶囊、状态呼吸灯、Hover 立即播放微交互，
 * 点击直接进入播放页秒开，绝不弹窗。
 */
export function AggregatedCard({
  group,
  onOpen,
}: {
  group: AggregatedGroup;
  /** 点击卡片直接起播；调用方通过闭包携带 group 上下文 */
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!group.pic && !imgFailed;

  const primaryItem = group.items[0];
  const sourceCount = Math.max(group.items.length, primaryItem?.matchedSources?.length || 1);
  const adult = useMemo(() => group.items.some((i) => i.isAdult), [group.items]);

  const activate = () => {
    // 搜索页面点击直接起播：进入播放页由内核流式秒播，不弹窗
    onOpen();
  };

  return (
    <div
      className="group relative flex flex-col rounded-xl overflow-hidden cursor-pointer bg-surface border border-line/60 hover:border-accent/60 hover:shadow-xl hover:-translate-y-1 active:scale-95 transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent focus-visible:-translate-y-1 select-none touch-manipulation animate-stagger-up"
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      {/* 2:3 黄金比例封面海报区 */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-chip">
        {showImg ? (
          <SmartImage
            url={group.pic}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={group.name}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            onExhausted={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-chip p-4 text-center">
            <svg className="w-8 h-8 text-faint mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16m10-16v16M3 6a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm8 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6z" />
            </svg>
            <span className="text-[10px] text-faint font-medium">暂无海报</span>
          </div>
        )}

        {/* 底部暗部多层渐变 */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

        {/* 左上角：源聚合胶囊 */}
        {sourceCount > 1 ? (
          <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-accent font-bold text-[10px] sm:text-[11px] border border-accent/30 shadow-sm z-10">
            {sourceCount} 源聚合
          </span>
        ) : primaryItem?.sourceName ? (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-muted font-medium text-[10px] border border-white/10 shadow-sm z-10 truncate max-w-[90px]">
            {primaryItem.sourceName}
          </span>
        ) : null}

        {/* 右上角：年份标签或成人标记 */}
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10">
          {adult && (
            <span className="px-1.5 py-0.5 rounded-md bg-rose-600/90 text-white font-bold text-[10px] shadow-sm">
              18+
            </span>
          )}
          {group.year && (
            <span className="px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-purple-300 font-semibold text-[10px] sm:text-[11px] border border-white/10 shadow-sm">
              {group.year}
            </span>
          )}
        </div>

        {/* 左下角：实时集数状态呼吸灯胶囊 */}
        {group.remarks && (
          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center pointer-events-none z-10">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-emerald-500/40 text-emerald-400 text-[10px] sm:text-[11px] font-medium shadow-sm max-w-full truncate">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="truncate">{group.remarks}</span>
            </span>
          </div>
        )}

        {/* Hover 时悬浮的播放按钮 */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center pointer-events-none z-20">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-on-accent text-xs font-bold shadow-xl shadow-accent/40 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            <span>▶</span>
            <span>极速播放</span>
          </div>
        </div>
      </div>

      {/* 底部信息区 */}
      <div className="p-2 sm:p-2.5 flex flex-col flex-1 justify-between gap-1">
        <h3
          className="text-xs sm:text-sm font-semibold text-content line-clamp-1 group-hover:text-accent transition-colors"
          title={group.name}
        >
          {group.name}
        </h3>
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span className="truncate">{group.typeName || t('card.type.default')}</span>
          <span className="text-accent font-medium shrink-0 flex items-center gap-0.5">
            <span>秒播</span>
            <span>›</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** 影片卡片：封面加载失败时逐级降级到占位图（未聚合的单一结果使用，采用 2:3 黄金比例海报竖卡） */
export function VideoCard({ item, onClick }: { item: SearchResultItem; onClick: () => void }) {
  const { t } = useTranslation();
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!item.pic && !imgFailed;

  return (
    <div
      className="group relative flex flex-col rounded-xl overflow-hidden cursor-pointer bg-surface border border-line/60 hover:border-accent/60 hover:shadow-xl hover:-translate-y-1 active:scale-95 transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent focus-visible:-translate-y-1 select-none touch-manipulation animate-stagger-up"
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
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-chip">
        {showImg ? (
          <SmartImage
            url={item.pic}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            onExhausted={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-chip p-4 text-center">
            <svg className="w-8 h-8 text-faint mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16m10-16v16M3 6a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm8 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6z" />
            </svg>
            <span className="text-[10px] text-faint font-medium">暂无海报</span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

        {item.sourceName && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-muted font-medium text-[10px] border border-white/10 shadow-sm z-10 truncate max-w-[90px]">
            {item.sourceName}
          </span>
        )}

        {item.year && (
          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-purple-300 font-semibold text-[10px] border border-white/10 shadow-sm z-10">
            {item.year}
          </span>
        )}

        {item.remarks && (
          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center pointer-events-none z-10">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-line text-slate-300 text-[10px] font-medium shadow-sm max-w-full truncate">
              <span className="truncate">{item.remarks}</span>
            </span>
          </div>
        )}
      </div>

      <div className="p-2 sm:p-2.5 flex flex-col flex-1 justify-between gap-1">
        <h3 className="text-xs sm:text-sm font-semibold text-content line-clamp-1 group-hover:text-accent transition-colors" title={item.name}>
          {item.name}
        </h3>
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span className="truncate">{item.typeName || t('card.typeName.default')}</span>
          <span className="text-accent font-medium shrink-0">播放 ›</span>
        </div>
      </div>
    </div>
  );
}

/**
 * NovaTV Cinema Ultra 海报悬停卡片 (MediaCard)
 * 桌面端悬停即时透出：剧情看点 (overview)、主演/制作阵容 (actors/card_subtitle)、立即播放与一键追剧按钮
 */
export function DoubanCard({
  item,
  cmsRemarksMap,
  onClick,
}: {
  item: {
    id?: string;
    title: string;
    cover: string;
    rating?: string;
    episodes_info?: string;
    year?: string;
    card_subtitle?: string;
    overview?: string;
    actors?: string[];
    isTv?: boolean;
    category?: string;
    typeName?: string;
    remarks?: string;
  };
  cmsRemarksMap?: Map<string, string>;
  onClick: () => void;
}) {
  const {
    imageProxyMode,
    customImageProxy,
    showImg,
    setImgFailed,
    ratingText,
    episodeBadge,
    castLine,
    isFavorited,
    toggleFav,
  } = usePosterCardData(item, cmsRemarksMap);
  const { t } = useTranslation();

  const statusBadge = episodeBadge;
  const castOrSubtitle = castLine || `${item.year || '2026'} · ${t('hero.quality4k')}`;

  const plotSummary = useMemo(() => {
    if (item.overview && item.overview.trim()) {
      return item.overview.trim();
    }
    return t('hero.tagline');
  }, [item.overview, t]);

  const handleToggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleFav();
  };

  return (
    <div
      className="group relative flex flex-col cursor-pointer select-none touch-manipulation animate-stagger-up"
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
      <div className="block relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-slate-800 border border-white/5 group-hover:border-amber-400/70 transition-all duration-300 shadow-md group-hover:shadow-glow-gold group-hover:-translate-y-1">
        {showImg ? (
          <SmartImage
            url={item.cover}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={item.title}
            className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500 ease-out"
            onExhausted={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-800">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16m10-16v16M3 6a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm8 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6z" />
            </svg>
          </div>
        )}

        {/* 默认态渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-transparent to-black/20 opacity-80 group-hover:opacity-0 transition-opacity pointer-events-none" />

        {/* 顶部角标（年份 + 集数状态） */}
        <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none z-10">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/90 text-slate-950 shadow-sm">
            {item.year || '4K'}
          </span>

          {statusBadge && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/65 backdrop-blur-md text-emerald-400 border border-emerald-500/25">
              {statusBadge}
            </span>
          )}
        </div>

        {/* 默认态左下角评分角标 */}
        {ratingText && (
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-amber-400 text-xs font-bold border border-amber-500/30 group-hover:opacity-0 transition-opacity">
            <span>★</span>
            <span>{ratingText}</span>
          </div>
        )}

        {/* 桌面端悬停信息层：即时透出剧情看点、主演/阵容与一键追剧按钮 */}
        <div className="absolute inset-0 z-20 flex flex-col justify-end p-3 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/92 to-[#0B0F19]/45 backdrop-blur-[3px] opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="space-y-1.5 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            <div className="flex items-center justify-between gap-1.5">
              <h4 className="text-xs sm:text-sm font-bold text-white truncate">{item.title}</h4>
              {ratingText && (
                <span className="text-xs font-bold text-amber-400 shrink-0">★ {ratingText}</span>
              )}
            </div>

            {/* 主演阵容 / 分类标签 */}
            <p className="text-[11px] text-amber-300/90 font-medium truncate">{castOrSubtitle}</p>

            {/* 剧情看点简介 */}
            <p className="text-[11px] text-slate-300/95 line-clamp-3 leading-relaxed">
              {plotSummary}
            </p>

            {/* 立即播放 + 一键追剧 双动作按钮 */}
            <div className="flex items-center gap-1.5 pt-1.5">
              <span className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1 shadow-glow-gold">
                <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>立即播放</span>
              </span>
              <button
                type="button"
                onClick={handleToggleFav}
                title={isFavorited ? t('card.fav.remove') : t('card.fav.add')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                  isFavorited
                    ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                    : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                }`}
              >
                <span>{isFavorited ? '★' : '＋'}</span>
                <span>{isFavorited ? t('card.fav.active') : t('card.fav.inactive')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 底部常规片名与副标题 */}
      <div className="mt-2.5 space-y-0.5 px-0.5">
        <div
          className="text-xs sm:text-sm font-semibold text-content group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors line-clamp-1"
          title={item.title}
        >
          {item.title}
        </div>
        <p className="text-[11px] text-muted truncate">
          {castOrSubtitle}
        </p>
      </div>
    </div>
  );
}
