'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { TmdbMediaItem } from '@/lib/tmdb';
import { DoubanCard } from './video-card';

interface TmdbApiResponse {
  items: TmdbMediaItem[];
  total: number;
  totalPages: number;
  page: number;
}

async function fetchTmdbClient(
  params: {
    type: string;
    area?: string;
    genre?: string;
    year?: string;
    sort?: string;
    page?: number;
  },
  signal?: AbortSignal
): Promise<TmdbApiResponse> {
  const sp = new URLSearchParams({
    type: params.type,
    page: String(params.page || 1),
    sort: params.sort || 'recommend',
  });
  if (params.area && params.area !== '全部') sp.set('area', params.area);
  if (params.genre && params.genre !== '全部') sp.set('genre', params.genre);
  if (params.year && params.year !== '全部') sp.set('year', params.year);

  const res = await fetch(`/api/tmdb?${sp.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(`TMDB 请求失败 (${res.status})`);
  }
  return res.json();
}

const MOVIE_CATEGORIES: {
  label: string;
  area?: string;
  genre?: string;
  sort?: 'recommend' | 'rank' | 'time';
}[] = [
  { label: '最新院线', sort: 'recommend' },
  { label: '动作', genre: '动作', sort: 'recommend' },
  { label: '科幻', genre: '科幻', sort: 'recommend' },
  { label: '悬疑', genre: '悬疑', sort: 'recommend' },
  { label: '华语精选', area: '大陆', sort: 'recommend' },
  { label: '高分榜单', sort: 'rank' },
];

const TV_CATEGORIES: {
  label: string;
  area?: string;
  genre?: string;
  sort?: 'recommend' | 'rank' | 'time';
}[] = [
  { label: '热门连续剧', sort: 'recommend' },
  { label: '悬疑', genre: '悬疑', sort: 'recommend' },
  { label: '科幻', genre: '科幻', sort: 'recommend' },
  { label: '欧美大剧', area: '美国', sort: 'recommend' },
  { label: '日韩剧集', area: '韩国', sort: 'recommend' },
  { label: '高分口碑', sort: 'rank' },
];

/**
 * NovaTV Cinema Ultra 首页双层影视大厅：
 * Floor 1: 今日重磅热播 (左侧 4x2 海报网格 + 右侧 热播飙升榜 TOP 10 含 NO.1 宽幅大图)
 * Floor 2: 热播剧集专区 (连载同步更新 · 蓝光臻彩)
 */
export function RecommendSection({ onPick }: { onPick: (title: string) => void }) {
  const [activeMovieTab, setActiveMovieTab] = useState(MOVIE_CATEGORIES[0]);
  const [activeTvTab, setActiveTvTab] = useState(TV_CATEGORIES[0]);

  // Floor 1 左侧：今日重磅热播电影
  const movieQuery = useQuery({
    queryKey: [
      'novatv-floor-movies',
      activeMovieTab.label,
      activeMovieTab.area,
      activeMovieTab.genre,
      activeMovieTab.sort,
    ],
    queryFn: ({ signal }) =>
      fetchTmdbClient(
        {
          type: 'movie',
          area: activeMovieTab.area,
          genre: activeMovieTab.genre,
          sort: activeMovieTab.sort,
          page: 1,
        },
        signal
      ),
    staleTime: 5 * 60_000,
  });

  // Floor 1 右侧：热播飙升榜 TOP 10 (TMDB Trending)
  const top10Query = useQuery({
    queryKey: ['novatv-top10-ranking'],
    queryFn: ({ signal }) => fetchTmdbClient({ type: 'trending', page: 1 }, signal),
    staleTime: 10 * 60_000,
  });

  // Floor 2：热播剧集专区
  const tvQuery = useQuery({
    queryKey: [
      'novatv-floor-tv',
      activeTvTab.label,
      activeTvTab.area,
      activeTvTab.genre,
      activeTvTab.sort,
    ],
    queryFn: ({ signal }) =>
      fetchTmdbClient(
        {
          type: 'tv',
          area: activeTvTab.area,
          genre: activeTvTab.genre,
          sort: activeTvTab.sort,
          page: 1,
        },
        signal
      ),
    staleTime: 5 * 60_000,
  });

  const movieItems = (movieQuery.data?.items ?? []).slice(0, 8);
  const rankingItems = (top10Query.data?.items ?? []).slice(0, 10);
  const tvItems = (tvQuery.data?.items ?? []).slice(0, 8);

  return (
    <div className="space-y-4">
      {/* Floor 1: 今日重磅热播 (左侧 8 部海报网格 + 右侧 TOP 10 热播飙升榜) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-2 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 rounded-full bg-amber-400 shadow-glow-gold" />
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                今日重磅热播
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">全网聚合高分资源 · 每日精选更新</p>
            </div>
          </div>

          {/* Filter Pills & View More */}
          <div className="flex items-center justify-between sm:justify-end gap-3">
            <div className="flex items-center gap-1 overflow-x-auto py-1 no-scrollbar">
              {MOVIE_CATEGORIES.map((cat) => {
                const isActive = activeMovieTab.label === cat.label;
                return (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() => setActiveMovieTab(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-glow-gold'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            <Link
              href="/catalog?type=movie"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-400 font-medium transition-colors shrink-0 group"
            >
              <span>更多</span>
              <span className="group-hover:translate-x-0.5 transition-transform">›</span>
            </Link>
          </div>
        </div>

        {/* Main Double-Column Layout: Left Grid + Right TOP 10 Ranking */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Media Poster Grid (Span 8 or 9 cols on large screen) */}
          <div className="lg:col-span-8 xl:col-span-9">
            {movieQuery.isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="aspect-[2/3] rounded-xl bg-slate-800/60 animate-pulse border border-white/5"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
                {movieItems.map((item) => (
                  <DoubanCard
                    key={item.id}
                    item={item}
                    onClick={() => onPick(item.title)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right Column: NovaTV TOP 10 Ranking Board */}
          <div className="lg:col-span-4 xl:col-span-3 w-full">
            <NovaTop10Ranking
              items={rankingItems}
              isLoading={top10Query.isLoading}
              onPick={onPick}
            />
          </div>
        </div>
      </section>

      {/* Floor 2: 热播剧集专区 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-2 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 rounded-full bg-amber-400 shadow-glow-gold" />
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                热播剧集专区
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">连载同步更新 · 蓝光臻彩</p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3">
            <div className="flex items-center gap-1 overflow-x-auto py-1 no-scrollbar">
              {TV_CATEGORIES.map((cat) => {
                const isActive = activeTvTab.label === cat.label;
                return (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() => setActiveTvTab(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-glow-gold'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            <Link
              href="/catalog?type=tv"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-400 font-medium transition-colors shrink-0 group"
            >
              <span>更多</span>
              <span className="group-hover:translate-x-0.5 transition-transform">›</span>
            </Link>
          </div>
        </div>

        {tvQuery.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="aspect-[2/3] rounded-xl bg-slate-800/60 animate-pulse border border-white/5"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
            {tvItems.map((item) => (
              <DoubanCard
                key={item.id}
                item={item}
                onClick={() => onPick(item.title)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * NovaTV 热播飙升榜 TOP 10 (含 NO.1 16:9 宽画幅皇冠卡片 + NO.2~10 紧凑榜单)
 */
function NovaTop10Ranking({
  items,
  isLoading,
  onPick,
}: {
  items: TmdbMediaItem[];
  isLoading: boolean;
  onPick: (title: string) => void;
}) {
  const top1 = items[0];
  const rest = items.slice(1, 10);

  return (
    <div className="w-full glass-panel rounded-2xl p-5 border border-white/10 shadow-cinema flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-red-500 flex items-center justify-center text-white shadow-glow-gold">
            <span className="text-sm">🔥</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
              热播飙升榜 <span className="text-amber-400 font-extrabold text-xs">TOP 10</span>
            </h3>
            <p className="text-[11px] text-slate-400">实时热度 · 全网风向标</p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-amber-300/80 border border-white/5">
          24H 动态
        </span>
      </div>

      {isLoading || !top1 ? (
        <div className="space-y-3">
          <div className="aspect-[16/9] rounded-xl bg-slate-800/60 animate-pulse" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* NO. 1 Featured Wide Card */}
          <button
            type="button"
            onClick={() => onPick(top1.title)}
            className="group relative block w-full text-left rounded-xl overflow-hidden mb-4 border border-amber-500/30 hover:border-amber-400/80 transition-all duration-300 shadow-lg cursor-pointer"
          >
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={top1.backdrop || top1.cover}
                alt={top1.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {/* Gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/60 to-transparent" />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />

              {/* Rank 1 Crown Badge */}
              <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-xs font-black shadow-glow-gold flex items-center gap-1">
                <span>👑 TOP 1</span>
              </div>

              {/* Hover Play Button */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div className="w-12 h-12 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-glow-gold transform group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5 ml-0.5 fill-current" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>

              {/* Info Overlay */}
              <div className="absolute bottom-2.5 left-3 right-3 z-10">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-white font-bold text-sm truncate group-hover:text-amber-400 transition-colors">
                    {top1.title}
                  </h4>
                  {top1.rating && (
                    <span className="flex items-center gap-0.5 text-xs font-bold text-amber-400 shrink-0">
                      <span>★</span>
                      <span>{top1.rating}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-300 mt-0.5">
                  <span className="truncate max-w-[150px]">{top1.episodes_info || top1.year || '院线热映'}</span>
                  <span className="text-amber-400 font-mono font-medium">100万+ 热度</span>
                </div>
              </div>
            </div>
          </button>

          {/* NO. 2 ~ NO. 10 Compact List */}
          <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
            {rest.map((item, idx) => {
              const rank = idx + 2;
              let rankBadgeClass = 'text-slate-400 bg-white/5';
              if (rank === 2) {
                rankBadgeClass = 'text-slate-100 bg-slate-400/20 font-bold';
              } else if (rank === 3) {
                rankBadgeClass = 'text-amber-300 bg-amber-600/20 font-bold';
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPick(item.title)}
                  className="w-full group flex items-center gap-3 p-1.5 rounded-lg hover:bg-white/5 transition-all duration-200 border border-transparent hover:border-white/5 text-left cursor-pointer"
                >
                  {/* Rank Index */}
                  <span
                    className={`w-6 h-6 rounded flex items-center justify-center text-xs font-mono shrink-0 ${rankBadgeClass}`}
                  >
                    {rank < 10 ? `0${rank}` : rank}
                  </span>

                  {/* Poster Thumbnail */}
                  <div className="w-9 h-12 rounded overflow-hidden shrink-0 bg-slate-800 relative">
                    {item.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.cover}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    )}
                  </div>

                  {/* Title & Category */}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-200 truncate group-hover:text-amber-400 transition-colors">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400 truncate">
                        {item.year || '热门'}
                      </span>
                      {item.episodes_info && (
                        <span className="text-[10px] text-emerald-400 truncate">{item.episodes_info}</span>
                      )}
                    </div>
                  </div>

                  {/* Rating */}
                  <div className="text-right shrink-0">
                    {item.rating ? (
                      <span className="text-xs font-bold text-amber-400/90 font-mono">
                        {item.rating}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono">热播</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
