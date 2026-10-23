'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SearchResultItem } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { SmartImage } from './smart-image';

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
  onOpen: (item: SearchResultItem, group: AggregatedGroup) => void;
}) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!group.pic && !imgFailed;

  const primaryItem = group.items[0];
  const sourceCount = Math.max(group.items.length, primaryItem?.matchedSources?.length || 1);
  const adult = useMemo(() => group.items.some((i) => i.isAdult), [group.items]);

  const activate = () => {
    // 搜索页面点击直接起播：进入播放页由内核流式秒播，不弹窗
    onOpen(primaryItem, group);
  };

  return (
    <div
      className="group relative flex flex-col rounded-xl overflow-hidden cursor-pointer bg-surface border border-line/60 hover:border-accent/60 hover:shadow-xl hover:-translate-y-1 active:scale-95 transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent focus-visible:-translate-y-1 select-none touch-manipulation"
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
          <span className="truncate">{group.typeName || '全网精选'}</span>
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
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!item.pic && !imgFailed;

  return (
    <div
      className="group relative flex flex-col rounded-xl overflow-hidden cursor-pointer bg-surface border border-line/60 hover:border-accent/60 hover:shadow-xl hover:-translate-y-1 active:scale-95 transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent focus-visible:-translate-y-1 select-none touch-manipulation"
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
          <span className="truncate">{item.typeName || '影视'}</span>
          <span className="text-accent font-medium shrink-0">播放 ›</span>
        </div>
      </div>
    </div>
  );
}

/** 豆瓣与片库推荐卡片（天涯影视+9zhoukj 影院级高质感：微浮起、景深阴影、剧集状态透出、悬浮立即播放） */
export function DoubanCard({
  item,
  onClick,
}: {
  item: { title: string; cover: string; rating?: string; episodes_info?: string; year?: string };
  onClick: () => void;
}) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [item.cover]);

  // 严格校验纯数字评分（如 7.1, 9.0），非数字文本一律不展示，防止长短评污染海报
  const numericRating = useMemo(() => {
    if (item.rating === undefined || item.rating === null) return null;
    const trimmed = String(item.rating).trim();
    if (!trimmed) return null;
    const num = parseFloat(trimmed);
    if (!Number.isNaN(num) && num > 0 && num <= 10 && /^\d+(\.\d+)?$/.test(trimmed)) {
      return num.toFixed(1);
    }
    return null;
  }, [item.rating]);

  // 非纯数字的角标状态（如“全80集”、“更新至12集”、“微短剧”、“AI精选”等）
  const statusBadge = useMemo(() => {
    if (numericRating) return null;
    const text = (item.episodes_info || item.rating || '').trim();
    if (!text || text === '0' || text === 'null') return null;
    return text.length > 8 ? `${text.slice(0, 8)}…` : text;
  }, [numericRating, item.episodes_info, item.rating]);

  return (
    <div
      className="group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer bg-surface/60 dark:bg-white/[0.03] backdrop-blur-xl border border-black/[0.07] dark:border-white/[0.09] hover:border-black/20 dark:hover:border-white/25 hover:shadow-2xl hover:shadow-black/30 hover:-translate-y-1.5 active:scale-95 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent focus-visible:-translate-y-1 touch-manipulation"
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
      <div className="relative aspect-[2/3] bg-chip/50 overflow-hidden">
        {item.cover && !imgFailed ? (
          <SmartImage
            url={item.cover}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            onExhausted={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-chip">
            <svg className="w-8 h-8 text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16m10-16v16M3 6a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm8 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6z" />
            </svg>
          </div>
        )}

        {/* 底部柔和暗影 */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 via-black/25 to-transparent pointer-events-none" />

        {/* 右上角 iOS 27 冰晶毛玻璃评分胶囊 */}
        {numericRating ? (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-xl text-[11px] text-amber-300 font-semibold border border-white/15 shadow-xs flex items-center gap-0.5 z-10">
            <span>★</span>
            <span>{numericRating}</span>
          </span>
        ) : statusBadge ? (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-xl text-[10px] text-white/90 font-medium border border-white/15 shadow-xs z-10">
            {statusBadge}
          </span>
        ) : null}

        {/* 鼠标悬停时的 Apple TV+ 冰白圆形播放浮层 */}
        <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center pointer-events-none z-10">
          <span className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-slate-950 text-xs font-semibold shadow-2xl transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            <span>▶</span>
            <span>立即播放</span>
          </span>
        </div>
      </div>

      <div className="p-2.5 sm:p-3 flex flex-col flex-1 justify-between">
        <div className="text-xs sm:text-sm font-semibold text-content line-clamp-1 leading-snug group-hover:text-accent transition-colors" title={item.title}>
          {item.title}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted mt-1">
          <span className="truncate">{item.episodes_info || statusBadge || 'TMDB 4K'}</span>
          {item.year && <span className="font-mono shrink-0 ml-1 text-faint">{item.year}</span>}
        </div>
      </div>
    </div>
  );
}
