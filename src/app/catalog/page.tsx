'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { DoubanCard, AggregatedCard, aggregateResults } from '@/components/video-card';
import { DetailModal } from '@/components/detail-modal';
import { MobileFilterSheet } from '@/components/mobile-filter-sheet';
import { api } from '@/lib/client-api';
import { useAuth } from '@/components/auth';
import { useTranslation } from '@/lib/i18n';
import { buildWatchUrl, cn, validateSourceUrl } from '@/lib/utils';
import { isShortDramaTitle } from '@/lib/short-drama';
import { useAppStore, resolveSource, isInDisabledSubscription, isSourceDisabled } from '@/lib/store';
import { useToast } from '@/components/toast';
import type { SearchResultItem, SourceSearchOutcome, DoubanItem } from '@/lib/types';

type ChannelType = 'movie' | 'tv' | 'short_drama' | 'ai' | 'anime' | 'variety' | 'documentary';

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
    regions: ['全部', '大陆', '美国', '韩国', '日本', '香港', '台湾', '英国', '泰国'],
    genres: ['全部', '言情', '古装', '都市', '剧情', '悬疑', '喜剧', '科幻', '武侠', '谍战', '历史', '伦理', '偶像'],
  },
  {
    id: 'short_drama',
    label: '短剧',
    icon: '📱',
    subTitle: '热门微短剧 · 爽文逆袭 · 全集秒播',
    regions: ['全部', '都市', '古装', '战神', '甜宠', '逆袭', '重生', 'AI精选'],
    genres: ['全部', '战神', '总裁', '甜宠', '重生', '神医', '穿越', '豪门', '赘婿'],
  },
  {
    id: 'ai',
    label: 'AI专区',
    icon: '🤖',
    subTitle: 'AI短剧 · 脑洞神作 · 未来科幻 · 智能精选',
    regions: ['全部', 'AI短剧', '科幻脑洞', '数字人生', '未来世界', '硬核科技'],
    genres: ['全部', 'AI精选', '战神', '逆袭', '悬疑', '修仙', '重生', '异能'],
  },
  {
    id: 'anime',
    label: '动漫',
    icon: '✨',
    subTitle: '连载新番 · 热血神作 · 剧场版经典',
    regions: ['全部', '日本', '大陆', '美国'],
    genres: ['全部', '热血', '冒险', '搞笑', '奇幻', '科幻', '战斗', '恋爱', '校园', '悬疑', '治愈', '机战', '运动', '励志'],
  },
  {
    id: 'variety',
    label: '综艺',
    icon: '🎤',
    subTitle: '爆笑下饭 · 音乐舞台 · 真实真人秀',
    regions: ['全部', '大陆', '韩国', '香港', '台湾', '美国'],
    genres: ['全部', '真人秀', '脱口秀', '音乐', '访谈', '晚会', '文化', '情感', '搞笑', '美食', '竞技'],
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

export type CatalogSourceId = 'iqiyi' | 'baidu' | 'maoyan' | 'bangumi' | '360' | 'douban';

interface CatalogSourceMeta {
  id: CatalogSourceId;
  label: string;
  icon: string;
  badge: string;
  subTitle: string;
}

const CATALOG_SOURCES: CatalogSourceMeta[] = [
  { id: 'iqiyi', label: '爱奇艺热榜', icon: '💚', badge: '实时热度', subTitle: '官方全端热播榜 · 实时爆款剧集与新片' },
  { id: 'baidu', label: '百度风云榜', icon: '📈', badge: '全网热搜', subTitle: '全网综合搜索大盘 · 实时各大平台热度' },
  { id: 'maoyan', label: '猫眼院线榜', icon: '🎟️', badge: '票房大盘', subTitle: '影院正在热映 · 实时票房排片大盘' },
  { id: 'bangumi', label: '新番周历', icon: '✨', badge: '连载放送', subTitle: '当季最新连载动漫 · 每日更新时间表' },
  { id: '360', label: '全网片库', icon: '🔥', badge: '多维细选', subTitle: '按地区、年份、类型自由筛选海量片库' },
  { id: 'douban', label: '豆瓣高分榜', icon: '🏆', badge: '口碑经典', subTitle: '每周口碑新片榜 · 影史高分 Top250' },
];

const CHANNEL_SOURCES: Record<ChannelType, CatalogSourceId[]> = {
  movie: ['iqiyi', 'baidu', 'maoyan', '360', 'douban'],
  tv: ['iqiyi', 'baidu', '360', 'douban'],
  short_drama: ['360', 'iqiyi'],
  ai: ['360', 'iqiyi'],
  anime: ['bangumi', 'iqiyi', 'baidu', '360'],
  variety: ['iqiyi', '360', 'douban', 'baidu'],
  documentary: ['360', 'douban'],
};

const BANGUMI_WEEKDAYS = ['全部', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const YEARS = ['全部', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', '2010', '2000'];

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
  const { verified } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();

  // URL 参数优先，支持外部链接与浏览器前进后退
  const rawType = searchParams.get('type') || 'movie';
  const currentChannel: ChannelType = CHANNELS_CONFIG.some((c) => c.id === rawType)
    ? (rawType as ChannelType)
    : 'movie';

  // 数据源切换
  const rawSource = searchParams.get('source') as CatalogSourceId | null;
  const availableSources = CHANNEL_SOURCES[currentChannel] || ['360'];
  const currentSource: CatalogSourceId = rawSource && availableSources.includes(rawSource)
    ? rawSource
    : availableSources[0];

  // Bangumi 星期子选项
  const currentWeekday = searchParams.get('weekday') || '全部';

  // 豆瓣子选项
  const currentDoubanSubTab = searchParams.get('subTab') || (currentChannel === 'movie' ? 'weekly' : 'chinese');

  // 片库筛选参数
  const currentRegion = searchParams.get('region') || '全部';
  const currentGenre = searchParams.get('genre') || '全部';
  const currentYear = searchParams.get('year') || '全部';
  const currentSort = (searchParams.get('sort') || 'recommend') as 'recommend' | 'time' | 'rank';
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  // 片库内双模搜索状态
  const urlQuery = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(urlQuery);
  const [searchMode, setSearchMode] = useState<'vod' | 'filter'>('vod');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [streamedOutcomes, setStreamedOutcomes] = useState<SourceSearchOutcome[]>([]);
  const [detailItem, setDetailItem] = useState<SearchResultItem | null>(null);

  const [jumpPageInput, setJumpPageInput] = useState('');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // 点播源与搜索存储
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const selectedKeys = useAppStore((s) => s.selectedKeys);
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const sourceHealth = useAppStore((s) => s.sourceHealth);
  const subscriptions = useAppStore((s) => s.subscriptions);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setSearchInput(urlQuery);
  }, [urlQuery]);

  const activeChannelConfig = useMemo(
    () => CHANNELS_CONFIG.find((c) => c.id === currentChannel) || CHANNELS_CONFIG[0],
    [currentChannel]
  );

  const selectedSources = useMemo(() => {
    const seen = new Set<string>();
    return selectedKeys
      .map((key) => resolveSource({ customAPIs, envSources }, key))
      .filter((s): s is NonNullable<typeof s> => {
        if (!s || !validateSourceUrl(s.url) || seen.has(s.key)) return false;
        seen.add(s.key);
        return true;
      })
      .filter((s) => !isSourceDisabled({ sourceHealth }, s.key))
      .filter((s) => !isInDisabledSubscription({ subscriptions }, s.key));
  }, [customAPIs, envSources, selectedKeys, sourceHealth, subscriptions]);

  const updateFilters = (changes: {
    type?: string;
    source?: string;
    weekday?: string;
    subTab?: string;
    region?: string;
    genre?: string;
    year?: string;
    sort?: string;
    page?: number;
    q?: string;
  }) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (changes.type !== undefined) {
      sp.set('type', changes.type);
      sp.delete('region');
      sp.delete('genre');
      sp.delete('weekday');
      sp.delete('subTab');
      sp.delete('q');
      sp.set('page', '1');
      const validSources = CHANNEL_SOURCES[changes.type as ChannelType] || ['360'];
      if (!validSources.includes(currentSource)) {
        sp.set('source', validSources[0]);
      }
    }
    if (changes.source !== undefined) {
      sp.set('source', changes.source);
      sp.set('page', '1');
      sp.delete('q');
    }
    if (changes.weekday !== undefined) {
      if (changes.weekday === '全部') sp.delete('weekday');
      else sp.set('weekday', changes.weekday);
      sp.set('page', '1');
    }
    if (changes.subTab !== undefined) {
      sp.set('subTab', changes.subTab);
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
    if (changes.q !== undefined) {
      if (!changes.q) sp.delete('q');
      else sp.set('q', changes.q);
      sp.set('page', '1');
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

  // 1. 全网采集源直搜 React Query（当 URL 存在 ?q= 触发）
  const vodSearchQuery = useQuery({
    queryKey: ['catalog-vod-search', urlQuery, selectedKeys, yellowFilter],
    queryFn: ({ signal }) => {
      setStreamedOutcomes([]);
      return api.search(urlQuery.slice(0, 100), selectedSources, yellowFilter, {
        signal,
        onSource: (outcome) => {
          setStreamedOutcomes((prev) => [...prev, outcome]);
        },
      });
    },
    enabled: Boolean(urlQuery) && selectedSources.length > 0,
    staleTime: 300_000,
  });

  const isVodSearching = Boolean(urlQuery) && vodSearchQuery.isFetching && !vodSearchQuery.data;
  const streamedList = useMemo(
    () => streamedOutcomes.flatMap((o) => o.list),
    [streamedOutcomes]
  );
  const searchResultList = useMemo(
    () => vodSearchQuery.data?.list ?? (isVodSearching ? streamedList : []),
    [vodSearchQuery.data, isVodSearching, streamedList]
  );
  const searchGroups = useMemo(() => aggregateResults(searchResultList), [searchResultList]);

  // 2. 片库与实时热榜数据 Query
  const catalogQuery = useQuery({
    queryKey: [
      'catalog',
      currentChannel,
      currentSource,
      currentWeekday,
      currentDoubanSubTab,
      queryTag,
      currentRegion,
      currentGenre,
      currentYear,
      currentSort,
      currentPage,
    ],
    queryFn: async ({ signal }) => {
      // 1. 短剧或 AI 专区
      if (currentChannel === 'short_drama' || currentChannel === 'ai') {
        const res = await api.hotList('short_drama', signal, pageStart);
        const mapped = currentChannel === 'ai'
          ? res.items.map((item) => ({
              ...item,
              rating: item.rating === '微短剧' ? 'AI精选' : item.rating,
            }))
          : res.items;
        return { items: mapped, total: 200 };
      }

      // 2. Bangumi 新番周历
      if (currentSource === 'bangumi' && currentChannel === 'anime') {
        const calendar = await api.bangumiCalendar(signal);
        if (!calendar?.days) return { items: [], total: 0 };
        const dayIdx = BANGUMI_WEEKDAYS.indexOf(currentWeekday);
        if (currentWeekday === '全部' || dayIdx <= 0) {
          const allItems = calendar.days.flatMap((d) => d.items);
          return { items: allItems, total: allItems.length };
        }
        const targetDay = calendar.days.find((d) => d.weekday === dayIdx);
        const dayItems = targetDay?.items || [];
        return { items: dayItems, total: dayItems.length };
      }

      // 3. 爱奇艺官方实时榜
      if (currentSource === 'iqiyi') {
        let hotKey: 'iqiyi_tv' | 'iqiyi_movie' | 'iqiyi_anime' | 'iqiyi_variety' = 'iqiyi_movie';
        if (currentChannel === 'tv') hotKey = 'iqiyi_tv';
        else if (currentChannel === 'anime') hotKey = 'iqiyi_anime';
        else if (currentChannel === 'variety') hotKey = 'iqiyi_variety';
        else hotKey = 'iqiyi_movie';
        const res = await api.hotList(hotKey, signal);
        return { items: res.items, total: res.items.length };
      }

      // 4. 百度风云榜
      if (currentSource === 'baidu') {
        let hotKey: 'baidu_movie' | 'baidu_teleplay' | 'baidu_anime' = 'baidu_movie';
        if (currentChannel === 'tv') hotKey = 'baidu_teleplay';
        else if (currentChannel === 'anime') hotKey = 'baidu_anime';
        else hotKey = 'baidu_movie';
        const res = await api.hotList(hotKey, signal);
        return { items: res.items, total: res.items.length };
      }

      // 5. 猫眼院线票房榜
      if (currentSource === 'maoyan') {
        const res = await api.hotList('maoyan_movie', signal);
        return { items: res.items, total: res.items.length };
      }

      // 6. 豆瓣高分与周榜
      if (currentSource === 'douban') {
        if (currentChannel === 'movie') {
          if (currentDoubanSubTab === 'top250' || currentSort === 'rank') {
            const res = await api.hotList('douban_top250', signal, pageStart);
            return { items: res.items, total: 250 };
          }
          const res = await api.hotList('douban_movie_weekly', signal);
          return { items: res.items, total: res.items.length };
        }
        if (currentChannel === 'tv') {
          const listId = currentDoubanSubTab === 'global' ? 'douban_tv_global' : 'douban_tv_chinese';
          const res = await api.hotList(listId, signal);
          return { items: res.items, total: res.items.length };
        }
        if (currentChannel === 'variety') {
          const listId = currentDoubanSubTab === 'global' ? 'douban_show_global' : 'douban_show_chinese';
          const res = await api.hotList(listId, signal);
          return { items: res.items, total: res.items.length };
        }
        const res = await api.hotList('douban_movie_weekly', signal);
        return { items: res.items, total: res.items.length };
      }

      // 7. 默认 360 全网片库多维筛选
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return api.douban(currentChannel as any, queryTag, pageStart, PAGE_SIZE, signal, currentSort, {
        area: currentRegion,
        genre: currentGenre,
        year: currentYear,
      });
    },
    staleTime: 5 * 60_000,
    enabled: !urlQuery,
  });

  const rawItems = catalogQuery.data?.items ?? [];
  const baseItems = currentChannel === 'short_drama' || currentChannel === 'ai'
    ? rawItems
    : rawItems.filter((item) => !isShortDramaTitle(item.title));

  const items: DoubanItem[] = useMemo(() => {
    if (!filterKeyword.trim()) return baseItems;
    const kw = filterKeyword.trim().toLowerCase();
    return baseItems.filter((item) => item.title.toLowerCase().includes(kw));
  }, [baseItems, filterKeyword]);

  const total = catalogQuery.data?.total ?? (items.length > 0 ? items.length * 10 : 0);
  const totalPages = Math.max(1, Math.min(500, Math.ceil(total / PAGE_SIZE)));

  // 点击卡片直接进入播放前进行登录校验
  const handleCardClick = (title: string) => {
    const watchUrl = buildWatchUrl({ title });
    if (!verified) {
      router.push(`/login?redirect=${encodeURIComponent(watchUrl)}`);
      return;
    }
    router.push(watchUrl);
  };

  const handleExecuteSearch = (val: string) => {
    const q = val.trim();
    if (!q) {
      updateFilters({ q: '' });
      setFilterKeyword('');
      return;
    }
    if (searchMode === 'vod') {
      if (selectedSources.length === 0) {
        toast('请先在全局设置中添加并勾选点播采集源', 'warning');
        return;
      }
      updateFilters({ q });
    } else {
      setFilterKeyword(q);
    }
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setFilterKeyword('');
    updateFilters({ q: '' });
  };

  const hasActiveFilters =
    currentRegion !== '全部' || currentGenre !== '全部' || currentYear !== '全部' || currentSort !== 'recommend';
  const activeFilterCount =
    (currentRegion !== '全部' ? 1 : 0) +
    (currentGenre !== '全部' ? 1 : 0) +
    (currentYear !== '全部' ? 1 : 0);

  const activeSourceMeta = useMemo(
    () => CATALOG_SOURCES.find((s) => s.id === currentSource) || CATALOG_SOURCES[0],
    [currentSource]
  );

  return (
    <div className="min-h-screen flex flex-col bg-bg text-content">
      <Header showSearch />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5 space-y-4 pb-28 md:pb-8 overflow-x-hidden">
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

        {/* 片库内双模即时搜索栏 */}
        <div className="bg-surface border border-line rounded-2xl p-3 sm:p-3.5 shadow-xs space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleExecuteSearch(searchInput);
            }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          >
            {/* 搜索模式切换 */}
            <div className="flex items-center p-0.5 bg-chip/60 border border-line/60 rounded-xl shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setSearchMode('vod')}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-lg font-medium transition-all',
                  searchMode === 'vod'
                    ? 'bg-accent text-on-accent font-semibold shadow-xs'
                    : 'text-muted hover:text-content'
                )}
                title="实时向所有勾选的真实采集站并发检索最新资源"
              >
                🌐 全网直搜
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('filter')}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-lg font-medium transition-all',
                  searchMode === 'filter'
                    ? 'bg-accent text-on-accent font-semibold shadow-xs'
                    : 'text-muted hover:text-content'
                )}
                title="秒级在当前片库/热榜中按片名筛选"
              >
                ⚡ 榜单过滤
              </button>
            </div>

            {/* 输入框 */}
            <div className="relative flex-1 flex items-center">
              <span className="absolute left-3 text-muted pointer-events-none text-xs">🔍</span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (searchMode === 'filter') {
                    setFilterKeyword(e.target.value);
                  }
                }}
                placeholder={
                  searchMode === 'vod'
                    ? `在全网采集源中实时直搜最新${activeChannelConfig.label}（按回车搜索）...`
                    : `在当前【${activeSourceMeta.label}】中快速过滤片名...`
                }
                className="w-full pl-8 pr-8 py-2 rounded-xl bg-chip/50 hover:bg-chip focus:bg-surface border border-line/60 focus:border-accent text-xs sm:text-sm text-content placeholder:text-faint transition-all focus:outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2.5 text-xs text-faint hover:text-content p-1"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary py-2 px-4 text-xs font-semibold rounded-xl shrink-0 active:scale-95 shadow-xs"
            >
              {searchMode === 'vod' ? '全网直搜' : '过滤片名'}
            </button>
          </form>

          {/* 搜索提示或快捷热搜词 */}
          <div className="flex items-center justify-between text-[11px] text-faint px-1">
            <span className="truncate">
              {urlQuery ? (
                <span className="text-accent font-medium">
                  正在查看全网聚合搜索 “{urlQuery}” 的结果
                </span>
              ) : (
                <span>
                  🔥 热门推荐: <button type="button" onClick={() => handleExecuteSearch('凡人修仙传')} className="hover:text-accent underline ml-1">凡人修仙传</button> · <button type="button" onClick={() => handleExecuteSearch('庆余年')} className="hover:text-accent underline ml-1">庆余年</button> · <button type="button" onClick={() => handleExecuteSearch('热辣滚烫')} className="hover:text-accent underline ml-1">热辣滚烫</button> · <button type="button" onClick={() => handleExecuteSearch('咒术回战')} className="hover:text-accent underline ml-1">咒术回战</button>
                </span>
              )}
            </span>
            {urlQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="text-accent hover:underline shrink-0 ml-2"
              >
                ✕ 清除搜索返回片库
              </button>
            )}
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

        {/* 二级数据源与榜单引擎切换器 */}
        {!urlQuery && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                {availableSources.map((srcId) => {
                  const meta = CATALOG_SOURCES.find((s) => s.id === srcId) || CATALOG_SOURCES[0];
                  const isSelected = currentSource === srcId;
                  return (
                    <button
                      key={srcId}
                      type="button"
                      onClick={() => updateFilters({ source: srcId })}
                      className={cn(
                        'flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-semibold transition-all shrink-0 active:scale-95 border cursor-pointer touch-manipulation',
                        isSelected
                          ? 'bg-accent/15 text-accent border-accent/40 shadow-xs'
                          : 'bg-surface hover:bg-hover text-muted hover:text-content border-line/60'
                      )}
                    >
                      <span className="text-sm">{meta.icon}</span>
                      <span>{meta.label}</span>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded font-medium hidden sm:inline',
                          isSelected ? 'bg-accent text-on-accent' : 'bg-chip text-faint'
                        )}
                      >
                        {meta.badge}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 源描述小标 */}
              <div className="hidden lg:flex items-center gap-1 text-[11px] text-faint shrink-0">
                <span>⚡ {activeSourceMeta.subTitle}</span>
              </div>
            </div>

            {/* Bangumi 专属星期选择器 */}
            {currentSource === 'bangumi' && currentChannel === 'anime' && (
              <div className="flex items-center gap-1.5 bg-chip/40 border border-line/60 rounded-xl p-2 overflow-x-auto no-scrollbar">
                <span className="text-xs font-semibold text-faint shrink-0 px-1">连载周历:</span>
                {BANGUMI_WEEKDAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => updateFilters({ weekday: day })}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer',
                      currentWeekday === day
                        ? 'bg-accent text-on-accent font-semibold shadow-xs'
                        : 'text-muted hover:text-content bg-surface/50 border border-line/40'
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}

            {/* 豆瓣专属子榜单选项 */}
            {currentSource === 'douban' && (
              <div className="flex items-center gap-1.5 bg-chip/40 border border-line/60 rounded-xl p-2 overflow-x-auto no-scrollbar">
                <span className="text-xs font-semibold text-faint shrink-0 px-1">精选榜单:</span>
                {currentChannel === 'movie' && (
                  <>
                    <button
                      type="button"
                      onClick={() => updateFilters({ subTab: 'weekly' })}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer',
                        currentDoubanSubTab === 'weekly'
                          ? 'bg-accent text-on-accent font-semibold shadow-xs'
                          : 'text-muted hover:text-content bg-surface/50 border border-line/40'
                      )}
                    >
                      🔥 本周口碑周榜
                    </button>
                    <button
                      type="button"
                      onClick={() => updateFilters({ subTab: 'top250' })}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer',
                        currentDoubanSubTab === 'top250'
                          ? 'bg-accent text-on-accent font-semibold shadow-xs'
                          : 'text-muted hover:text-content bg-surface/50 border border-line/40'
                      )}
                    >
                      🏆 影史高分 Top250
                    </button>
                  </>
                )}
                {currentChannel === 'tv' && (
                  <>
                    <button
                      type="button"
                      onClick={() => updateFilters({ subTab: 'chinese' })}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer',
                        currentDoubanSubTab === 'chinese'
                          ? 'bg-accent text-on-accent font-semibold shadow-xs'
                          : 'text-muted hover:text-content bg-surface/50 border border-line/40'
                      )}
                    >
                      🇨🇳 华语剧集周榜
                    </button>
                    <button
                      type="button"
                      onClick={() => updateFilters({ subTab: 'global' })}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer',
                        currentDoubanSubTab === 'global'
                          ? 'bg-accent text-on-accent font-semibold shadow-xs'
                          : 'text-muted hover:text-content bg-surface/50 border border-line/40'
                      )}
                    >
                      🌍 全球剧集周榜
                    </button>
                  </>
                )}
                {currentChannel === 'variety' && (
                  <>
                    <button
                      type="button"
                      onClick={() => updateFilters({ subTab: 'chinese' })}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer',
                        currentDoubanSubTab === 'chinese'
                          ? 'bg-accent text-on-accent font-semibold shadow-xs'
                          : 'text-muted hover:text-content bg-surface/50 border border-line/40'
                      )}
                    >
                      🇨🇳 华语精选综艺
                    </button>
                    <button
                      type="button"
                      onClick={() => updateFilters({ subTab: 'global' })}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer',
                        currentDoubanSubTab === 'global'
                          ? 'bg-accent text-on-accent font-semibold shadow-xs'
                          : 'text-muted hover:text-content bg-surface/50 border border-line/40'
                      )}
                    >
                      🌍 全球真人秀
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 仅在 360 全网片库模式下展示多维筛选器 */}
        {!urlQuery && currentSource === '360' && (
          <>
            {/* 网页版多维聚合筛选器面板 (桌面端 >= 1024px) */}
            <div className="hidden lg:block bg-chip/35 border border-line/50 rounded-2xl p-3 sm:p-4 space-y-2.5 sm:space-y-3">
              {/* 地区行 */}
              <FilterRow
                label={t('catalog.region', '地区')}
                options={activeChannelConfig.regions}
                active={currentRegion}
                onSelect={(r) => updateFilters({ region: r })}
              />

              {/* 类型行 */}
              <FilterRow
                label={t('catalog.genre', '类型')}
                options={activeChannelConfig.genres}
                active={currentGenre}
                onSelect={(g) => updateFilters({ genre: g })}
              />

              {/* 年份行 */}
              <FilterRow
                label={t('catalog.year', '年份')}
                options={YEARS}
                active={currentYear}
                onSelect={(y) => updateFilters({ year: y })}
              />

              {/* 排序行 */}
              <div className="flex items-center justify-between pt-1 border-t border-line/40 gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-xs font-semibold text-faint shrink-0 w-8 sm:w-10 text-left sm:text-right">{t('catalog.sort', '排序')}:</span>
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
                      router.push(`/catalog?type=${currentChannel}&source=360`, { scroll: false })
                    }
                    className="text-xs text-accent hover:underline flex items-center gap-1 shrink-0 ml-auto cursor-pointer"
                  >
                    <span>重置所有筛选</span>
                    <span>✕</span>
                  </button>
                )}
              </div>
            </div>

            {/* iPad 平板端专属流式触控筛选卡片 (768px ~ 1024px) */}
            <TabletFilterPanel
              regions={activeChannelConfig.regions}
              genres={activeChannelConfig.genres}
              years={YEARS}
              activeRegion={currentRegion}
              activeGenre={currentGenre}
              activeYear={currentYear}
              activeSort={currentSort}
              onUpdateFilters={updateFilters}
              onReset={() => router.push(`/catalog?type=${currentChannel}&source=360`, { scroll: false })}
              hasActiveFilters={hasActiveFilters}
            />

            {/* 移动端专属精炼筛选栏 (手机端) */}
            <div className="md:hidden space-y-2">
              <div className="flex items-center justify-between gap-2 bg-chip/50 border border-line/60 rounded-xl p-2">
                <button
                  type="button"
                  onClick={() => setMobileFilterOpen(true)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 touch-manipulation cursor-pointer border shrink-0',
                    activeFilterCount > 0
                      ? 'bg-accent text-on-accent border-accent shadow-xs'
                      : 'bg-surface border-line text-content hover:bg-hover'
                  )}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                  <span>筛选</span>
                  {activeFilterCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-white text-accent text-[10px] font-bold flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                  {SORTS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => updateFilters({ sort: s.id })}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 active:scale-95 touch-manipulation',
                        currentSort === s.id
                          ? 'bg-accent text-on-accent font-semibold shadow-xs'
                          : 'text-muted hover:text-content bg-surface border border-line/50'
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {hasActiveFilters && (
                  <button
                    onClick={() => router.push(`/catalog?type=${currentChannel}&source=360`, { scroll: false })}
                    className="text-xs text-muted hover:text-accent shrink-0 p-1 active:scale-90"
                    title="重置全部筛选"
                  >
                    ✕
                  </button>
                )}
              </div>

              {activeFilterCount > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs py-0.5 px-0.5">
                  <span className="text-muted text-[11px] shrink-0">已选:</span>
                  {currentRegion !== '全部' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent font-medium text-[11px] shrink-0">
                      {currentRegion}
                      <button onClick={() => updateFilters({ region: '全部' })} className="hover:opacity-70">×</button>
                    </span>
                  )}
                  {currentGenre !== '全部' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent font-medium text-[11px] shrink-0">
                      {currentGenre}
                      <button onClick={() => updateFilters({ genre: '全部' })} className="hover:opacity-70">×</button>
                    </span>
                  )}
                  {currentYear !== '全部' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent font-medium text-[11px] shrink-0">
                      {currentYear}年
                      <button onClick={() => updateFilters({ year: '全部' })} className="hover:opacity-70">×</button>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 移动端筛选抽屉组件 */}
            <MobileFilterSheet
              open={mobileFilterOpen}
              onClose={() => setMobileFilterOpen(false)}
              regions={activeChannelConfig.regions}
              genres={activeChannelConfig.genres}
              years={YEARS}
              activeRegion={currentRegion}
              activeGenre={currentGenre}
              activeYear={currentYear}
              onApply={(f) => {
                updateFilters({ region: f.region, genre: f.genre, year: f.year });
              }}
              totalCount={total}
            />
          </>
        )}

        {/* 统计提示与换页状态 */}
        <div className="flex items-center justify-between text-xs text-muted px-1">
          <span>
            {urlQuery ? (
              isVodSearching ? (
                '正在全网采集站实时搜索最新片源…'
              ) : (
                <>
                  全网聚合找到 <span className="text-content font-bold">{searchGroups.length}</span> 部匹配影片
                </>
              )
            ) : catalogQuery.isLoading ? (
              '正在加载片单…'
            ) : items.length > 0 ? (
              <>
                当前【{activeSourceMeta.label}】共展示 <span className="text-content font-bold">{items.length}</span> 部精选影片
                {currentSource === '360' && `（第 ${currentPage}/${totalPages} 页，共 ${total.toLocaleString()} 部）`}
              </>
            ) : (
              '暂无影片'
            )}
          </span>
          {((catalogQuery.isFetching && !catalogQuery.isLoading) || isVodSearching) && (
            <span className="text-accent flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
              实时更新中…
            </span>
          )}
        </div>

        {/* 搜索模式下的内容呈现 */}
        {urlQuery ? (
          isVodSearching && searchGroups.length === 0 ? (
            <CatalogSkeleton />
          ) : searchGroups.length === 0 ? (
            <div className="py-20 text-center space-y-3 border border-dashed border-line/60 rounded-2xl bg-surface/40">
              <p className="text-4xl">🔍</p>
              <h3 className="text-base font-semibold text-content">全网采集站未搜到 “{urlQuery}”</h3>
              <p className="text-xs text-muted">请检查关键词是否有误，或在设置中启用更多点播采集源</p>
              <button
                type="button"
                onClick={handleClearSearch}
                className="btn-primary text-xs px-4 py-1.5 rounded-lg active:scale-95"
              >
                返回片库大厅
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-4.5">
              {searchGroups.map((group) => (
                <AggregatedCard
                  key={group.key}
                  group={group}
                  onOpen={(item) => setDetailItem(item)}
                />
              ))}
            </div>
          )
        ) : (
          /* 片库模式下的内容呈现 */
          catalogQuery.isLoading ? (
            <CatalogSkeleton />
          ) : items.length === 0 ? (
            <div className="py-20 text-center space-y-3 border border-dashed border-line/60 rounded-2xl bg-surface/40">
              <p className="text-4xl">🍿</p>
              <h3 className="text-base font-semibold text-content">
                {filterKeyword ? `未找到与 “${filterKeyword}” 相关的影片` : '未找到符合条件的影片'}
              </h3>
              <p className="text-xs text-muted">
                {filterKeyword ? '请尝试清空搜索框或切换其他数据源' : '请尝试切换其他榜单或数据源'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setFilterKeyword('');
                  setSearchInput('');
                  router.push(`/catalog?type=${currentChannel}`, { scroll: false });
                }}
                className="btn-primary text-xs px-4 py-1.5 rounded-lg active:scale-95"
              >
                重置查看热门
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-4.5">
              {items.map((item) => (
                <DoubanCard
                  key={item.id}
                  item={item}
                  onClick={() => handleCardClick(item.title)}
                />
              ))}
            </div>
          )
        )}

        {/* 分页导航条（仅在片库多页源下展示） */}
        {!urlQuery && (currentSource === '360' || (currentSource === 'douban' && currentDoubanSubTab === 'top250') || currentChannel === 'short_drama') && totalPages > 1 && (
          <div className="pt-6 pb-8">
            {/* 移动端大按键上一页 / 下一页 */}
            <div className="sm:hidden flex items-center justify-between w-full gap-3">
              <button
                disabled={currentPage <= 1 || catalogQuery.isFetching}
                onClick={() => {
                  updateFilters({ page: currentPage - 1 });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex-1 h-11 rounded-xl bg-surface border border-line text-content text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-xs touch-manipulation cursor-pointer"
              >
                <span>‹</span>
                <span>上一页</span>
              </button>
              <div className="px-3 py-1.5 rounded-lg bg-chip/60 border border-line/40 text-xs font-semibold text-content shrink-0">
                {currentPage} / {totalPages}
              </div>
              <button
                disabled={currentPage >= totalPages || catalogQuery.isFetching}
                onClick={() => {
                  updateFilters({ page: currentPage + 1 });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex-1 h-11 rounded-xl bg-surface border border-line text-content text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-xs touch-manipulation cursor-pointer"
              >
                <span>下一页</span>
                <span>›</span>
              </button>
            </div>

            {/* 桌面端完整数字分页 */}
            <div className="hidden sm:flex flex-row items-center justify-center gap-3">
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
                  className="px-2 py-1 rounded bg-chip hover:bg-hover border border-line text-content text-xs active:scale-95 cursor-pointer"
                >
                  GO
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 浮动回到顶部按钮 */}
        {showBackToTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-30 p-2.5 rounded-full bg-surface-raised/90 border border-line shadow-lg text-content hover:text-accent hover:border-accent/60 active:scale-90 transition-all backdrop-blur cursor-pointer touch-manipulation"
            aria-label="回到顶部"
            title="回到顶部"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        )}

        {/* 跨源搜索详情弹窗 */}
        {detailItem && (
          <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function TabletFilterPanel({
  regions,
  genres,
  years,
  activeRegion,
  activeGenre,
  activeYear,
  activeSort,
  onUpdateFilters,
  onReset,
  hasActiveFilters,
}: {
  regions: string[];
  genres: string[];
  years: string[];
  activeRegion: string;
  activeGenre: string;
  activeYear: string;
  activeSort: string;
  onUpdateFilters: (changes: { region?: string; genre?: string; year?: string; sort?: string }) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="hidden md:block lg:hidden bg-chip/35 border border-line/60 rounded-2xl p-4 space-y-3 shadow-xs">
      {/* 顶栏控制：排序 + 重置 + 展开切换 */}
      <div className="flex items-center justify-between pb-2.5 border-b border-line/50 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-content shrink-0">排序:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onUpdateFilters({ sort: s.id })}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95 touch-manipulation cursor-pointer',
                  activeSort === s.id
                    ? 'bg-accent text-on-accent font-semibold shadow-xs'
                    : 'bg-surface hover:bg-hover text-muted hover:text-content border border-line/60'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-accent hover:underline flex items-center gap-1 cursor-pointer mr-1"
            >
              <span>重置条件</span>
              <span>✕</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-content bg-surface border border-line active:scale-95 touch-manipulation cursor-pointer"
          >
            <span>{expanded ? '收起选项' : '展开多维筛选'}</span>
            <svg
              className={cn('w-3.5 h-3.5 transition-transform duration-200', expanded && 'rotate-180')}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <polyline points="6 9 12 15 18 9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* 地区流式药丸：自动换行 flex-wrap */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-faint">地区:</span>
          {activeRegion !== '全部' && (
            <span className="text-[11px] text-accent font-medium">已选: {activeRegion}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {regions.map((r) => {
            const isSelected = activeRegion === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onUpdateFilters({ region: r })}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-xl font-medium transition-all active:scale-95 touch-manipulation cursor-pointer',
                  isSelected
                    ? 'bg-accent text-on-accent font-semibold shadow-xs'
                    : 'bg-surface hover:bg-hover text-muted hover:text-content border border-line/50'
                )}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* 类型题材流式药丸：自动换行 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-faint">类型题材:</span>
          {activeGenre !== '全部' && (
            <span className="text-[11px] text-accent font-medium">已选: {activeGenre}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(expanded ? genres : genres.slice(0, 10)).map((g) => {
            const isSelected = activeGenre === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => onUpdateFilters({ genre: g })}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-xl font-medium transition-all active:scale-95 touch-manipulation cursor-pointer',
                  isSelected
                    ? 'bg-accent text-on-accent font-semibold shadow-xs'
                    : 'bg-surface hover:bg-hover text-muted hover:text-content border border-line/50'
                )}
              >
                {g}
              </button>
            );
          })}
          {!expanded && genres.length > 10 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="px-2.5 py-1.5 text-xs rounded-xl text-faint hover:text-accent border border-dashed border-line active:scale-95 cursor-pointer"
            >
              +{genres.length - 10} 更多...
            </button>
          )}
        </div>
      </div>

      {/* 上映年份流式药丸 */}
      {(expanded || activeYear !== '全部') && (
        <div className="pt-2 border-t border-line/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-faint">上映年份:</span>
            {activeYear !== '全部' && (
              <span className="text-[11px] text-accent font-medium">已选: {activeYear}年</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {years.map((y) => {
              const isSelected = activeYear === y;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => onUpdateFilters({ year: y })}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-xl font-medium transition-all active:scale-95 touch-manipulation cursor-pointer',
                    isSelected
                      ? 'bg-accent text-on-accent font-semibold shadow-xs'
                      : 'bg-surface hover:bg-hover text-muted hover:text-content border border-line/50'
                  )}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-4.5">
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
          'w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-xs font-medium transition-all active:scale-95 touch-manipulation cursor-pointer',
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
