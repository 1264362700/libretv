import type { DoubanItem } from './types';
import { fetchUpstream, getCache, setCache } from './fetch-utils';
import { fetchHotList } from './douban-weekly';

/**
 * 豆瓣推荐数据获取：
 * 支持直连断路器（Circuit Breaker）、并发竞速（Smart Race）与双重兜底链路。
 * 机房环境直连受阻时秒级熔断，彻底杜绝 8 秒超时串行堆叠。
 */

const DOUBAN_API = 'https://movie.douban.com/j/search_subjects';
const CACHE_TTL = 60 * 60 * 1000; // 缓存 1 小时
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

interface DoubanRawSubject {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url?: string;
}

/** 境外机房/数据中心直连被封锁时的熔断时间戳（毫秒） */
let directBlockedUntil = 0;

function fallbackProxies(): string[] {
  const proxies: string[] = [];
  if (process.env.FALLBACK_CORS_PROXY) {
    proxies.push(process.env.FALLBACK_CORS_PROXY);
  }
  // 公共高可用代理通道：当公有云/境外机房直连被豆瓣反爬策略拦截时自动接管
  proxies.push('https://corsproxy.io/?');
  proxies.push('https://api.allorigins.win/raw?url=');
  return proxies;
}

async function fetchDirect(target: string): Promise<DoubanRawSubject[] | undefined> {
  const res = await fetchUpstream(target, {
    timeoutMs: 1500, // 压缩至 1.5 秒快速失败
    headers: { 'User-Agent': UA, Referer: 'https://movie.douban.com/', Accept: 'application/json' },
  });
  if (res.ok) {
    const data = (await res.json()) as { subjects?: DoubanRawSubject[] };
    if (data.subjects && data.subjects.length > 0) return data.subjects;
  }
  return undefined;
}

async function fetchFromProxy(proxy: string, target: string): Promise<DoubanRawSubject[] | undefined> {
  const proxyUrl = `${proxy}${encodeURIComponent(target)}`;
  const res = await fetchUpstream(proxyUrl, {
    timeoutMs: 4000,
    headers: { Accept: 'application/json' },
  });
  if (res.ok) {
    const data = (await res.json()) as { subjects?: DoubanRawSubject[] };
    if (data.subjects && data.subjects.length > 0) return data.subjects;
  }
  return undefined;
}

function normalizeDoubanTag(tag: string): string {
  const t = tag.trim();
  if (t === '中国香港') return '香港';
  if (t === '中国台湾') return '台湾';
  return t;
}

export async function fetchDoubanRecommend(
  type: 'movie' | 'tv',
  rawTag: string,
  pageStart: number,
  pageSize: number,
  sort: 'recommend' | 'time' | 'rank' = 'recommend'
): Promise<DoubanItem[]> {
  const tag = normalizeDoubanTag(rawTag);
  const cacheKey = `douban:${type}:${tag}:${pageStart}:${pageSize}:${sort}`;
  const cached = getCache<DoubanItem[]>(cacheKey);
  if (cached) return cached;

  const target = `${DOUBAN_API}?type=${type}&tag=${encodeURIComponent(tag)}&sort=${sort}&page_limit=${pageSize}&page_start=${pageStart}`;

  let raw: DoubanRawSubject[] | undefined;

  // 1) 若直连已被判定受限（云端机房环境），直接走高速中继代理，跳过无谓死等
  const isDirectBlocked = Date.now() < directBlockedUntil;

  if (isDirectBlocked) {
    for (const proxy of fallbackProxies()) {
      try {
        raw = await fetchFromProxy(proxy, target);
        if (raw && raw.length > 0) break;
      } catch {
        // 继续尝试下一个代理
      }
    }
  } else {
    // 2) 首次探测：直连（1.5s快速超时）与主代理并发竞速，谁快谁胜出
    const primaryProxy = fallbackProxies()[0];
    try {
      raw = await Promise.any([
        fetchDirect(target).then((res) => {
          if (!res) throw new Error('直连无数据');
          return res;
        }),
        fetchFromProxy(primaryProxy, target).then((res) => {
          if (!res) throw new Error('代理无数据');
          return res;
        }),
      ]);
    } catch {
      // 并发均未能在时限内返回
    }

    // 若直连失败，标记直连熔断 30 分钟，后续直接走代理通道
    if (!raw) {
      directBlockedUntil = Date.now() + 30 * 60 * 1000;
      for (const proxy of fallbackProxies().slice(1)) {
        try {
          raw = await fetchFromProxy(proxy, target);
          if (raw && raw.length > 0) break;
        } catch {
          // 继续尝试备用代理
        }
      }
    }
  }

  // 3) 双重兜底：若所有代理均遭遇网络阻断，无缝降级到内置热榜，确保不发生 502 阻断
  if (!raw || raw.length === 0) {
    try {
      const hotId = type === 'movie' ? 'douban_movie_weekly' : 'douban_tv_chinese';
      const fallbackList = await fetchHotList(hotId);
      if (fallbackList && fallbackList.length > 0) {
        setCache(cacheKey, fallbackList, CACHE_TTL);
        return fallbackList;
      }
    } catch {
      // 忽略兜底失败
    }
  }

  if (!raw) return [];

  const items: DoubanItem[] = raw.map((s) => ({
    id: s.id,
    title: s.title,
    cover: s.cover,
    rating: s.rate && s.rate !== '0' ? s.rate : undefined,
    isTv: type === 'tv',
  }));

  setCache(cacheKey, items, CACHE_TTL);
  return items;
}
