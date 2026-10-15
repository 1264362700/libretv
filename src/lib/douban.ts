import type { DoubanItem } from './types';
import { fetchUpstream, getCache, setCache } from './fetch-utils';

/**
 * 豆瓣推荐数据获取（服务端直连，带内存缓存与降级链）。
 * 旧版在浏览器里经公共 CORS 代理请求豆瓣（隐私差且不稳定），
 * 重构后由服务端直连，仅在直连被拒时降级到公共代理。
 */

const DOUBAN_API = 'https://movie.douban.com/j/search_subjects';
const CACHE_TTL = 10 * 60 * 1000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

interface DoubanRawSubject {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url?: string;
}

import { fetchHotList } from './douban-weekly';

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

export async function fetchDoubanRecommend(
  type: 'movie' | 'tv',
  tag: string,
  pageStart: number,
  pageSize: number,
  sort: 'recommend' | 'time' | 'rank' = 'recommend'
): Promise<DoubanItem[]> {
  const cacheKey = `douban:${type}:${tag}:${pageStart}:${pageSize}:${sort}`;
  const cached = getCache<DoubanItem[]>(cacheKey);
  if (cached) return cached;

  const target = `${DOUBAN_API}?type=${type}&tag=${encodeURIComponent(tag)}&sort=${sort}&page_limit=${pageSize}&page_start=${pageStart}`;

  let raw: DoubanRawSubject[] | undefined;

  // 1) 服务端直连
  try {
    const res = await fetchUpstream(target, {
      timeoutMs: 8000,
      headers: { 'User-Agent': UA, Referer: 'https://movie.douban.com/', Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as { subjects?: DoubanRawSubject[] };
      raw = data.subjects;
    }
  } catch {
    // 忽略，走降级
  }

  // 2) 降级：经 FALLBACK_CORS_PROXY 与内置高可用代理中继
  if (!raw || raw.length === 0) {
    for (const proxy of fallbackProxies()) {
      try {
        const proxyUrl = `${proxy}${encodeURIComponent(target)}`;
        const res = await fetchUpstream(proxyUrl, {
          timeoutMs: 8000,
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = (await res.json()) as { subjects?: DoubanRawSubject[] };
          if (data.subjects && data.subjects.length > 0) {
            raw = data.subjects;
            break;
          }
        }
      } catch {
        // 继续尝试下一个代理
      }
    }
  }

  // 3) 双重兜底：若代理均暂时无法连接，无缝降级到内置热榜，确保不发生 502 阻断
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
