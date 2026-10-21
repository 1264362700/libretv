'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { DoubanItem } from '@/lib/types';
import { isShortDramaTitle } from '@/lib/short-drama';
import { DoubanCard } from './video-card';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

type PrimaryCategory = 'movie' | 'tv' | 'short_drama' | 'anime' | 'variety' | 'documentary';

const PRIMARY_TABS: { id: PrimaryCategory; label: string; icon: string }[] = [
  { id: 'movie', label: '电影', icon: '🎬' },
  { id: 'tv', label: '电视剧', icon: '📺' },
  { id: 'short_drama', label: '短剧', icon: '📱' },
  { id: 'anime', label: '动漫', icon: '✨' },
  { id: 'variety', label: '综艺', icon: '🎤' },
  { id: 'documentary', label: '纪录片', icon: '🌍' },
];

// 短剧筛选维度
const SHORT_DRAMA_THEMES = ['全部', '战神', '甜宠', '逆袭', '总裁', '重生', '神医', '古装', '修仙', 'AI精选'];
const SHORT_DRAMA_SORTS = [
  { id: 'recommend', label: '热门爽剧' },
  { id: 'latest', label: '最新上线' },
  { id: 'hot', label: '全网热播' },
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

/** 可用首页推荐数据源配置（图文定义，去除臃肿内部 tag） */
const RECOMMEND_SOURCES: {
  id: 'douban' | 'short-drama' | 'iqiyi-hot' | '360-hot' | 'baidu-top' | 'douban-top250' | 'hot-list' | 'maoyan' | 'bangumi';
  label: string;
  icon: string;
  desc: string;
}[] = [
  { id: 'douban', label: '豆瓣精选', icon: '🔥', desc: '全品类多维筛选' },
  { id: 'short-drama', label: '热门短剧', icon: '📱', desc: '微短剧爽文合集' },
  { id: 'iqiyi-hot', label: '爱奇艺榜', icon: '💚', desc: '官方全端热播榜' },
  { id: '360-hot', label: '360热播', icon: '⚡', desc: '全网影视热播榜' },
  { id: 'baidu-top', label: '百度风云', icon: '📈', desc: '全网实时搜索榜' },
  { id: 'douban-top250', label: '豆瓣250', icon: '🏆', desc: '影史高分神作' },
  { id: 'hot-list', label: '豆瓣周榜', icon: '📊', desc: '每周口碑风向标' },
  { id: 'maoyan', label: '猫眼大盘', icon: '🎟️', desc: '院线实时票房榜' },
  { id: 'bangumi', label: '新番周历', icon: '✨', desc: '日漫每日放送日程' },
];

/** 首页推荐区：支持全功能多维筛选 + 微短剧专区 + 爱奇艺官方榜 + 动漫新番周历 + 360热播榜 + 猫眼票房 + 影视热榜 + 百度实时榜 + 豆瓣Top250 */
export function RecommendSection({ onPick }: { onPick: (title: string) => void }) {
  const doubanEnabled = useAppStore((s) => s.doubanEnabled);
  const recommendSource = useAppStore((s) => s.recommendSource);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const handleSwitchSource = (sourceId: typeof recommendSource) => {
    if (sourceId === recommendSource) return;
    // 采用与主题切换一致的 W3C View Transitions 极速流体过渡
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).startViewTransition(() => {
        updateSettings({ recommendSource: sourceId, doubanEnabled: true });
      });
    } else {
      updateSettings({ recommendSource: sourceId, doubanEnabled: true });
    }
  };

  if (!doubanEnabled) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-line/60 rounded-2xl bg-chip/20 my-6">
        <p className="text-sm text-muted mb-3">首页推荐内容已处于停用状态</p>
        <button
          type="button"
          className="px-4 py-1.5 rounded-full bg-accent text-on-accent text-xs font-medium hover:bg-accent/90 transition-all active:scale-95 shadow-sm"
          onClick={() => updateSettings({ doubanEnabled: true })}
        >
          立即开启首页推荐
        </button>
      </div>
    );
  }

  return (
    <section className="my-6 space-y-3.5">
      {/* 极简流体推荐数据源切换栏：桌面端紧凑两端对齐，移动端平滑滚动无割裂 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 p-2 sm:p-2.5 bg-surface-raised/90 backdrop-blur-md rounded-2xl border border-line/60 shadow-xs">
        <div className="flex items-center gap-2 px-1 shrink-0">
          <span className="w-2 h-4 rounded-full bg-accent shrink-0 shadow-xs" />
          <span className="text-xs sm:text-sm font-bold text-content tracking-wide">推荐数据源</span>
          <span className="text-[11px] text-faint hidden lg:inline">· 点击即时切换</span>
        </div>

        {/* 交互胶囊选项组：紧凑轻量，去臃肿 tag，触感顺滑 */}
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 px-0.5 w-full md:w-auto">
          {RECOMMEND_SOURCES.map((s) => {
            const active = recommendSource === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSwitchSource(s.id)}
                className={cn(
                  'group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-200 active:scale-95 shrink-0 touch-manipulation cursor-pointer border',
                  active
                    ? 'bg-accent text-white border-accent shadow-sm font-semibold'
                    : 'bg-surface hover:bg-hover text-muted hover:text-content border-line/70 hover:border-accent/40'
                )}
                title={`切换到 ${s.label}（${s.desc}）`}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 动态内容视图 */}
      <div key={recommendSource} className="transition-opacity duration-300">
        {recommendSource === 'short-drama' && <ShortDramaView onPick={onPick} />}
        {recommendSource === 'iqiyi-hot' && <IqiyiHotView onPick={onPick} />}
        {recommendSource === '360-hot' && <Kan360HotView onPick={onPick} />}
        {recommendSource === 'baidu-top' && <BaiduTopView onPick={onPick} />}
        {recommendSource === 'douban-top250' && <DoubanTop250View onPick={onPick} />}
        {recommendSource === 'hot-list' && <HotListView onPick={onPick} />}
        {recommendSource === 'maoyan' && <MaoyanView onPick={onPick} />}
        {recommendSource === 'bangumi' && <BangumiView onPick={onPick} />}
        {recommendSource === 'douban' && <DoubanMultiCategoryView onPick={onPick} />}
        {recommendSource !== 'short-drama' &&
          recommendSource !== 'iqiyi-hot' &&
          recommendSource !== '360-hot' &&
          recommendSource !== 'baidu-top' &&
          recommendSource !== 'douban-top250' &&
          recommendSource !== 'hot-list' &&
          recommendSource !== 'maoyan' &&
          recommendSource !== 'bangumi' &&
          recommendSource !== 'douban' && <DoubanMultiCategoryView onPick={onPick} />}
      </div>
    </section>
  );
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

  // 短剧筛选状态
  const [shortDramaTheme, setShortDramaTheme] = useState('全部');
  const [shortDramaSort, setShortDramaSort] = useState('recommend');

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
      default: {
        return { type: 'tv' as const, tag: '热门', sort: 'recommend' as const };
      }
    }
  })();

  const query = useQuery({
    queryKey: ['douban-multi', category, type, tag, sort, page],
    queryFn: ({ signal }) => api.douban(type, tag, (page - 1) * 20, 20, signal, sort),
    enabled: category !== 'short_drama' && !(category === 'anime' && animeViewMode === 'bangumi'),
  });

  const shortDramaQuery = useQuery({
    queryKey: ['douban-multi-short-drama', page],
    queryFn: ({ signal }) => api.hotList('short_drama', signal, (page - 1) * 20),
    enabled: category === 'short_drama',
  });

  const activeQuery = category === 'short_drama' ? shortDramaQuery : query;

  const items = (() => {
    if (category === 'short_drama') {
      const list = shortDramaQuery.data?.items ?? [];
      if (shortDramaTheme === '全部') return list;
      if (shortDramaTheme === 'AI精选') {
        const aiMatched = list.filter((item) => /AI|智能|科技|脑洞|觉醒|系统|重生/.test(item.title));
        return aiMatched.length > 0 ? aiMatched : list.slice(0, 14);
      }
      const matched = list.filter((item) => item.title.includes(shortDramaTheme));
      return matched.length > 0 ? matched : list;
    }
    const rawItems = query.data?.items ?? [];
    return rawItems.filter((item) => !isShortDramaTitle(item.title));
  })();

  return (
    <section aria-label="影视多维分类大厅" className="space-y-3.5">
      {/* 核心分类与操作工具栏：分类左对齐，操作右对齐 */}
      <div className="flex items-center justify-between gap-2 p-1.5 sm:p-2 bg-chip/30 border border-line/40 rounded-xl">
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {PRIMARY_TABS.map((tab) => (
            <button
              key={tab.id}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 active:scale-95 shrink-0 flex items-center gap-1 touch-manipulation',
                category === tab.id
                  ? 'bg-accent text-on-accent shadow-xs font-semibold'
                  : 'text-muted hover:text-content hover:bg-hover'
              )}
              onClick={() => {
                setCategory(tab.id);
                setPage(1);
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={activeQuery.isFetching}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-line hover:border-accent/50 text-xs text-muted hover:text-content bg-surface hover:bg-hover transition-all active:scale-95 touch-manipulation cursor-pointer disabled:opacity-50"
            onClick={() => {
              setIsShuffling(true);
              setPage((prev) => (prev % 10) + 1);
              setTimeout(() => setIsShuffling(false), 500);
            }}
          >
            <span className={cn('text-xs transition-transform duration-500', (isShuffling || activeQuery.isFetching) && 'rotate-180')}>🔄</span>
            <span className="hidden sm:inline">换一批</span>
            <span className="text-[11px] font-mono text-faint">{page > 1 ? `${page}/10` : ''}</span>
          </button>
          <Link
            href={`/catalog?type=${category}`}
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-line hover:border-accent text-xs text-accent hover:bg-accent/10 transition-all font-medium"
          >
            <span>片库</span>
            <span>›</span>
          </Link>
        </div>
      </div>

      {/* 多维网页版筛选面板：单行自适应横滑，高度精简 */}
      <div className="bg-chip/40 border border-line/50 rounded-xl p-2 sm:p-2.5 space-y-1 sm:space-y-1.5">
        {category === 'short_drama' && (
          <>
            <FilterRow
              label="题材"
              options={SHORT_DRAMA_THEMES}
              active={shortDramaTheme}
              onSelect={(t) => {
                setShortDramaTheme(t);
                setPage(1);
              }}
            />
            <FilterRow
              label="排序"
              options={SHORT_DRAMA_SORTS.map((s) => s.label)}
              active={SHORT_DRAMA_SORTS.find((s) => s.id === shortDramaSort)?.label ?? '热门爽剧'}
              onSelect={(label) => {
                setShortDramaSort(SHORT_DRAMA_SORTS.find((s) => s.label === label)?.id ?? 'recommend');
                setPage(1);
              }}
            />
          </>
        )}

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
            <div className="flex items-center gap-2 pb-1 border-b border-line/40">
              <span className="shrink-0 text-faint font-medium w-8 sm:w-10 text-left sm:text-right text-xs">模式:</span>
              <div className="flex gap-2">
                <button
                  className={cn(
                    'px-2.5 py-0.5 rounded-md text-xs font-medium transition-all shrink-0 active:scale-95 touch-manipulation',
                    animeViewMode === 'douban' ? 'bg-accent text-on-accent font-semibold' : 'bg-chip text-muted hover:text-content'
                  )}
                  onClick={() => setAnimeViewMode('douban')}
                >
                  精选番剧库
                </button>
                <button
                  className={cn(
                    'px-2.5 py-0.5 rounded-md text-xs font-medium transition-all shrink-0 active:scale-95 touch-manipulation',
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

      {/* 动漫新番周更表模式直接内嵌渲染 */}
      {category === 'anime' && animeViewMode === 'bangumi' ? (
        <BangumiInlineView onPick={onPick} />
      ) : activeQuery.isError ? (
        <p className="text-center text-sm text-faint py-12">推荐内容加载失败，请稍后刷新或更换分类</p>
      ) : activeQuery.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-12">该分类组合暂无内容，请尝试其他标签</p>
      ) : (
        <HorizontalCardRow items={items} onPick={onPick} />
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
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 p-1.5 sm:p-2 bg-chip/30 border border-line/40 rounded-xl">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 active:scale-95 shrink-0',
              weekday === 'all'
                ? 'bg-accent text-on-accent shadow-xs font-semibold'
                : 'text-muted hover:text-content hover:bg-hover'
            )}
            onClick={() => setWeekday('all')}
          >
            全部星期
          </button>
          {WEEKDAYS.map((name, i) => (
            <button
              key={name}
              type="button"
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 active:scale-95 shrink-0',
                weekday === i + 1
                  ? 'bg-accent text-on-accent shadow-xs font-semibold'
                  : 'text-muted hover:text-content hover:bg-hover'
              )}
              onClick={() => setWeekday(i + 1)}
            >
              {name}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-faint shrink-0 hidden md:inline-block px-2">
          ✨ 每日新番放送日程
        </span>
      </div>

      {query.isError ? (
        <p className="text-center text-sm text-faint py-12">新番日历加载失败，请稍后重试</p>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-12">暂无新番连载数据</p>
      ) : (
        <HorizontalCardRow items={items} onPick={onPick} maxItems={24} />
      )}
    </div>
  );
}

/** 独立 Bangumi 每日放送全屏视图（设置指定时使用） */
function BangumiView({ onPick }: { onPick: (title: string) => void }) {
  return (
    <section aria-label="新番放送推荐" className="space-y-3.5">
      <BangumiInlineView onPick={onPick} />
    </section>
  );
}

const KAN360_HOT_LISTS = [
  { id: '360_teleplay', label: '🔥 电视剧' },
  { id: '360_movie', label: '🎬 电影' },
  { id: '360_variety', label: '🎤 综艺' },
  { id: '360_anime', label: '✨ 动漫' },
];

/** 360 影视实时热播大盘视图：官方开放 CDN、极速秒开、零风控 */
function Kan360HotView({ onPick }: { onPick: (title: string) => void }) {
  const [listId, setListId] = useState(KAN360_HOT_LISTS[0].id);

  const query = useQuery({
    queryKey: ['360-hot', listId],
    queryFn: ({ signal }) => api.hotList(listId, signal),
    staleTime: 30_000,
    refetchOnMount: true,
  });

  const items = query.data?.items ?? [];

  return (
    <section aria-label="360 影视热播榜" className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 p-1.5 sm:p-2 bg-chip/30 border border-line/40 rounded-xl">
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {KAN360_HOT_LISTS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setListId(l.id)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 active:scale-95 shrink-0',
                listId === l.id
                  ? 'bg-accent text-on-accent shadow-xs font-semibold'
                  : 'text-muted hover:text-content hover:bg-hover'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-faint shrink-0 hidden sm:inline-block px-2">
          ⚡ 全网影视实时热播排行
        </span>
      </div>

      {query.isError ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-faint">热榜数据加载失败</p>
          <button
            type="button"
            className="px-3 py-1 text-xs rounded-full bg-accent text-on-accent"
            onClick={() => query.refetch()}
          >
            点击重试
          </button>
        </div>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-12">暂无热播内容，请尝试其他分类</p>
      ) : (
        <HorizontalCardRow items={items} onPick={onPick} />
      )}
    </section>
  );
}

const BAIDU_TOP_LISTS = [
  { id: 'baidu_teleplay', label: '🔥 热门电视剧' },
  { id: 'baidu_movie', label: '🎬 热门电影' },
];

/** 百度实时风云榜视图：直连秒开、多重容灾、高可用 */
function BaiduTopView({ onPick }: { onPick: (title: string) => void }) {
  const [listId, setListId] = useState(BAIDU_TOP_LISTS[0].id);

  const query = useQuery({
    queryKey: ['baidu-top', listId],
    queryFn: ({ signal }) => api.hotList(listId, signal),
    staleTime: 30_000,
    refetchOnMount: true,
  });

  const items = query.data?.items ?? [];

  return (
    <section aria-label="百度实时热榜" className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 p-1.5 sm:p-2 bg-chip/30 border border-line/40 rounded-xl">
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {BAIDU_TOP_LISTS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setListId(l.id)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 active:scale-95 shrink-0',
                listId === l.id
                  ? 'bg-accent text-on-accent shadow-xs font-semibold'
                  : 'text-muted hover:text-content hover:bg-hover'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-faint shrink-0 hidden sm:inline-block px-2">
          📈 百度指数搜索风云榜
        </span>
      </div>

      {query.isError ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-faint">热榜数据加载失败</p>
          <button
            type="button"
            className="px-3 py-1 text-xs rounded-full bg-accent text-on-accent"
            onClick={() => query.refetch()}
          >
            点击重试
          </button>
        </div>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-12">暂无热播内容，请尝试其他分类</p>
      ) : (
        <HorizontalCardRow items={items} onPick={onPick} />
      )}
    </section>
  );
}

/** 豆瓣 Top250 经典殿堂视图：支持真实分页换一批 */
function DoubanTop250View({ onPick }: { onPick: (title: string) => void }) {
  const [page, setPage] = useState(1);
  const [isShuffling, setIsShuffling] = useState(false);

  const query = useQuery({
    queryKey: ['douban-top250', page],
    queryFn: ({ signal }) => api.hotList('douban_top250', signal, (page - 1) * 20),
    staleTime: 60_000,
    refetchOnMount: true,
  });

  const items = query.data?.items ?? [];

  return (
    <section aria-label="豆瓣 Top250" className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 p-1.5 sm:p-2 bg-chip/30 border border-line/40 rounded-xl">
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-semibold text-content">🏆 豆瓣电影 Top 250 经典影单</span>
          <span className="text-[11px] text-faint hidden sm:inline">影史殿堂高分传世神作</span>
        </div>
        <button
          type="button"
          disabled={query.isFetching}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-line hover:border-accent/50 text-xs text-muted hover:text-content bg-surface hover:bg-hover transition-all active:scale-95 shrink-0 cursor-pointer disabled:opacity-50"
          onClick={() => {
            setIsShuffling(true);
            setPage((prev) => (prev % 12) + 1);
            setTimeout(() => setIsShuffling(false), 500);
          }}
        >
          <span className={cn('text-xs transition-transform duration-500', (isShuffling || query.isFetching) && 'rotate-180')}>🔄</span>
          <span>换一批 {page > 1 ? `(第${page}/12组)` : ''}</span>
        </button>
      </div>

      {query.isError ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-faint">豆瓣 Top250 加载失败</p>
          <button
            type="button"
            className="px-3 py-1 text-xs rounded-full bg-accent text-on-accent"
            onClick={() => query.refetch()}
          >
            点击重试
          </button>
        </div>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-12">暂无内容</p>
      ) : (
        <HorizontalCardRow items={items} onPick={onPick} />
      )}
    </section>
  );
}

const DOUBAN_WEEKLY_LISTS = [
  { id: 'douban_movie_weekly', label: '🎬 电影口碑' },
  { id: 'douban_tv_chinese', label: '📺 华语剧集' },
  { id: 'douban_tv_global', label: '🌍 海外剧集' },
  { id: 'douban_show_chinese', label: '🎤 国内综艺' },
  { id: 'douban_show_global', label: '🌟 海外综艺' },
];

/** 豆瓣影视周榜视图 */
function HotListView({ onPick }: { onPick: (title: string) => void }) {
  const [listId, setListId] = useState(DOUBAN_WEEKLY_LISTS[0].id);

  const query = useQuery({
    queryKey: ['hot-list', listId],
    queryFn: ({ signal }) => api.hotList(listId, signal),
    staleTime: 30_000,
    refetchOnMount: true,
  });

  const items = query.data?.items ?? [];

  return (
    <section aria-label="豆瓣口碑周榜" className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 p-1.5 sm:p-2 bg-chip/30 border border-line/40 rounded-xl">
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {DOUBAN_WEEKLY_LISTS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setListId(l.id)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 active:scale-95 shrink-0',
                listId === l.id
                  ? 'bg-accent text-on-accent shadow-xs font-semibold'
                  : 'text-muted hover:text-content hover:bg-hover'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-faint shrink-0 hidden md:inline-block px-2">
          📊 每周口碑风向标
        </span>
      </div>

      {query.isError ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-faint">周榜数据加载失败</p>
          <button
            type="button"
            className="px-3 py-1 text-xs rounded-full bg-accent text-on-accent"
            onClick={() => query.refetch()}
          >
            点击重试
          </button>
        </div>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-12">暂无口碑榜单内容</p>
      ) : (
        <HorizontalCardRow items={items} onPick={onPick} />
      )}
    </section>
  );
}

/** 猫眼院线大盘榜视图 */
function MaoyanView({ onPick }: { onPick: (title: string) => void }) {
  const query = useQuery({
    queryKey: ['maoyan-movie'],
    queryFn: ({ signal }) => api.hotList('maoyan_movie', signal),
    staleTime: 30_000,
    refetchOnMount: true,
  });

  const items = query.data?.items ?? [];

  return (
    <section aria-label="猫眼院线票房榜" className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 p-1.5 sm:p-2 bg-chip/30 border border-line/40 rounded-xl">
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-semibold text-content">🎟️ 猫眼院线实时票房大盘</span>
          <span className="text-[11px] text-faint hidden sm:inline">院线热映票房与上座率</span>
        </div>
        <span className="text-[11px] text-faint shrink-0 px-2">
          ⚡ 实时统计
        </span>
      </div>

      {query.isError ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-faint">票房大盘数据加载失败</p>
          <button
            type="button"
            className="px-3 py-1 text-xs rounded-full bg-accent text-on-accent"
            onClick={() => query.refetch()}
          >
            点击重试
          </button>
        </div>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-12">暂无票房内容</p>
      ) : (
        <HorizontalCardRow items={items} onPick={onPick} />
      )}
    </section>
  );
}

const IQIYI_HOT_LISTS = [
  { id: 'iqiyi_tv', label: '🔥 热门电视剧' },
  { id: 'iqiyi_movie', label: '🎬 热门电影' },
  { id: 'iqiyi_variety', label: '🎤 热门综艺' },
  { id: 'iqiyi_anime', label: '✨ 热门动漫' },
];

/** 爱奇艺官方实时热播榜视图：高清真图、官方热度、秒播体验 */
function IqiyiHotView({ onPick }: { onPick: (title: string) => void }) {
  const [listId, setListId] = useState(IQIYI_HOT_LISTS[0].id);

  const query = useQuery({
    queryKey: ['iqiyi-hot', listId],
    queryFn: ({ signal }) => api.hotList(listId, signal),
    staleTime: 30_000,
    refetchOnMount: true,
  });

  const items = query.data?.items ?? [];

  return (
    <section aria-label="爱奇艺实时热播榜" className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 p-1.5 sm:p-2 bg-chip/30 border border-line/40 rounded-xl">
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {IQIYI_HOT_LISTS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setListId(l.id)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 active:scale-95 shrink-0',
                listId === l.id
                  ? 'bg-accent text-on-accent shadow-xs font-semibold'
                  : 'text-muted hover:text-content hover:bg-hover'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-faint shrink-0 hidden sm:inline-block px-2">
          💚 爱奇艺全网主流热播榜单
        </span>
      </div>

      {query.isError ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-faint">热榜数据加载失败</p>
          <button
            type="button"
            className="px-3 py-1 text-xs rounded-full bg-accent text-on-accent"
            onClick={() => query.refetch()}
          >
            点击重试
          </button>
        </div>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-12">暂无热播内容，请尝试其他分类</p>
      ) : (
        <HorizontalCardRow items={items} onPick={onPick} />
      )}
    </section>
  );
}

/**
 * 竖屏短内容子分类定义。
 * slug 与 /api/hot-list 的 id 对齐；count 为实测条目量级，仅用于展示。
 */
const VERTICAL_SHORT_TABS = [
  { slug: 'short_drama', label: '微短剧', icon: '📱', desc: '爽文短剧全集直连', count: '2.4万+' },
  { slug: 'ai_comic', label: 'AI 漫剧', icon: '🎨', desc: 'AI 生成竖屏短剧', count: '2.9万+' },
  { slug: 'movie_commentary', label: '电影解说', icon: '🎬', desc: '竖屏解说速看', count: '3.7万+' },
] as const;

type VerticalShortTab = (typeof VERTICAL_SHORT_TABS)[number]['slug'];

/**
 * 竖屏短内容专区视图：微短剧 / AI 漫剧 / 电影解说三个子分类共用一套版式。
 *
 * 响应式策略（手机 / 平板 / Web 通用）：
 * - 子分类 tab 用横向滚动（overflow-x-auto + 隐藏滚动条），窄屏不换行、不挤压「换一批」按钮
 * - 卡片网格沿用项目既有断点：2 列（手机）→ 3（sm）→ 4（md）→ 5（lg）→ 6（xl）→ 7（2xl）
 * - 标题副文案在窄屏隐藏（hidden sm:inline），避免与 tab 同行导致溢出
 */
function ShortDramaView({ onPick }: { onPick: (title: string) => void }) {
  const [tab, setTab] = useState<VerticalShortTab>('short_drama');
  const [page, setPage] = useState(1);
  const [isShuffling, setIsShuffling] = useState(false);

  const query = useQuery({
    queryKey: ['vertical-short', tab, page],
    queryFn: ({ signal }) => api.hotList(tab, signal, (page - 1) * 20),
    staleTime: 30_000,
    refetchOnMount: true,
  });

  const items = query.data?.items ?? [];
  const activeTab = VERTICAL_SHORT_TABS.find((t) => t.slug === tab) ?? VERTICAL_SHORT_TABS[0];

  // 切换子分类时回到第一页，避免停留在新分类的越界页码
  const handleTabChange = (next: VerticalShortTab) => {
    if (next === tab) return;
    setTab(next);
    setPage(1);
  };

  return (
    <section aria-label="竖屏短内容专区" className="space-y-3.5">
      {/* 子分类切换：窄屏横向滚动，宽屏与标题同行 */}
      <div className="p-1.5 sm:p-2 bg-chip/30 border border-line/40 rounded-xl space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 px-1 min-w-0">
            <span className="text-xs font-semibold text-content shrink-0">
              {activeTab.icon} 竖屏短内容
            </span>
            <span className="text-[11px] text-faint hidden sm:inline truncate">
              {activeTab.desc} · 共 {activeTab.count}
            </span>
          </div>
          <button
            type="button"
            disabled={query.isFetching}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-line hover:border-accent/50 text-xs text-muted hover:text-content bg-surface hover:bg-hover transition-all active:scale-95 shrink-0 cursor-pointer disabled:opacity-50"
            onClick={() => {
              setIsShuffling(true);
              setPage((prev) => (prev % 10) + 1);
              setTimeout(() => setIsShuffling(false), 500);
            }}
          >
            <span className={cn('text-xs transition-transform duration-500', (isShuffling || query.isFetching) && 'rotate-180')}>🔄</span>
            <span className="hidden sm:inline">换一批</span>
            {page > 1 && <span className="sm:hidden">{page}</span>}
          </button>
        </div>

        {/* Tab 条：手机可横向滑动，pad/web 直接铺开 */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
          role="tablist"
          aria-label="短内容子分类"
        >
          {VERTICAL_SHORT_TABS.map((t) => {
            const active = t.slug === tab;
            return (
              <button
                key={t.slug}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleTabChange(t.slug)}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap shrink-0 transition-all active:scale-95 cursor-pointer',
                  active
                    ? 'bg-accent text-on-accent font-medium shadow-sm'
                    : 'text-muted hover:text-content bg-surface/60 hover:bg-hover border border-line/60'
                )}
              >
                <span aria-hidden>{t.icon}</span>
                <span>{t.label}</span>
                <span className={cn('text-[10px]', active ? 'opacity-80' : 'text-faint')}>{t.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {query.isError ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-faint">{activeTab.label}数据加载失败</p>
          <button
            type="button"
            className="px-3 py-1 text-xs rounded-full bg-accent text-on-accent"
            onClick={() => query.refetch()}
          >
            点击重试
          </button>
        </div>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-12">暂无{activeTab.label}数据</p>
      ) : (
        // 断点沿用项目通用卡片网格：2/3/4/5/6/7 列覆盖手机到超宽屏
        <HorizontalCardRow items={items} onPick={onPick} />
      )}
    </section>
  );
}

function GridSkeleton() {
  return (
    <div className="flex gap-2.5 sm:gap-3.5 overflow-hidden py-1 px-0.5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="w-[125px] sm:w-[145px] md:w-[160px] shrink-0">
          <div className="aspect-[2/3] rounded-xl bg-chip animate-pulse border border-line/40" />
          <div className="h-3 mt-2 rounded bg-chip animate-pulse w-3/4" />
        </div>
      ))}
    </div>
  );
}

/** 推荐源单行横向平滑滚动卡片轨道（收敛垂直空间，桌面端 hover 箭头，触屏原生滑动） */
function HorizontalCardRow({
  items,
  onPick,
  maxItems = 16,
}: {
  items: DoubanItem[];
  onPick: (title: string) => void;
  maxItems?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const clientWidth = scrollRef.current.clientWidth;
    const scrollAmount = direction === 'left' ? -clientWidth * 0.75 : clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  return (
    <div className="relative group/row">
      <button
        type="button"
        onClick={() => scroll('left')}
        className="absolute -left-2.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-surface-raised/95 border border-line shadow-md text-content hidden md:flex items-center justify-center opacity-0 group-hover/row:opacity-100 hover:scale-110 active:scale-95 transition-all cursor-pointer"
        title="向左滚动"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => scroll('right')}
        className="absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-surface-raised/95 border border-line shadow-md text-content hidden md:flex items-center justify-center opacity-0 group-hover/row:opacity-100 hover:scale-110 active:scale-95 transition-all cursor-pointer"
        title="向右滚动"
      >
        ›
      </button>

      <div
        ref={scrollRef}
        className="flex gap-2.5 sm:gap-3.5 overflow-x-auto no-scrollbar scroll-smooth py-1 px-0.5"
      >
        {items.slice(0, maxItems).map((item) => (
          <div key={item.id} className="w-[125px] sm:w-[145px] md:w-[160px] shrink-0">
            <DoubanCard item={item} onClick={() => onPick(item.title)} />
          </div>
        ))}
      </div>
    </div>
  );
}
