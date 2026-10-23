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
import { fetchDoubanFilter } from '@/lib/douban-api';
import { fetchDoubanCollectionItems } from '@/lib/media-library-service';
import { CHANNELS, type ChannelType } from '@/lib/channels';
import {
  CATALOG_SOURCES,
  CHANNEL_PREFERRED_CMS_HOSTS,
  CHANNEL_SOURCES,
  FALLBACK_SEED_SOURCES,
  PAGE_SIZE,
  type CatalogSourceId,
} from './catalog-config';

export interface CatalogFilterChanges {
  type?: string;
  source?: string;
  cmsSource?: string;
  cmsTypeId?: string;
  iqiyiMode?: 'hot' | 'latest';
  weekday?: string;
  subTab?: string;
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
 * 统一解析路由查询参数、点播源可用性过滤以及筛选条件更新。
 */
export function useCatalogFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawType = searchParams.get('type') || 'movie';
  const currentChannel: ChannelType = CHANNELS.some((c) => c.id === rawType)
    ? (rawType as ChannelType)
    : 'movie';

  const rawSource = searchParams.get('source') as CatalogSourceId | null;
  const availableSources = CHANNEL_SOURCES[currentChannel] || ['cms', 'iqiyi', '360', 'douban'];
  const currentSource: CatalogSourceId =
    rawSource && availableSources.includes(rawSource) ? rawSource : availableSources[0];

  const rawCmsSourceKey = searchParams.get('cmsSource');
  const rawCmsTypeId = searchParams.get('cmsTypeId') || '';
  const currentIqiyiMode = (searchParams.get('iqiyiMode') === 'latest' ? 'latest' : 'hot') as 'hot' | 'latest';
  const currentWeekday = searchParams.get('weekday') || '全部';
  const currentDoubanSubTab = searchParams.get('subTab') || (currentChannel === 'movie' ? 'weekly' : 'chinese');

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

  const availableCmsSources = useMemo(() => {
    if (selectedSources.length > 0) return selectedSources;
    return FALLBACK_SEED_SOURCES;
  }, [selectedSources]);

  const activeCmsSource = useMemo(() => {
    if (rawCmsSourceKey) {
      const found = availableCmsSources.find((s) => s.key === rawCmsSourceKey);
      if (found) return found;
    }
    const preferredHosts = CHANNEL_PREFERRED_CMS_HOSTS[currentChannel];
    if (preferredHosts) {
      for (const host of preferredHosts) {
        const found = availableCmsSources.find((s) => (s.url || '').includes(host));
        if (found) return found;
      }
    }
    return availableCmsSources[0];
  }, [availableCmsSources, rawCmsSourceKey, currentChannel]);

  const updateFilters = (changes: CatalogFilterChanges) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (changes.type !== undefined) {
      sp.set('type', changes.type);
      sp.delete('region');
      sp.delete('genre');
      sp.delete('weekday');
      sp.delete('subTab');
      sp.delete('cmsTypeId');
      sp.delete('q');
      sp.delete('wd');
      sp.set('page', '1');
      const validSources = CHANNEL_SOURCES[changes.type as ChannelType] || ['cms', 'iqiyi', '360', 'douban'];
      if (!validSources.includes(currentSource)) {
        sp.set('source', validSources[0]);
      }
    }
    if (changes.source !== undefined) {
      sp.set('source', changes.source);
      sp.delete('cmsTypeId');
      sp.set('page', '1');
      sp.delete('q');
    }
    if (changes.cmsSource !== undefined) {
      sp.set('cmsSource', changes.cmsSource);
      sp.delete('cmsTypeId');
      sp.set('page', '1');
    }
    if (changes.cmsTypeId !== undefined) {
      if (!changes.cmsTypeId) sp.delete('cmsTypeId');
      else sp.set('cmsTypeId', changes.cmsTypeId);
      sp.set('page', '1');
    }
    if (changes.iqiyiMode !== undefined) {
      sp.set('iqiyiMode', changes.iqiyiMode);
      sp.set('page', '1');
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
    router.push(`/catalog?type=${currentChannel}&source=360`, { scroll: false });
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

  return {
    currentChannel,
    currentSource,
    rawCmsTypeId,
    currentIqiyiMode,
    currentWeekday,
    currentDoubanSubTab,
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
    availableCmsSources,
    activeCmsSource,
    activeChannelConfig,
    activeSourceMeta,
    hasActiveFilters,
    activeFilterCount,
    updateFilters,
    handleClearSearch,
    resetAllFilters,
  };
}

/**
 * 片库数据查询 Hook：
 * 统一封装跨站流式直搜（vodSearchQuery）与分类多维片库查询（catalogQuery）。
 */
export function useCatalogData(filters: ReturnType<typeof useCatalogFilters>) {
  const {
    currentChannel,
    currentSource,
    activeCmsSource,
    rawCmsTypeId,
    currentIqiyiMode,
    currentWeekday,
    currentDoubanSubTab,
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

  const queryTag = useMemo(() => {
    if (currentRegion !== '全部') return currentRegion;
    if (currentGenre !== '全部') return currentGenre;
    return '热门';
  }, [currentRegion, currentGenre]);

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
      'catalog',
      currentChannel,
      currentSource,
      activeCmsSource?.key,
      rawCmsTypeId,
      currentIqiyiMode,
      currentWeekday,
      currentDoubanSubTab,
      queryTag,
      currentRegion,
      currentGenre,
      currentYear,
      currentSort,
      currentPage,
      catalogKeyword,
    ],
    queryFn: async ({ signal }) => {
      if (currentSource === 'cms' && activeCmsSource) {
        const q = new URLSearchParams({
          url: activeCmsSource.url,
          type: currentChannel,
          pg: String(currentPage),
          pagesize: String(PAGE_SIZE),
          filterAdult: yellowFilter ? '1' : '0',
        });
        if (activeCmsSource.key) q.set('sourceKey', activeCmsSource.key);
        if (rawCmsTypeId) q.set('typeId', rawCmsTypeId);
        if (catalogKeyword) q.set('wd', catalogKeyword);
        if (currentSort) q.set('sort', currentSort);
        if (currentYear && currentYear !== '全部') q.set('year', currentYear);
        if (currentRegion && currentRegion !== '全部') q.set('area', currentRegion);

        try {
          const res = await fetch(`/api/catalog/cms?${q.toString()}`, { signal });
          if (res.ok) {
            return await res.json();
          }
        } catch {
          // ignore
        }
        return { items: [], total: 0, pagecount: 1, subCategories: [] };
      }

      let tags = '电影';
      if (currentChannel === 'tv' || currentChannel === 'short_drama') tags = '电视剧';
      else if (currentChannel === 'anime') tags = '动漫';
      else if (currentChannel === 'variety') tags = '综艺';
      else if (currentChannel === 'documentary') tags = '纪录片';
      else if (currentChannel === 'ai_comic') tags = '动漫';
      else if (currentChannel === 'movie_commentary') tags = '电影';

      let sort = 'U';
      if (currentSort === 'time') sort = 'R';
      else if (currentSort === 'rank') sort = 'S';

      let genres = '';
      if (currentChannel === 'short_drama') {
        genres = currentGenre !== '全部' ? currentGenre : '短片';
      } else if (currentGenre !== '全部') {
        genres = currentGenre;
      }

      let countries = '';
      if (currentRegion !== '全部') {
        if (currentRegion === '大陆') countries = '中国大陆';
        else if (currentRegion === '香港') countries = '中国香港';
        else if (currentRegion === '台湾') countries = '中国台湾';
        else countries = currentRegion;
      }

      let yearRange = '';
      if (currentYear !== '全部') {
        if (/^\d{4}$/.test(currentYear)) {
          yearRange = `${currentYear},${currentYear}`;
        } else if (currentYear.includes('年代')) {
          const baseYear = parseInt(currentYear, 10);
          if (baseYear) yearRange = `${baseYear},${baseYear + 9}`;
        }
      }

      const start = (currentPage - 1) * PAGE_SIZE;

      try {
        const res = await fetchDoubanFilter(
          {
            tags,
            sort,
            start,
            genres: genres || undefined,
            countries: countries || undefined,
            yearRange: yearRange || undefined,
          },
          signal
        );

        let mappedItems: DoubanItem[] = res.items.map((item) => ({
          id: item.id,
          title: item.title,
          cover: item.cover,
          rating: item.rate,
          year: item.year,
        }));

        if (mappedItems.length === 0) {
          const fallbackCollectionId =
            currentChannel === 'movie'
              ? 'movie_hot'
              : currentChannel === 'anime'
                ? 'tv_animation'
                : currentChannel === 'variety'
                  ? 'tv_variety_show'
                  : 'tv_hot';
          const fallbackRes = await fetchDoubanCollectionItems(fallbackCollectionId, start, PAGE_SIZE, signal);
          mappedItems = fallbackRes.items.map((it) => ({
            id: it.id,
            title: it.title,
            cover: it.cover,
            rating: it.rating,
            year: it.year,
          }));
        }

        if (currentSort === 'rank') {
          mappedItems.sort((a, b) => {
            const rA = parseFloat(a.rating || '0') || 0;
            const rB = parseFloat(b.rating || '0') || 0;
            if (rA !== rB) return rB - rA;
            const yA = parseInt(String(a.year || '').match(/\b(19\d{2}|20\d{2})\b/)?.[1] || '0', 10);
            const yB = parseInt(String(b.year || '').match(/\b(19\d{2}|20\d{2})\b/)?.[1] || '0', 10);
            return yB - yA;
          });
        } else if (currentSort === 'time') {
          mappedItems.sort((a, b) => {
            const yA = parseInt(String(a.year || '').match(/\b(19\d{2}|20\d{2})\b/)?.[1] || '0', 10);
            const yB = parseInt(String(b.year || '').match(/\b(19\d{2}|20\d{2})\b/)?.[1] || '0', 10);
            return yB - yA;
          });
        }

        return {
          items: mappedItems,
          total: 500,
          pagecount: 25,
          subCategories: [],
        };
      } catch (err) {
        console.warn('[Catalog] 豆瓣多维筛选接口异常，已启用保底:', err);
        return { items: [], total: 0, pagecount: 1, subCategories: [] };
      }
    },
    staleTime: 5 * 60_000,
    enabled: !urlQuery,
  });

  const rawItems: DoubanItem[] = (catalogQuery.data?.items as DoubanItem[]) ?? [];
  const items: DoubanItem[] =
    currentChannel === 'short_drama' || currentChannel === 'ai_comic' || currentChannel === 'movie_commentary'
      ? rawItems
      : rawItems.filter((item: DoubanItem) => !isShortDramaTitle(item.title));

  const total = catalogQuery.data?.total ?? (items.length > 0 ? items.length * 10 : 0);
  const totalPages = Math.max(
    1,
    Math.min(500, catalogQuery.data?.pagecount ?? Math.ceil(total / PAGE_SIZE))
  );
  const cmsSubCategories = (catalogQuery.data?.subCategories || []) as Array<{
    id: string | number;
    name: string;
  }>;

  return {
    isVodSearching,
    searchGroups,
    catalogQuery,
    items,
    total,
    totalPages,
    cmsSubCategories,
  };
}
