'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { aggregateResults } from '@/components/video-card';
import { api } from '@/lib/client-api';
import { validateSourceUrl } from '@/lib/utils';
import { isShortDramaTitle } from '@/lib/short-drama';
import { useAppStore, resolveSource, isInDisabledSubscription, isSourceDisabled } from '@/lib/store';
import type { SourceSearchOutcome, DoubanItem } from '@/lib/types';
import { CHANNELS, type ChannelType } from '@/lib/channels';
import { PAGE_SIZE } from './catalog-config';

export interface CatalogFilterChanges {
  type?: string;
  region?: string;
  genre?: string;
  year?: string;
  sort?: string;
  page?: number;
  q?: string;
  wd?: string;
}

/**
 * 片库页筛选器与 URL 同步 Hook：
 * 统一解析路由查询参数、点播源可用性过滤以及 TMDB 四维筛选条件更新。
 */
export function useCatalogFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawType = searchParams.get('type') || 'movie';
  const currentChannel: ChannelType = CHANNELS.some((c) => c.id === rawType)
    ? (rawType as ChannelType)
    : 'movie';

  const currentRegion = searchParams.get('region') || '全部';
  const currentGenre = searchParams.get('genre') || '全部';
  const currentYear = searchParams.get('year') || '全部';
  const currentSort = (searchParams.get('sort') || 'recommend') as 'recommend' | 'time' | 'rank';
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const urlQuery = searchParams.get('q') || '';
  const catalogKeyword = searchParams.get('wd') || '';
  const [filterInput, setFilterInput] = useState(catalogKeyword);

  useEffect(() => {
    setFilterInput(catalogKeyword);
  }, [catalogKeyword]);

  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const selectedKeys = useAppStore((s) => s.selectedKeys);
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const sourceHealth = useAppStore((s) => s.sourceHealth);
  const subscriptions = useAppStore((s) => s.subscriptions);

  const activeChannelConfig = useMemo(
    () => CHANNELS.find((c) => c.id === currentChannel) || CHANNELS[0],
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

  const updateFilters = (changes: CatalogFilterChanges) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (changes.type !== undefined) {
      sp.set('type', changes.type);
      sp.delete('region');
      sp.delete('genre');
      sp.delete('q');
      sp.delete('wd');
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
      if (!changes.q.trim()) sp.delete('q');
      else {
        sp.set('q', changes.q.trim());
        sp.delete('wd');
      }
      sp.set('page', '1');
    }
    if (changes.wd !== undefined) {
      if (!changes.wd.trim()) sp.delete('wd');
      else {
        sp.set('wd', changes.wd.trim());
        sp.delete('q');
      }
      sp.set('page', '1');
    }
    router.push(`/catalog?${sp.toString()}`, { scroll: false });
  };

  const handleClearSearch = () => {
    setFilterInput('');
    updateFilters({ q: '', wd: '' });
  };

  const resetAllFilters = () => {
    router.push(`/catalog?type=${currentChannel}`, { scroll: false });
  };

  const hasActiveFilters =
    currentRegion !== '全部' || currentGenre !== '全部' || currentYear !== '全部' || currentSort !== 'recommend';
  const activeFilterCount =
    (currentRegion !== '全部' ? 1 : 0) +
    (currentGenre !== '全部' ? 1 : 0) +
    (currentYear !== '全部' ? 1 : 0);

  return {
    currentChannel,
    currentRegion,
    currentGenre,
    currentYear,
    currentSort,
    currentPage,
    urlQuery,
    catalogKeyword,
    filterInput,
    setFilterInput,
    selectedKeys,
    yellowFilter,
    selectedSources,
    activeChannelConfig,
    hasActiveFilters,
    activeFilterCount,
    updateFilters,
    handleClearSearch,
    resetAllFilters,
  };
}

/**
 * 片库数据查询 Hook：
 * 统一封装跨站流式直搜（vodSearchQuery）与 TMDB 官方四维分类片库查询（catalogQuery）。
 */
export function useCatalogData(filters: ReturnType<typeof useCatalogFilters>) {
  const {
    currentChannel,
    currentRegion,
    currentGenre,
    currentYear,
    currentSort,
    currentPage,
    urlQuery,
    catalogKeyword,
    selectedKeys,
    selectedSources,
    yellowFilter,
  } = filters;

  const [streamedOutcomes, setStreamedOutcomes] = useState<SourceSearchOutcome[]>([]);

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
  const streamedList = useMemo(() => streamedOutcomes.flatMap((o) => o.list), [streamedOutcomes]);
  const searchResultList = useMemo(
    () => vodSearchQuery.data?.list ?? (isVodSearching ? streamedList : []),
    [vodSearchQuery.data, isVodSearching, streamedList]
  );
  const searchGroups = useMemo(() => aggregateResults(searchResultList), [searchResultList]);

  const catalogQuery = useQuery({
    queryKey: [
      'tmdb-catalog',
      currentChannel,
      currentRegion,
      currentGenre,
      currentYear,
      currentSort,
      currentPage,
      catalogKeyword,
    ],
    queryFn: async ({ signal }) => {
      // 片库浏览统一走官方全维资料库流式接口 (/api/media/feed)
      const q = new URLSearchParams({
        type: currentChannel,
        page: String(currentPage),
        sort: currentSort,
      });
      if (currentRegion && currentRegion !== '全部') q.set('area', currentRegion);
      if (currentGenre && currentGenre !== '全部') q.set('genre', currentGenre);
      if (currentYear && currentYear !== '全部') q.set('year', currentYear);
      if (catalogKeyword) q.set('q', catalogKeyword);

      const res = await fetch(`/api/media/feed?${q.toString()}`, { signal });
      if (!res.ok) {
        return { items: [], total: 0, pagecount: 1, subCategories: [] };
      }
      const data = await res.json();
      return {
        items: Array.isArray(data.items) ? data.items : [],
        total: data.total || 0,
        pagecount: data.totalPages || 1,
        subCategories: [],
      };
    },
    staleTime: 5 * 60_000,
    enabled: !urlQuery,
  });

  const rawItems: DoubanItem[] = (catalogQuery.data?.items as DoubanItem[]) ?? [];
  const items: DoubanItem[] = rawItems.filter((item: DoubanItem) => !isShortDramaTitle(item.title));

  const total = catalogQuery.data?.total ?? items.length;
  const totalPages = Math.max(
    1,
    Math.min(500, catalogQuery.data?.pagecount ?? Math.ceil(total / PAGE_SIZE))
  );
  return {
    isVodSearching,
    searchGroups,
    catalogQuery,
    items,
    total,
    totalPages,
  };
}
