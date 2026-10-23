'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  checkHasNewEpisodes,
  db,
  markFavoriteSeenEpisodes,
  removeFavorite,
  removeHistory,
  upsertHistory,
  type FavoriteEntry,
  type HistoryEntry,
} from '@/lib/db';
import { resolveSource, useAppStore } from '@/lib/store';
import { buildWatchUrl, cn, formatRelativeTime, formatTime } from '@/lib/utils';
import { SmartImage } from './smart-image';
import { Icon } from './icon';
import { useToast } from './toast';

export interface ContinueWatchingRowProps {
  cmsRemarksMap?: Map<string, string>;
  onNavigate: (watchUrl: string) => void;
}

/**
 * 首页「继续观看 & 我的追剧单」单行横向滚动专区：
 * 1. 将原本深藏在右上角二级抽屉的观看历史前置为首屏单行横滚轨道，点击带 position 秒级续播；
 * 2. 支持「⭐ 我的追剧」收藏单，并结合 cmsRemarksMap 自动比对集数，点亮「🔴 更新 N 集」红点提醒。
 */
export function ContinueWatchingRow({ cmsRemarksMap, onNavigate }: ContinueWatchingRowProps) {
  const historyList = useLiveQuery(
    () => db.history.orderBy('timestamp').reverse().limit(16).toArray(),
    []
  );
  const favoritesList = useLiveQuery(
    () => db.favorites.orderBy('timestamp').reverse().limit(24).toArray(),
    []
  );

  const [activeTab, setActiveTab] = useState<'history' | 'favorites'>('history');
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasHistory = (historyList?.length ?? 0) > 0;
  const hasFavorites = (favoritesList?.length ?? 0) > 0;

  // 若历史为空但有追剧收藏，自动切至追剧 Tab
  useEffect(() => {
    if (!hasHistory && hasFavorites && activeTab === 'history') {
      setActiveTab('favorites');
    } else if (hasHistory && !hasFavorites && activeTab === 'favorites') {
      setActiveTab('history');
    }
  }, [hasHistory, hasFavorites, activeTab]);

  // 统计追剧单中有新集更新的剧集数
  const updatedFavCount = useMemo(() => {
    if (!favoritesList || favoritesList.length === 0) return 0;
    let count = 0;
    for (const fav of favoritesList) {
      const latestRemarks = cmsRemarksMap?.get(fav.title.trim()) || fav.remarks;
      const status = checkHasNewEpisodes(fav, latestRemarks);
      if (status.hasUpdate) count += 1;
    }
    return count;
  }, [favoritesList, cmsRemarksMap]);

  if (!hasHistory && !hasFavorites) {
    return null;
  }

  const scrollByOffset = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(320, Math.round(el.clientWidth * 0.75));
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <section className="space-y-3.5 animate-fade-in">
      {/* 头部：左侧标题 + 右侧「继续观看 / 我的追剧」胶囊切换与滚动箭头 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl sm:text-2xl select-none shrink-0" aria-hidden>
            ⏯️
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-extrabold text-content tracking-tight">
                {activeTab === 'history' ? '继续观看 · 无缝续播' : '我的追剧 · 更新提醒'}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                {activeTab === 'history'
                  ? `${historyList?.length ?? 0} 部在看`
                  : `${favoritesList?.length ?? 0} 部在追`}
              </span>
              {updatedFavCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  {updatedFavCount} 部有新集
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-muted truncate mt-0.5">
              {activeTab === 'history'
                ? '点击直接恢复上次播放集数与精确秒数'
                : '自动比对采集源最新连载进度，新集更新第一时间红点提醒'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          <div className="inline-flex items-center p-1 rounded-xl bg-surface border border-line/60">
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5',
                activeTab === 'history'
                  ? 'bg-accent text-on-accent shadow-sm'
                  : 'text-muted hover:text-content'
              )}
            >
              <span>▶ 继续观看</span>
              {hasHistory && <span className="text-[10px] opacity-80">({historyList!.length})</span>}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('favorites')}
              className={cn(
                'relative px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5',
                activeTab === 'favorites'
                  ? 'bg-accent text-on-accent shadow-sm'
                  : 'text-muted hover:text-content'
              )}
            >
              <span>⭐ 我的追剧</span>
              {hasFavorites && <span className="text-[10px] opacity-80">({favoritesList!.length})</span>}
              {updatedFavCount > 0 && (
                <span
                  className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-surface"
                  title={`${updatedFavCount} 部剧集有新集更新`}
                />
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollByOffset('left')}
              className="w-7 h-7 rounded-lg bg-surface hover:bg-hover border border-line/60 flex items-center justify-center text-muted hover:text-content transition-colors cursor-pointer"
              aria-label="向左滚动"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => scrollByOffset('right')}
              className="w-7 h-7 rounded-lg bg-surface hover:bg-hover border border-line/60 flex items-center justify-center text-muted hover:text-content transition-colors cursor-pointer"
              aria-label="向右滚动"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* 单行横向滚动卡片轨道（严禁折行） */}
      <div
        ref={scrollRef}
        className="flex items-stretch gap-3 sm:gap-3.5 overflow-x-auto no-scrollbar scroll-smooth pb-2 pt-0.5"
      >
        {activeTab === 'history' ? (
          hasHistory ? (
            historyList!.map((item) => (
              <ContinueHistoryCard
                key={item.id}
                item={item}
                onNavigate={onNavigate}
              />
            ))
          ) : (
            <div className="w-full py-6 text-center text-xs text-faint bg-surface/50 rounded-xl border border-line/40">
              暂无近期观看记录，快去挑选一部喜欢的影片吧
            </div>
          )
        ) : hasFavorites ? (
          favoritesList!.map((fav) => (
            <FavoriteWatchCard
              key={fav.id}
              fav={fav}
              latestRemarks={cmsRemarksMap?.get(fav.title.trim())}
              onNavigate={onNavigate}
            />
          ))
        ) : (
          <div className="w-full py-6 text-center text-xs text-faint bg-surface/50 rounded-xl border border-line/40">
            追剧单为空，可在播放页顶部点击「⭐ 追剧」收藏连载剧集，更新时将自动提醒
          </div>
        )}
      </div>
    </section>
  );
}

function ContinueHistoryCard({
  item,
  onNavigate,
}: {
  item: HistoryEntry;
  onNavigate: (url: string) => void;
}) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const { toast } = useToast();
  const [imgFailed, setImgFailed] = useState(false);

  const source = resolveSource({ customAPIs, envSources }, item.sourceKey);
  const hasPercent =
    item.playbackPosition > 5 && item.duration > 0 && item.playbackPosition < item.duration * 0.98;
  const percent = hasPercent ? Math.min(98, Math.max(4, Math.round((item.playbackPosition / item.duration) * 100))) : 0;

  const watchUrl = buildWatchUrl({
    sourceKey: item.sourceKey,
    vodId: item.vodId,
    index: item.episodeIndex,
    title: item.title,
    sourceUrl: source?.url || item.sourceUrl,
    detail: source?.detail,
    position: item.playbackPosition > 5 ? Math.floor(item.playbackPosition) : undefined,
  });

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    void removeHistory(item.sourceKey, item.vodId).then(() => {
      toast(`已移除「${item.title}」续播记录`, 'info', {
        action: {
          label: '撤销',
          onClick: () => {
            void upsertHistory({
              sourceKey: item.sourceKey,
              sourceUrl: item.sourceUrl,
              vodId: item.vodId,
              title: item.title,
              pic: item.pic,
              episodeIndex: item.episodeIndex,
              totalEpisodes: item.totalEpisodes,
              playbackPosition: item.playbackPosition,
              duration: item.duration,
              timestamp: item.timestamp,
            });
          },
        },
      });
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(watchUrl)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onNavigate(watchUrl);
        }
      }}
      className="group relative w-[132px] sm:w-[152px] md:w-[164px] shrink-0 flex flex-col rounded-xl overflow-hidden cursor-pointer bg-surface border border-line/60 hover:border-accent/60 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-chip">
        {item.pic && !imgFailed ? (
          <SmartImage
            url={item.pic}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onExhausted={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-faint">
            <span className="text-2xl mb-1">🎬</span>
            <span className="text-[10px] line-clamp-2">{item.title}</span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/90 via-black/45 to-transparent pointer-events-none" />

        {/* 右上角移除按钮 */}
        <button
          type="button"
          onClick={handleRemove}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-rose-600 text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all z-20 cursor-pointer"
          title="移除此条继续观看"
          aria-label="移除此条继续观看"
        >
          <Icon name="close" className="w-3.5 h-3.5" />
        </button>

        {/* 左上角相对时间 */}
        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] text-slate-200 border border-white/10 z-10">
          {formatRelativeTime(item.timestamp)}
        </span>

        {/* 左下角集数与时间戳 */}
        <div className="absolute bottom-2.5 inset-x-2 flex items-center justify-between text-[10px] text-white font-medium z-10">
          <span className="truncate">
            {item.totalEpisodes > 1 ? `第 ${item.episodeIndex + 1}/${item.totalEpisodes} 集` : '正片'}
          </span>
          {item.playbackPosition > 5 && (
            <span className="font-mono text-accent shrink-0 ml-1">
              {formatTime(item.playbackPosition)}
            </span>
          )}
        </div>

        {/* 底部播放进度条 */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20 z-10">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${percent || 12}%` }}
          />
        </div>
      </div>

      <div className="p-2 sm:p-2.5 flex flex-col justify-between gap-0.5">
        <h3 className="text-xs sm:text-sm font-semibold text-content truncate group-hover:text-accent transition-colors">
          {item.title}
        </h3>
        <p className="text-[11px] text-muted truncate flex items-center justify-between">
          <span>▶ 继续播放</span>
          {percent > 0 && <span className="text-[10px] font-mono text-faint">已看 {percent}%</span>}
        </p>
      </div>
    </div>
  );
}

function FavoriteWatchCard({
  fav,
  latestRemarks,
  onNavigate,
}: {
  fav: FavoriteEntry;
  latestRemarks?: string;
  onNavigate: (url: string) => void;
}) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const { toast } = useToast();
  const [imgFailed, setImgFailed] = useState(false);

  const updateInfo = useMemo(
    () => checkHasNewEpisodes(fav, latestRemarks),
    [fav, latestRemarks]
  );

  const handleOpen = () => {
    if (updateInfo.latestTotal > 0) {
      void markFavoriteSeenEpisodes(fav.title, updateInfo.latestTotal, latestRemarks || fav.remarks);
    }
    const watchUrl = buildWatchUrl({
      title: fav.title,
      year: fav.year,
      sourceKey: fav.sourceKey,
      vodId: fav.vodId,
      sourceUrl: fav.sourceUrl,
    });
    onNavigate(watchUrl);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    void removeFavorite(fav.id).then(() => {
      toast(`已将「${fav.title}」移出追剧单`, 'info');
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpen();
        }
      }}
      className="group relative w-[132px] sm:w-[152px] md:w-[164px] shrink-0 flex flex-col rounded-xl overflow-hidden cursor-pointer bg-surface border border-line/60 hover:border-accent/60 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-chip">
        {fav.pic && !imgFailed ? (
          <SmartImage
            url={fav.pic}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={fav.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onExhausted={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-faint">
            <span className="text-2xl mb-1">⭐</span>
            <span className="text-[10px] line-clamp-2">{fav.title}</span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 via-black/35 to-transparent pointer-events-none" />

        {/* 左上角：新集更新红点呼吸胶囊 或 追剧中标记 */}
        {updateInfo.hasUpdate ? (
          <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-rose-600/95 text-white font-bold text-[10px] shadow-md flex items-center gap-1 z-10 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            <span>更新 {updateInfo.newCount} 集</span>
          </span>
        ) : (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-amber-400 font-semibold text-[10px] border border-white/10 z-10">
            ★ 追剧中
          </span>
        )}

        {/* 右上角取消追剧按钮 */}
        <button
          type="button"
          onClick={handleRemove}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-rose-600 text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all z-20 cursor-pointer"
          title="移出追剧单"
          aria-label="移出追剧单"
        >
          <Icon name="close" className="w-3.5 h-3.5" />
        </button>

        {/* 左下角：最新集数备注 */}
        <div className="absolute bottom-1.5 inset-x-1.5 z-10">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/80 text-emerald-400 text-[10px] font-medium max-w-full truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="truncate">{latestRemarks || fav.remarks || '连载更新中'}</span>
          </span>
        </div>
      </div>

      <div className="p-2 sm:p-2.5 flex flex-col justify-between gap-0.5">
        <h3 className="text-xs sm:text-sm font-semibold text-content truncate group-hover:text-accent transition-colors">
          {fav.title}
        </h3>
        <p className="text-[11px] text-muted truncate">
          {updateInfo.hasUpdate ? (
            <span className="text-rose-400 font-semibold">立即看最新集 ›</span>
          ) : (
            <span>点击进入播放 ›</span>
          )}
        </p>
      </div>
    </div>
  );
}
