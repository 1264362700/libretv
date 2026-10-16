'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { DoubanItem } from '@/lib/types';
import { DoubanCard } from './video-card';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

type PrimaryCategory = 'movie' | 'tv' | 'anime' | 'variety' | 'documentary';

const PRIMARY_TABS: { id: PrimaryCategory; label: string; icon: string }[] = [
  { id: 'movie', label: '电影', icon: '🎬' },
  { id: 'tv', label: '电视剧', icon: '📺' },
  { id: 'anime', label: '动漫', icon: '✨' },
  { id: 'variety', label: '综艺', icon: '🎤' },
  { id: 'documentary', label: '纪录片', icon: '🌍' },
];

// 电影筛选维度（地区与排序，严格对齐豆瓣标准标签体系）
const MOVIE_REGIONS = ['全部', '华语', '欧美', '韩国', '日本', '香港', '台湾', '英国', '法国'];
const MOVIE_SORTS = [
  { id: 'recommend', label: '热门推荐' },
  { id: 'time', label: '最新上映' },
  { id: 'rank', label: '豆瓣高分' },
  { id: 'classic', label: '经典回顾' },
  { id: 'underrated', label: '冷门佳片' },
];

// 剧集筛选维度（版本与排序）
const TV_REGIONS = ['全部', '国产剧', '美剧', '韩剧', '日剧', '英剧', '港剧', '台剧'];
const TV_SORTS = [
  { id: 'recommend', label: '热门热播' },
  { id: 'time', label: '最新开播' },
  { id: 'rank', label: '高分好评' },
];

// 动漫筛选维度（版本与排序）
const ANIME_TYPES = ['全部', '日本动画', '国产动画', '欧美动画', '剧场版'];
const ANIME_SORTS = [
  { id: 'recommend', label: '热门推荐' },
  { id: 'time', label: '最新上线' },
  { id: 'rank', label: '高分神作' },
];

// 综艺筛选维度
const VARIETY_TAGS = ['全部', '国产综艺', '韩国综艺', '欧美综艺', '脱口秀', '音乐', '真人秀'];
const VARIETY_SORTS = [
  { id: 'recommend', label: '热门推荐' },
  { id: 'time', label: '最新上线' },
  { id: 'rank', label: '高分口碑' },
];

// 纪录片筛选维度
const DOC_TAGS = ['全部', '自然', '历史', '科学', '人文', '美食', '军事', '探险'];
const DOC_SORTS = [
  { id: 'recommend', label: '热门推荐' },
  { id: 'rank', label: '高分必看' },
  { id: 'time', label: '最新发布' },
];

/** 首页推荐区：支持全功能多维筛选 + 动漫新番周历 + 影视热榜 */
export function RecommendSection({ onPick }: { onPick: (title: string) => void }) {
  const doubanEnabled = useAppStore((s) => s.doubanEnabled);
  const recommendSource = useAppStore((s) => s.recommendSource);

  if (!doubanEnabled) return null;
  if (recommendSource === 'bangumi') return <BangumiView onPick={onPick} />;
  if (recommendSource === 'hot-list') return <HotListView onPick={onPick} />;
  return <DoubanMultiCategoryView onPick={onPick} />;
}

/**
 * 门户级多维分类宫格大厅：
 * 一级大类（电影/电视剧/动漫/综艺/纪录片） + 多行网页版联动筛选
 */
function DoubanMultiCategoryView({ onPick }: { onPick: (title: string) => void }) {
  const [category, setCategory] = useState<PrimaryCategory>('movie');

  // 电影筛选状态（地区与排序）
  const [movieRegion, setMovieRegion] = useState('全部');
  const [movieSort, setMovieSort] = useState('recommend');

  // 剧集筛选状态（版本与排序）
  const [tvRegion, setTvRegion] = useState('全部');
  const [tvSort, setTvSort] = useState('recommend');

  // 动漫筛选状态（版本与排序）
  const [animeViewMode, setAnimeViewMode] = useState<'douban' | 'bangumi'>('douban');
  const [animeType, setAnimeType] = useState('全部');
  const [animeSort, setAnimeSort] = useState('recommend');

  // 综艺筛选状态
  const [varietyTag, setVarietyTag] = useState('全部');
  const [varietySort, setVarietySort] = useState('recommend');

  // 纪录片筛选状态
  const [docTag, setDocTag] = useState('全部');
  const [docSort, setDocSort] = useState('recommend');

  // 换一批真实分页页码
  const [page, setPage] = useState(1);
  const [isShuffling, setIsShuffling] = useState(false);

  // 计算目标豆瓣请求参数
  const { type, tag, sort } = (() => {
    switch (category) {
      case 'movie': {
        let t = '热门';
        if (movieRegion !== '全部') {
          t = movieRegion;
        } else if (movieSort === 'classic') t = '经典';
        else if (movieSort === 'underrated') t = '冷门佳片';
        else if (movieSort === 'rank') t = '高分';
        else if (movieSort === 'time') t = '最新';
        const s: 'recommend' | 'time' | 'rank' = movieSort === 'time' ? 'time' : movieSort === 'rank' ? 'rank' : 'recommend';
        return { type: 'movie' as const, tag: t, sort: s };
      }
      case 'tv': {
        let t = '热门';
        if (tvRegion !== '全部') {
          t = tvRegion;
        } else if (tvSort === 'time') t = '最新';
        else if (tvSort === 'rank') t = '高分';
        const s: 'recommend' | 'time' | 'rank' = tvSort === 'time' ? 'time' : tvSort === 'rank' ? 'rank' : 'recommend';
        return { type: 'tv' as const, tag: t, sort: s };
      }
      case 'anime': {
        const isMovie = animeType === '剧场版';
        let t = '日本动画';
        if (animeType !== '全部') t = animeType;
        const s: 'recommend' | 'time' | 'rank' = animeSort === 'time' ? 'time' : animeSort === 'rank' ? 'rank' : 'recommend';
        return { type: isMovie ? ('movie' as const) : ('tv' as const), tag: t, sort: s };
      }
      case 'variety': {
        const t = varietyTag === '全部' ? '综艺' : varietyTag;
        const s: 'recommend' | 'time' | 'rank' = varietySort === 'time' ? 'time' : varietySort === 'rank' ? 'rank' : 'recommend';
        return { type: 'tv' as const, tag: t, sort: s };
      }
      case 'documentary': {
        const t = docTag === '全部' ? '纪录片' : docTag;
        const s: 'recommend' | 'time' | 'rank' = docSort === 'time' ? 'time' : docSort === 'rank' ? 'rank' : 'recommend';
        return { type: 'tv' as const, tag: t, sort: s };
      }
    }
  })();

  const query = useQuery({
    queryKey: ['douban-multi', category, type, tag, sort, page],
    queryFn: ({ signal }) => api.douban(type, tag, (page - 1) * 20, 20, signal, sort),
    enabled: !(category === 'anime' && animeViewMode === 'bangumi'),
  });

  const items = query.data?.items ?? [];

  return (
    <section aria-label="影视多维分类大厅" className="space-y-4">
      {/* 一级核心分类大导航：支持移动端/iPad单行横向滑动手势 */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-line/60">
        <div className="flex items-center gap-1.5 sm:gap-2 bg-chip/80 p-1 rounded-xl overflow-x-auto no-scrollbar max-w-full">
          {PRIMARY_TABS.map((tab) => (
            <button
              key={tab.id}
              className={cn(
                'px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 flex items-center gap-1.5 shrink-0 active:scale-95 touch-manipulation',
                category === tab.id
                  ? 'bg-accent text-on-accent shadow-sm scale-100 font-semibold'
                  : 'text-muted hover:text-content hover:bg-hover'
              )}
              onClick={() => {
                setCategory(tab.id);
                setPage(1);
              }}
            >
              <span className="text-sm sm:text-base">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-faint hidden lg:inline-block shrink-0">点击海报即刻智能聚合全网起播</span>
      </div>

      {/* 多维网页版筛选面板：单行自适应横滑，高度精简压缩70% */}
      <div className="bg-chip/40 border border-line/50 rounded-xl p-2.5 sm:p-3.5 space-y-1.5 sm:space-y-2">
        {category === 'movie' && (
          <>
            <FilterRow
              label="地区"
              options={MOVIE_REGIONS}
              active={movieRegion}
              onSelect={(r) => {
                setMovieRegion(r);
                setPage(1);
              }}
            />
            <FilterRow
              label="排序"
              options={MOVIE_SORTS.map((s) => s.label)}
              active={MOVIE_SORTS.find((s) => s.id === movieSort)?.label ?? '热门推荐'}
              onSelect={(label) => {
                setMovieSort(MOVIE_SORTS.find((s) => s.label === label)?.id ?? 'recommend');
                setPage(1);
              }}
            />
          </>
        )}

        {category === 'tv' && (
          <>
            <FilterRow
              label="版本"
              options={TV_REGIONS}
              active={tvRegion}
              onSelect={(r) => {
                setTvRegion(r);
                setPage(1);
              }}
            />
            <FilterRow
              label="排序"
              options={TV_SORTS.map((s) => s.label)}
              active={TV_SORTS.find((s) => s.id === tvSort)?.label ?? '热门热播'}
              onSelect={(label) => {
                setTvSort(TV_SORTS.find((s) => s.label === label)?.id ?? 'recommend');
                setPage(1);
              }}
            />
          </>
        )}

        {category === 'anime' && (
          <>
            <div className="flex items-center gap-2 pb-1.5 border-b border-line/40">
              <span className="shrink-0 text-faint font-medium w-8 sm:w-10 text-left sm:text-right text-xs">模式:</span>
              <div className="flex gap-2">
                <button
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 active:scale-95 touch-manipulation',
                    animeViewMode === 'douban' ? 'bg-accent text-on-accent font-semibold' : 'bg-chip text-muted hover:text-content'
                  )}
                  onClick={() => setAnimeViewMode('douban')}
                >
                  精选番剧库
                </button>
                <button
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 active:scale-95 touch-manipulation',
                    animeViewMode === 'bangumi' ? 'bg-accent text-on-accent font-semibold' : 'bg-chip text-muted hover:text-content'
                  )}
                  onClick={() => setAnimeViewMode('bangumi')}
                >
                  📅 新番周历
                </button>
              </div>
            </div>
            {animeViewMode === 'douban' && (
              <>
                <FilterRow label="版本" options={ANIME_TYPES} active={animeType} onSelect={setAnimeType} />
                <FilterRow
                  label="排序"
                  options={ANIME_SORTS.map((s) => s.label)}
                  active={ANIME_SORTS.find((s) => s.id === animeSort)?.label ?? '热门推荐'}
                  onSelect={(label) => setAnimeSort(ANIME_SORTS.find((s) => s.label === label)?.id ?? 'recommend')}
                />
              </>
            )}
          </>
        )}

        {category === 'variety' && (
          <>
            <FilterRow label="分类" options={VARIETY_TAGS} active={varietyTag} onSelect={setVarietyTag} />
            <FilterRow
              label="排序"
              options={VARIETY_SORTS.map((s) => s.label)}
              active={VARIETY_SORTS.find((s) => s.id === varietySort)?.label ?? '热门推荐'}
              onSelect={(label) => setVarietySort(VARIETY_SORTS.find((s) => s.label === label)?.id ?? 'recommend')}
            />
          </>
        )}

        {category === 'documentary' && (
          <>
            <FilterRow label="题材" options={DOC_TAGS} active={docTag} onSelect={setDocTag} />
            <FilterRow
              label="排序"
              options={DOC_SORTS.map((s) => s.label)}
              active={DOC_SORTS.find((s) => s.id === docSort)?.label ?? '热门推荐'}
              onSelect={(label) => setDocSort(DOC_SORTS.find((s) => s.label === label)?.id ?? 'recommend')}
            />
          </>
        )}
      </div>

      {/* 9zhoukj 楼层头部：大号分类标题 + 悬停小箭头 + 换一批胶囊 + 完整片库入口 */}
      <div className="flex items-center justify-between pt-1 pb-1">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={`/catalog?type=${category}`}
            className="text-xl sm:text-2xl font-bold text-content flex items-center gap-1 group cursor-pointer hover:text-accent transition-colors"
            title="进入该分类完整片库大厅"
          >
            <span>{PRIMARY_TABS.find((t) => t.id === category)?.label}热播大厅</span>
            <span className="text-muted group-hover:translate-x-1 group-hover:text-accent transition-transform text-base sm:text-lg">→</span>
          </Link>
          <span className="text-xs text-muted hidden sm:inline-block">
            {category === 'movie' ? '精选高分院线大片' : category === 'tv' ? '当下最火爆连续剧' : category === 'anime' ? '人气新番连载' : '爆笑娱乐综艺'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={query.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-line hover:border-accent/50 text-xs text-muted hover:text-content bg-chip/60 hover:bg-chip transition-all active:scale-95 touch-manipulation cursor-pointer disabled:opacity-50"
            onClick={() => {
              setIsShuffling(true);
              setPage((prev) => (prev % 10) + 1);
              setTimeout(() => setIsShuffling(false), 500);
            }}
          >
            <span className={cn('text-xs transition-transform duration-500', (isShuffling || query.isFetching) && 'rotate-180')}>🔄</span>
            <span>换一批 {page > 1 ? `第${page}组` : ''}</span>
          </button>
          <Link
            href={`/catalog?type=${category}`}
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-line hover:border-accent text-xs text-accent hover:bg-accent/10 transition-all font-medium"
          >
            <span>完整片库</span>
            <span>›</span>
          </Link>
        </div>
      </div>

      {/* 动漫新番周更表模式直接内嵌渲染 */}
      {category === 'anime' && animeViewMode === 'bangumi' ? (
        <BangumiInlineView onPick={onPick} />
      ) : query.isError ? (
        <p className="text-center text-sm text-faint py-12">推荐内容加载失败，请稍后刷新或更换分类</p>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-12">该分类组合暂无内容，请尝试其他标签</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-7 gap-2.5 sm:gap-3.5">
          {items.slice(0, 14).map((item) => (
            <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
          ))}
        </div>
      )}
    </section>
  );
}

/** 单行多维筛选器条目组件：横向单行自然平滑滚动 */
function FilterRow({
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
    <div className="flex items-center gap-2 text-xs py-0.5">
      <span className="shrink-0 text-faint font-medium w-8 sm:w-10 text-left sm:text-right">
        {label}:
      </span>
      <div className="flex items-center gap-1 sm:gap-1.5 flex-1 overflow-x-auto no-scrollbar py-0.5 scroll-smooth">
        {options.map((opt) => {
          const isSelected = opt === active;
          return (
            <button
              key={opt}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs transition-all duration-150 shrink-0 touch-manipulation active:scale-95',
                isSelected
                  ? 'bg-accent text-on-accent font-semibold shadow-xs'
                  : 'text-muted hover:text-content hover:bg-hover bg-chip/40 sm:bg-transparent'
              )}
              onClick={() => onSelect(opt)}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 内联 Bangumi 每日放送视图 */
function BangumiInlineView({ onPick }: { onPick: (title: string) => void }) {
  const [weekday, setWeekday] = useState<number | 'all'>('all');

  const query = useQuery({
    queryKey: ['bangumi-calendar-inline'],
    queryFn: ({ signal }) => api.bangumiCalendar(signal),
  });

  let items: DoubanItem[] = [];
  if (query.data) {
    items =
      weekday === 'all'
        ? query.data.days.flatMap((d) => d.items)
        : (query.data.days.find((d) => d.weekday === weekday)?.items ?? []);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <ChipButton active={weekday === 'all'} onClick={() => setWeekday('all')}>
          全部星期
        </ChipButton>
        {WEEKDAYS.map((name, i) => (
          <ChipButton key={name} active={weekday === i + 1} onClick={() => setWeekday(i + 1)}>
            {name}
          </ChipButton>
        ))}
      </div>

      {query.isError ? (
        <p className="text-center text-sm text-faint py-8">新番日历加载失败，请稍后重试</p>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-3">
          {items.map((item) => (
            <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 独立 Bangumi 每日放送全屏视图（设置指定时使用） */
function BangumiView({ onPick }: { onPick: (title: string) => void }) {
  return (
    <section aria-label="新番放送推荐" className="space-y-4">
      <h2 className="text-lg font-bold">新番每日放送</h2>
      <BangumiInlineView onPick={onPick} />
    </section>
  );
}

const HOT_LISTS = [
  { id: 'douban_movie_weekly', label: '电影周榜' },
  { id: 'douban_tv_chinese', label: '国产剧周榜' },
  { id: 'douban_tv_global', label: '海外剧周榜' },
  { id: 'douban_show_chinese', label: '国内综艺' },
  { id: 'douban_show_global', label: '海外综艺' },
  { id: 'baidu_teleplay', label: '百度热播剧' },
];

/** 影视热榜视图 */
function HotListView({ onPick }: { onPick: (title: string) => void }) {
  const [listId, setListId] = useState(HOT_LISTS[0].id);

  const query = useQuery({
    queryKey: ['hot-list', listId],
    queryFn: ({ signal }) => api.hotList(listId, signal),
  });

  const items = query.data?.items ?? [];

  return (
    <section aria-label="影视榜单推荐" className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {HOT_LISTS.map((l) => (
          <ChipButton key={l.id} active={listId === l.id} onClick={() => setListId(l.id)}>
            {l.label}
          </ChipButton>
        ))}
      </div>

      {query.isError ? (
        <p className="text-center text-sm text-faint py-8">推荐内容加载失败，可稍后重试</p>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-3">
          {items.map((item) => (
            <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
          ))}
        </div>
      )}
    </section>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-3">
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] rounded-lg bg-chip animate-pulse" />
          <div className="h-3 mt-2 rounded bg-chip animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={cn(
        'px-2.5 py-1 rounded-full text-xs transition-colors',
        active ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:text-content hover:bg-hover'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
