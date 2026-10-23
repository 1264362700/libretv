'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { TmdbMediaItem } from '@/lib/tmdb';
import { resolveEpisodeBadge } from '@/lib/media-library-service';
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

  const res = await fetch(`/api/media/feed?${sp.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(`资料库请求失败 (${res.status})`);
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
 * NovaTV Cinema Ultra 左图右榜双栏楼层：
 * - 左侧 2 行 8~10 张高清海报网格（桌面端悬停透出剧情看点、主演阵容与一键追剧）
 * - 右侧固定内嵌「🔥 热播飙升榜 TOP 10」（NO.1 宽版图文卡片 + NO.2~10 金银铜序号紧凑列表）
 */
export function RecommendSection({
  onPick,
  cmsRemarksMap,
}: {
  onPick: (title: string) => void;
  cmsRemarksMap?: Map<string, string>;
}) {
  const [activeMovieTab, setActiveMovieTab] = useState(MOVIE_CATEGORIES[0]);
  const [activeTvTab, setActiveTvTab] = useState(TV_CATEGORIES[0]);

  // Floor 1 左侧：今日重磅热播电影（2行 x 5列 = 10张）
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

  // Floor 1 右侧：热播飙升榜 TOP 10 (Trending)
  const top10MovieQuery = useQuery({
    queryKey: ['novatv-top10-trending'],
    queryFn: ({ signal }) => fetchTmdbClient({ type: 'trending', page: 1 }, signal),
    staleTime: 10 * 60_000,
  });

  // Floor 2 左侧：热播剧集专区（2行 x 5列 = 10张）
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

  // Floor 2 右侧：剧集高分飙升榜 TOP 10
  const top10TvQuery = useQuery({
    queryKey: ['novatv-top10-tv'],
    queryFn: ({ signal }) => fetchTmdbClient({ type: 'tv', sort: 'rank', page: 1 }, signal),
    staleTime: 10 * 60_000,
  });

  const movieItems = (movieQuery.data?.items ?? []).slice(0, 15);
  const movieRankingItems = (top10MovieQuery.data?.items ?? []).slice(0, 10);
  const tvItems = (tvQuery.data?.items ?? []).slice(0, 15);
  const tvRankingItems = (top10TvQuery.data?.items ?? []).slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Floor 1: 今日重磅热播 (左侧 3行 15 张海报网格 + 右侧 🔥 热播飙升榜 TOP 10) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-2 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 rounded-full bg-amber-400 shadow-glow-gold" />
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-content tracking-tight flex items-center gap-2">
                今日重磅热播
              </h2>
              <p className="text-xs text-muted mt-0.5">4K 全球院线大片 · 悬停预览剧情与一键追剧</p>
            </div>
          </div>

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
                        : 'text-muted hover:text-content hover:bg-hover'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            <Link
              href="/catalog?type=movie"
              className="flex items-center gap-1 text-xs text-muted hover:text-amber-500 dark:hover:text-amber-400 font-medium transition-colors shrink-0 group"
            >
              <span>更多</span>
              <span className="group-hover:translate-x-0.5 transition-transform">›</span>
            </Link>
          </div>
        </div>

        {/* 左图右榜双栏排版 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* 左侧：3 行 15 张高清海报网格 */}
          <div className="lg:col-span-8 xl:col-span-9">
            {movieQuery.isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4">
                {Array.from({ length: 15 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="aspect-[2/3] rounded-xl bg-chip animate-pulse border border-line"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4">
                {movieItems.map((item) => (
                  <DoubanCard
                    key={item.id}
                    item={item}
                    cmsRemarksMap={cmsRemarksMap}
                    onClick={() => onPick(item.title)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 右侧固定内嵌：🔥 热播飙升榜 TOP 10 */}
          <div className="lg:col-span-4 xl:col-span-3 w-full">
            <NovaTop10Ranking
              title="🔥 热播飙升榜"
              subtitle="实时热度 · 全网风向标"
              items={movieRankingItems}
              isLoading={top10MovieQuery.isLoading}
              cmsRemarksMap={cmsRemarksMap}
              onPick={onPick}
            />
          </div>
        </div>
      </section>

      {/* Floor 2: 热播剧集专区 (左侧 3行 15 张海报网格 + 右侧 🔥 剧集口碑榜 TOP 10) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-2 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 rounded-full bg-amber-400 shadow-glow-gold" />
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-content tracking-tight flex items-center gap-2">
                热播剧集专区
              </h2>
              <p className="text-xs text-muted mt-0.5">连载同步更新 · 蓝光臻彩</p>
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
                        : 'text-muted hover:text-content hover:bg-hover'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            <Link
              href="/catalog?type=tv"
              className="flex items-center gap-1 text-xs text-muted hover:text-amber-500 dark:hover:text-amber-400 font-medium transition-colors shrink-0 group"
            >
              <span>更多</span>
              <span className="group-hover:translate-x-0.5 transition-transform">›</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 xl:col-span-9">
            {tvQuery.isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4">
                {Array.from({ length: 15 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="aspect-[2/3] rounded-xl bg-chip animate-pulse border border-line"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4">
                {tvItems.map((item) => (
                  <DoubanCard
                    key={item.id}
                    item={item}
                    cmsRemarksMap={cmsRemarksMap}
                    onClick={() => onPick(item.title)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 xl:col-span-3 w-full">
            <NovaTop10Ranking
              title="🔥 剧集飙升榜"
              subtitle="高分神作 · 必看连续剧"
              items={tvRankingItems}
              isLoading={top10TvQuery.isLoading}
              cmsRemarksMap={cmsRemarksMap}
              onPick={onPick}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * NovaTV 热播飙升榜 TOP 10（NO.1 宽版图文卡片 + NO.2~10 金银铜序号紧凑列表）
 */
function NovaTop10Ranking({
  title,
  subtitle,
  items,
  isLoading,
  cmsRemarksMap,
  onPick,
}: {
  title: string;
  subtitle: string;
  items: TmdbMediaItem[];
  isLoading: boolean;
  cmsRemarksMap?: Map<string, string>;
  onPick: (title: string) => void;
}) {
  const top1 = items[0];
  const rest = items.slice(1, 10);
  const top1Badge = top1 ? resolveEpisodeBadge(top1, cmsRemarksMap) : '';

  return (
    <div className="w-full glass-panel rounded-2xl p-5 border border-line shadow-cinema flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
        <div className="flex items-center gap-2.5">
          <div>
            <h3 className="text-base font-bold text-content tracking-tight flex items-center gap-1.5">
              <span>{title}</span>
              <span className="text-amber-500 dark:text-amber-400 font-extrabold text-xs">TOP 10</span>
            </h3>
            <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-chip text-amber-500 dark:text-amber-300 border border-line">
          24H 动态
        </span>
      </div>

      {isLoading || !top1 ? (
        <div className="space-y-3">
          <div className="aspect-[16/9] rounded-xl bg-chip animate-pulse" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-chip/60 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* NO. 1 宽版图文卡片 */}
          <button
            type="button"
            onClick={() => onPick(top1.title)}
            className="group relative block w-full text-left rounded-xl overflow-hidden mb-4 border border-amber-500/35 hover:border-amber-400/85 transition-all duration-300 shadow-lg cursor-pointer bg-slate-900"
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
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />

              {/* NO.1 鎏金皇冠角标 */}
              <div className="absolute top-2 left-2 z-10 px-2.5 py-0.5 rounded-md bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 text-xs font-black shadow-glow-gold flex items-center gap-1">
                <span>👑 NO.1</span>
              </div>

              {/* Hover Play Button */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div className="w-11 h-11 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-glow-gold transform group-hover:scale-110 transition-transform">
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
                <div className="flex items-center justify-between text-[11px] text-slate-200 mt-0.5">
                  <span className="truncate max-w-[150px]">
                    {top1.overview || top1.card_subtitle || top1.year || '院线热映'}
                  </span>
                  <span className="text-emerald-400 font-medium shrink-0">{top1Badge}</span>
                </div>
              </div>
            </div>
          </button>

          {/* NO. 2 ~ NO. 10 金银铜序号紧凑列表 */}
          <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
            {rest.map((item, idx) => {
              const rank = idx + 2;
              const itemBadge = resolveEpisodeBadge(item, cmsRemarksMap);
              let rankBadgeClass = 'text-muted bg-chip border border-line';
              if (rank === 2) {
                // 银牌 NO.2
                rankBadgeClass =
                  'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-950 font-black shadow-sm';
              } else if (rank === 3) {
                // 铜牌 NO.3
                rankBadgeClass =
                  'bg-gradient-to-br from-amber-500 to-amber-700 text-slate-950 font-black shadow-sm';
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPick(item.title)}
                  className="w-full group flex items-center gap-3 p-1.5 rounded-lg hover:bg-hover transition-all duration-200 border border-transparent hover:border-line text-left cursor-pointer"
                >
                  {/* 金银铜序号徽章 */}
                  <span
                    className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono shrink-0 ${rankBadgeClass}`}
                  >
                    {rank < 10 ? `0${rank}` : rank}
                  </span>

                  {/* Poster Thumbnail */}
                  <div className="w-9 h-12 rounded overflow-hidden shrink-0 bg-chip relative">
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
                    <p className="text-xs font-medium text-content truncate group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted truncate">
                        {item.year || '热门'}
                      </span>
                      {itemBadge && (
                        <span className="text-[10px] text-emerald-500 dark:text-emerald-400 truncate">{itemBadge}</span>
                      )}
                    </div>
                  </div>

                  {/* Rating */}
                  <div className="text-right shrink-0">
                    {item.rating ? (
                      <span className="text-xs font-bold text-amber-500 dark:text-amber-400/90 font-mono">
                        ★ {item.rating}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted font-mono">热播</span>
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
