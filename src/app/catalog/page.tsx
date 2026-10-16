'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { DoubanCard } from '@/components/video-card';
import { api } from '@/lib/client-api';
import { buildWatchUrl, cn } from '@/lib/utils';

type ChannelType = 'movie' | 'tv' | 'anime' | 'variety' | 'documentary';

interface ChannelConfig {
  id: ChannelType;
  label: string;
  icon: string;
  subTitle: string;
  regions: string[];
  genres: string[];
}

const CHANNELS_CONFIG: ChannelConfig[] = [
  {
    id: 'movie',
    label: '电影',
    icon: '🎬',
    subTitle: '院线大片 · 经典佳作 · 全球高分',
    regions: ['全部', '大陆', '香港', '台湾', '美国', '韩国', '日本', '英国', '法国'],
    genres: ['全部', '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '战争', '动画', '剧情', '奇幻', '犯罪', '纪录片'],
  },
  {
    id: 'tv',
    label: '电视剧',
    icon: '📺',
    subTitle: '热门华语剧 · 经典美剧 · 精彩韩剧日剧',
    regions: ['全部', '国产剧', '美剧', '韩剧', '日剧', '港剧', '台剧', '英剧', '泰剧'],
    genres: ['全部', '剧情', '古装', '悬疑', '都市', '爱情', '喜剧', '科幻', '武侠', '战争', '刑侦', '历史'],
  },
  {
    id: 'anime',
    label: '动漫',
    icon: '✨',
    subTitle: '连载新番 · 热血神作 · 剧场版经典',
    regions: ['全部', '日本', '大陆', '美国'],
    genres: ['全部', '热血', '冒险', '搞笑', '奇幻', '科幻', '战斗', '恋爱', '校园', '悬疑', '治愈'],
  },
  {
    id: 'variety',
    label: '综艺',
    icon: '🎤',
    subTitle: '爆笑下饭 · 音乐舞台 · 真实真人秀',
    regions: ['全部', '大陆', '韩国', '香港', '台湾', '欧美'],
    genres: ['全部', '真人秀', '搞笑', '音乐', '脱口秀', '竞技', '访谈', '情感', '美食'],
  },
  {
    id: 'documentary',
    label: '纪录片',
    icon: '🌍',
    subTitle: '探索自然 · 揭秘历史 · 人文科学',
    regions: ['全部', '大陆', '美国', '英国', '法国', '日本'],
    genres: ['全部', '自然', '历史', '科学', '人文', '美食', '军事', '探险', '地理'],
  },
];

const YEARS = ['全部', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '更早'];

const SORTS = [
  { id: 'recommend', label: '🔥 热门推荐' },
  { id: 'time', label: '⏰ 最新上映' },
  { id: 'rank', label: '⭐ 豆瓣高分' },
];

const PAGE_SIZE = 24;

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg text-content flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      }
    >
      <CatalogContent />
    </Suspense>
  );
}

function CatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL 参数优先，支持外部链接与浏览器前进后退
  const rawType = searchParams.get('type') || 'movie';
  const currentChannel: ChannelType = CHANNELS_CONFIG.some((c) => c.id === rawType)
    ? (rawType as ChannelType)
    : 'movie';

  const currentRegion = searchParams.get('region') || '全部';
  const currentGenre = searchParams.get('genre') || '全部';
  const currentYear = searchParams.get('year') || '全部';
  const currentSort = (searchParams.get('sort') || 'recommend') as 'recommend' | 'time' | 'rank';
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const [jumpPageInput, setJumpPageInput] = useState('');

  const activeChannelConfig = useMemo(
    () => CHANNELS_CONFIG.find((c) => c.id === currentChannel) || CHANNELS_CONFIG[0],
    [currentChannel]
  );

  const updateFilters = (changes: {
    type?: string;
    region?: string;
    genre?: string;
    year?: string;
    sort?: string;
    page?: number;
  }) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (changes.type !== undefined) {
      sp.set('type', changes.type);
      // 切换频道时重置地区与类型
      sp.delete('region');
      sp.delete('genre');
      sp.set('page', '1');
    }
    if (changes.region !== undefined) {
      if (changes.region === '全部') sp.delete('region');
      else sp.set('region', changes.region);
      sp.set('page', '1');
    }
    if (changes.genre !== undefined) {
      if (changes.genre === '全部') sp.delete('genre');
      else sp.set('genre', changes.genre);
      sp.set('page', '1');
    }
    if (changes.year !== undefined) {
      if (changes.year === '全部') sp.delete('year');
      else sp.set('year', changes.year);
      sp.set('page', '1');
    }
    if (changes.sort !== undefined) {
      sp.set('sort', changes.sort);
      sp.set('page', '1');
    }
    if (changes.page !== undefined) {
      sp.set('page', String(changes.page));
    }
    router.push(`/catalog?${sp.toString()}`, { scroll: false });
  };

  // 映射请求 tag 参数
  const queryTag = useMemo(() => {
    if (currentRegion !== '全部') return currentRegion;
    if (currentGenre !== '全部') return currentGenre;
    return '热门';
  }, [currentRegion, currentGenre]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;

  const catalogQuery = useQuery({
    queryKey: ['catalog', currentChannel, queryTag, currentRegion, currentGenre, currentYear, currentSort, currentPage],
    queryFn: ({ signal }) =>
      api.douban(currentChannel, queryTag, pageStart, PAGE_SIZE, signal, currentSort, {
        area: currentRegion,
        genre: currentGenre,
        year: currentYear,
      }),
    staleTime: 5 * 60_000,
  });

  const items = catalogQuery.data?.items ?? [];
  const total = catalogQuery.data?.total ?? (items.length > 0 ? items.length * 10 : 0);
  const totalPages = Math.max(1, Math.min(500, Math.ceil(total / PAGE_SIZE)));

  // 点击卡片直接进入播放页面，自动匹配首条线路第一集秒播
  const handleCardClick = (title: string) => {
    router.push(buildWatchUrl({ title }));
  };

  const hasActiveFilters =
    currentRegion !== '全部' || currentGenre !== '全部' || currentYear !== '全部' || currentSort !== 'recommend';

  return (
    <div className="min-h-screen flex flex-col bg-bg text-content">
      <Header showSearch />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5 space-y-5">
        {/* 频道大横幅与引导标语 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{activeChannelConfig.icon}</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {activeChannelConfig.label}片库大厅
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-muted mt-1">{activeChannelConfig.subTitle}</p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs text-faint bg-chip px-3 py-1.5 rounded-full border border-line/40">
              💡 点击任意海报立即全网匹配首集秒播
            </span>
          </div>
        </div>

        {/* 一级分类频道大标签切换 */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {CHANNELS_CONFIG.map((c) => (
            <button
              key={c.id}
              onClick={() => updateFilters({ type: c.id })}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 shrink-0 flex items-center gap-2 active:scale-95 touch-manipulation',
                currentChannel === c.id
                  ? 'bg-accent text-on-accent shadow-sm'
                  : 'bg-chip/60 text-muted hover:text-content hover:bg-chip border border-line/50'
              )}
            >
              <span>{c.icon}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>

        {/* 网页版多维聚合筛选器面板 */}
        <div className="bg-chip/35 border border-line/50 rounded-2xl p-3 sm:p-4 space-y-2.5 sm:space-y-3">
          {/* 地区行 */}
          <FilterRow
            label="地区"
            options={activeChannelConfig.regions}
            active={currentRegion}
            onSelect={(r) => updateFilters({ region: r })}
          />

          {/* 类型行 */}
          <FilterRow
            label="类型"
            options={activeChannelConfig.genres}
            active={currentGenre}
            onSelect={(g) => updateFilters({ genre: g })}
          />

          {/* 年份行 */}
          <FilterRow
            label="年份"
            options={YEARS}
            active={currentYear}
            onSelect={(y) => updateFilters({ year: y })}
          />

          {/* 排序行 */}
          <div className="flex items-center justify-between pt-1 border-t border-line/40 gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-xs font-semibold text-faint shrink-0 w-8 sm:w-10 text-left sm:text-right">排序:</span>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => updateFilters({ sort: s.id })}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 active:scale-95 touch-manipulation',
                      currentSort === s.id
                        ? 'bg-accent text-on-accent font-semibold shadow-xs'
                        : 'text-muted hover:text-content hover:bg-hover bg-surface/50'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {hasActiveFilters && (
              <button
                onClick={() =>
                  router.push(`/catalog?type=${currentChannel}`, { scroll: false })
                }
                className="text-xs text-accent hover:underline flex items-center gap-1 shrink-0 ml-auto cursor-pointer"
              >
                <span>重置所有筛选</span>
                <span>✕</span>
              </button>
            )}
          </div>
        </div>

        {/* 统计提示与换页状态 */}
        <div className="flex items-center justify-between text-xs text-muted px-1">
          <span>
            {catalogQuery.isLoading ? (
              '正在加载片单…'
            ) : total > 0 ? (
              <>
                共找到 <span className="text-content font-bold">{total.toLocaleString()}</span> 部影片
                （当前第 {currentPage}/{totalPages} 页）
              </>
            ) : (
              '暂无影片'
            )}
          </span>
          {catalogQuery.isFetching && !catalogQuery.isLoading && (
            <span className="text-accent flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
              刷新中…
            </span>
          )}
        </div>

        {/* 影片网格 */}
        {catalogQuery.isLoading ? (
          <CatalogSkeleton />
        ) : items.length === 0 ? (
          <div className="py-20 text-center space-y-3 border border-dashed border-line/60 rounded-2xl bg-surface/40">
            <p className="text-4xl">🍿</p>
            <h3 className="text-base font-semibold text-content">未找到符合该组合条件的影片</h3>
            <p className="text-xs text-muted">请尝试切换其他地区、类型或重置筛选条件</p>
            <button
              onClick={() => router.push(`/catalog?type=${currentChannel}`)}
              className="btn-primary text-xs px-4 py-1.5 rounded-lg active:scale-95"
            >
              清空筛选条件
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {items.map((item) => (
              <DoubanCard
                key={item.id}
                item={item}
                onClick={() => handleCardClick(item.title)}
              />
            ))}
          </div>
        )}

        {/* 真分页导航条 */}
        {totalPages > 1 && (
          <div className="pt-6 pb-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1 || catalogQuery.isFetching}
                onClick={() => updateFilters({ page: 1 })}
                className="btn-ghost btn-sm px-2.5 text-xs disabled:opacity-30 disabled:pointer-events-none"
                title="第一页"
              >
                首页
              </button>
              <button
                disabled={currentPage <= 1 || catalogQuery.isFetching}
                onClick={() => updateFilters({ page: currentPage - 1 })}
                className="btn-ghost btn-sm px-3 text-xs flex items-center gap-1 disabled:opacity-30 disabled:pointer-events-none"
              >
                <span>‹</span>
                <span>上一页</span>
              </button>

              {/* 页码按钮群 */}
              <div className="flex items-center gap-1">
                {renderPageNumbers(currentPage, totalPages, (p) => updateFilters({ page: p }))}
              </div>

              <button
                disabled={currentPage >= totalPages || catalogQuery.isFetching}
                onClick={() => updateFilters({ page: currentPage + 1 })}
                className="btn-ghost btn-sm px-3 text-xs flex items-center gap-1 disabled:opacity-30 disabled:pointer-events-none"
              >
                <span>下一页</span>
                <span>›</span>
              </button>
              <button
                disabled={currentPage >= totalPages || catalogQuery.isFetching}
                onClick={() => updateFilters({ page: totalPages })}
                className="btn-ghost btn-sm px-2.5 text-xs disabled:opacity-30 disabled:pointer-events-none"
                title="末页"
              >
                末页
              </button>
            </div>

            {/* 页面快速跳转 */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const p = parseInt(jumpPageInput.trim(), 10);
                if (!Number.isNaN(p) && p >= 1 && p <= totalPages) {
                  updateFilters({ page: p });
                  setJumpPageInput('');
                }
              }}
              className="flex items-center gap-1 text-xs text-muted"
            >
              <span>跳至</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpPageInput}
                onChange={(e) => setJumpPageInput(e.target.value)}
                placeholder={String(currentPage)}
                className="w-12 h-7 rounded border border-line bg-surface text-center text-content text-xs focus:border-accent focus:outline-none"
              />
              <span>页</span>
              <button
                type="submit"
                className="px-2 py-1 rounded bg-chip hover:bg-hover border border-line text-content text-xs active:scale-95"
              >
                GO
              </button>
            </form>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function FilterRow({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: string[];
  active: string;
  onSelect: (opt: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-faint shrink-0 w-8 sm:w-10 text-left sm:text-right">
        {label}:
      </span>
      <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {options.map((opt) => {
          const isActive = active === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onSelect(opt)}
              className={cn(
                'px-2.5 sm:px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 active:scale-95 touch-manipulation',
                isActive
                  ? 'bg-accent text-on-accent font-semibold shadow-xs'
                  : 'text-muted hover:text-content hover:bg-hover bg-surface/50'
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

function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="flex flex-col space-y-2">
          <div className="aspect-[2/3] w-full rounded-xl bg-chip/60 animate-pulse border border-line/30" />
          <div className="h-4 w-3/4 rounded bg-chip/60 animate-pulse" />
          <div className="h-3 w-1/3 rounded bg-chip/40 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function renderPageNumbers(
  currentPage: number,
  totalPages: number,
  onPageSelect: (page: number) => void
) {
  const pages: (number | string)[] = [];
  const delta = 2;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return pages.map((page, idx) => {
    if (page === '...') {
      return (
        <span key={`dots-${idx}`} className="px-1 text-xs text-faint">
          …
        </span>
      );
    }
    const pNum = Number(page);
    const isCur = pNum === currentPage;
    return (
      <button
        key={pNum}
        onClick={() => onPageSelect(pNum)}
        className={cn(
          'w-7 h-7 rounded-lg text-xs font-medium transition-all active:scale-95 touch-manipulation',
          isCur
            ? 'bg-accent text-on-accent font-bold shadow-xs'
            : 'text-muted hover:text-content hover:bg-hover bg-chip/50'
        )}
      >
        {pNum}
      </button>
    );
  });
}
