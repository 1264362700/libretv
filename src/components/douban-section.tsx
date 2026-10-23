'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import type { TmdbMediaItem } from '@/lib/tmdb';
import { DoubanCard } from './video-card';

type TmdbChannel = 'trending' | 'movie' | 'tv' | 'anime' | 'variety' | 'documentary';

const TMDB_CHANNELS: { id: TmdbChannel; label: string; icon: string }[] = [
  { id: 'trending', label: '今日热映', icon: '🔥' },
  { id: 'movie', label: '电影', icon: '🎬' },
  { id: 'tv', label: '剧集', icon: '📺' },
  { id: 'anime', label: '动漫', icon: '✨' },
  { id: 'variety', label: '综艺', icon: '🎤' },
  { id: 'documentary', label: '纪录片', icon: '🌍' },
];

const GENRE_OPTIONS = [
  '全部',
  '动作',
  '科幻',
  '悬疑',
  '喜剧',
  '爱情',
  '动画',
  '犯罪',
  '奇幻',
  '古装',
  '战争',
  '恐怖',
  '家庭',
  '历史',
];

const REGION_OPTIONS = ['全部', '大陆', '美国', '韩国', '日本', '香港', '台湾', '英国', '法国', '泰国'];

const YEAR_OPTIONS = ['全部', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '更早'];

const SORT_OPTIONS: { id: 'recommend' | 'rank' | 'time'; label: string }[] = [
  { id: 'recommend', label: '综合热度' },
  { id: 'rank', label: 'TMDB高分' },
  { id: 'time', label: '最新上映' },
];

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

/**
 * 首页核心片库区（纯 TMDB 官方引擎 + iOS 27 Spatial Liquid Glass 空间毛玻璃 + 左主网格 & 右 TOP10 热播榜）
 */
export function RecommendSection({ onPick }: { onPick: (title: string) => void }) {
  const [channel, setChannel] = useState<TmdbChannel>('trending');
  const [genre, setGenre] = useState('全部');
  const [region, setRegion] = useState('全部');
  const [year, setYear] = useState('全部');
  const [sort, setSort] = useState<'recommend' | 'rank' | 'time'>('recommend');
  const [page, setPage] = useState(1);
  const [filterExpanded, setFilterExpanded] = useState(false);

  const activeFilterCount =
    (genre !== '全部' ? 1 : 0) + (region !== '全部' ? 1 : 0) + (year !== '全部' ? 1 : 0);

  // 当用户在「今日热映」下主动选择了类型/地区/年份筛选时，自动切换到 movie/tv Discover 引擎以生效筛选
  const effectiveType =
    channel === 'trending' && (activeFilterCount > 0 || sort !== 'recommend') ? 'movie' : channel;

  const mainQuery = useQuery({
    queryKey: ['tmdb-home-grid', effectiveType, genre, region, year, sort, page],
    queryFn: ({ signal }) =>
      fetchTmdbClient(
        {
          type: effectiveType,
          area: region,
          genre,
          year,
          sort,
          page,
        },
        signal
      ),
    staleTime: 5 * 60_000,
  });

  // 右侧固定 TMDB 全球实时热力 TOP 10
  const trendingTop10Query = useQuery({
    queryKey: ['tmdb-trending-top10'],
    queryFn: ({ signal }) => fetchTmdbClient({ type: 'trending', page: 1 }, signal),
    staleTime: 10 * 60_000,
  });

  const items = mainQuery.data?.items ?? [];
  const totalPages = Math.min(500, Math.max(1, mainQuery.data?.totalPages ?? 1));
  const top10Items = (trendingTop10Query.data?.items ?? []).slice(0, 10);

  const handleResetFilters = () => {
    setGenre('全部');
    setRegion('全部');
    setYear('全部');
    setSort('recommend');
    setPage(1);
  };

  return (
    <section aria-label="TMDB 全球影视探索大厅" className="space-y-5">
      {/* 顶栏：iOS 27 悬浮胶囊频道切换 + 排序与可折叠筛选抽屉开关 */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* 左侧：频道分段毛玻璃胶囊 */}
        <div className="flex items-center gap-1 p-1.5 rounded-full ios-glass overflow-x-auto no-scrollbar self-start max-w-full">
          {TMDB_CHANNELS.map((tab) => {
            const isActive = channel === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setChannel(tab.id);
                  setPage(1);
                }}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 shrink-0 cursor-pointer touch-manipulation',
                  isActive
                    ? 'ios-pill-active font-semibold'
                    : 'text-muted hover:text-content hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                )}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* 右侧：排序分段胶囊 + 四维筛选开关 + 片库大厅 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 p-1 rounded-full ios-pill">
            {SORT_OPTIONS.map((s) => {
              const isSelected = sort === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSort(s.id);
                    setPage(1);
                  }}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
                    isSelected
                      ? 'ios-pill-active font-semibold'
                      : 'text-muted hover:text-content'
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setFilterExpanded((prev) => !prev)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer',
              filterExpanded || activeFilterCount > 0
                ? 'ios-pill-active font-semibold'
                : 'ios-pill text-muted hover:text-content'
            )}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="7" y1="12" x2="17" y2="12" />
              <line x1="10" y1="18" x2="14" y2="18" />
            </svg>
            <span>四维筛选</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-sky-500 text-white text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          <Link
            href={`/catalog?type=${channel === 'trending' ? 'movie' : channel}`}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full ios-pill text-xs text-muted hover:text-content font-medium transition-all shrink-0"
          >
            <span>全库探索</span>
            <span>›</span>
          </Link>
        </div>
      </div>

      {/* 可折叠 iOS 27 空间毛玻璃四维筛选舱（默认收起保持首屏极简通透，点击「四维筛选」平滑展开） */}
      {(filterExpanded || activeFilterCount > 0) && (
        <div className="ios-glass rounded-3xl p-4 sm:p-5 space-y-3 animate-fade-in">
          <SpatialFilterRow
            label="类型"
            options={GENRE_OPTIONS}
            active={genre}
            onSelect={(val) => {
              setGenre(val);
              setPage(1);
            }}
          />
          <SpatialFilterRow
            label="地区"
            options={REGION_OPTIONS}
            active={region}
            onSelect={(val) => {
              setRegion(val);
              setPage(1);
            }}
          />
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-black/[0.05] dark:border-white/[0.06]">
            <div className="flex-1 min-w-0">
              <SpatialFilterRow
                label="年份"
                options={YEAR_OPTIONS}
                active={year}
                onSelect={(val) => {
                  setYear(val);
                  setPage(1);
                }}
              />
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-1 rounded-full text-xs text-muted hover:text-content ios-pill shrink-0 cursor-pointer"
              >
                重置 ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* 主舞台：左侧 9 列海报网格 + 右侧 3 列 TMDB 全球实时热力 TOP 10 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左侧 9 列：TMDB 海报网格 + 分页 */}
        <div className="lg:col-span-9 space-y-6">
          {mainQuery.isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4">
              {Array.from({ length: 15 }).map((_, idx) => (
                <div
                  key={idx}
                  className="aspect-[2/3] rounded-2xl bg-chip/50 animate-pulse border border-black/[0.04] dark:border-white/[0.05]"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="ios-glass rounded-3xl py-20 px-4 text-center space-y-3">
              <p className="text-3xl">🎬</p>
              <p className="text-sm font-semibold text-content">当前筛选条件下暂无匹配影片</p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-1.5 rounded-full ios-pill-active text-xs font-semibold cursor-pointer"
              >
                重置筛选条件
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4">
                {items.slice(0, 20).map((item) => (
                  <DoubanCard
                    key={item.id}
                    item={item}
                    onClick={() => onPick(item.title)}
                  />
                ))}
              </div>

              {/* 底部 iOS 27 悬浮胶囊分页器 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    disabled={page <= 1 || mainQuery.isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-4 py-1.5 rounded-full ios-pill text-xs font-medium text-content disabled:opacity-35 cursor-pointer"
                  >
                    ‹ 上一页
                  </button>
                  <span className="px-4 py-1.5 rounded-full ios-glass text-xs font-mono text-muted">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages || mainQuery.isFetching}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-4 py-1.5 rounded-full ios-pill text-xs font-medium text-content disabled:opacity-35 cursor-pointer"
                  >
                    下一页 ›
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* 右侧 3 列：TMDB 全球热力榜 TOP 10 空间玻璃舱 */}
        <aside className="lg:col-span-3 ios-glass rounded-3xl p-4 sm:p-5 space-y-4 lg:sticky lg:top-20">
          <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-2">
              <span className="text-base">🔥</span>
              <h3 className="text-sm font-bold tracking-tight text-content">TMDB 全球热播榜</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ios-pill text-muted">
              TOP 10
            </span>
          </div>

          {trendingTop10Query.isLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-14 rounded-2xl bg-chip/40 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {top10Items.map((item, idx) => {
                const rank = idx + 1;
                const isTop3 = rank <= 3;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onPick(item.title)}
                    className="w-full group flex items-center gap-3 p-2 rounded-2xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all text-left cursor-pointer"
                  >
                    {/* 排名徽章 */}
                    <span
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0',
                        rank === 1
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm'
                          : isTop3
                            ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-400/30'
                            : 'text-faint bg-black/[0.03] dark:bg-white/[0.04]'
                      )}
                    >
                      {rank}
                    </span>

                    {/* 迷你海报 */}
                    {item.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.cover}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-10 h-14 rounded-xl object-cover shrink-0 bg-chip border border-black/[0.06] dark:border-white/[0.08]"
                      />
                    )}

                    {/* 标题与元数据 */}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-content truncate group-hover:text-accent transition-colors">
                        {item.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
                        {item.rating && (
                          <span className="text-amber-500 dark:text-amber-300 font-semibold">
                            ★ {item.rating}
                          </span>
                        )}
                        {item.year && <span>{item.year}</span>}
                        {item.episodes_info && (
                          <span className="truncate text-faint">{item.episodes_info}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function SpatialFilterRow({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: string[];
  active: string;
  onSelect: (val: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 text-xs">
      <span className="shrink-0 text-faint font-medium w-9 text-right">{label}</span>
      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto no-scrollbar py-0.5">
        {options.map((opt) => {
          const isSelected = opt === active;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onSelect(opt)}
              className={cn(
                'px-3 py-1 rounded-full text-xs transition-all duration-150 shrink-0 cursor-pointer touch-manipulation',
                isSelected
                  ? 'ios-pill-active font-semibold'
                  : 'text-muted hover:text-content hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
