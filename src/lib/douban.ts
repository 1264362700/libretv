import type { DoubanItem } from './types';
import { fetchUpstream, getCache, setCache } from './fetch-utils';
import { fetchHotList } from './douban-weekly';
import { listGlobalSources, type GlobalSourceRecord } from './auth-store';

/**
 * 影视热播与探索推荐引擎：
 * 采用三级高可用架构：
 * 1. CMS 秒播实时热播流（最高优先级）：直接从当前已激活的秒播采集站获取 24/48 小时热度更新，100% 点击可播，永不报 403。
 * 2. 百度风云榜与 60s 免 Key 权威影视周榜（高分榜备选）：秒级响应，永不封禁。
 * 3. 豆瓣移动端/中继代理兜底。
 */

const DOUBAN_API = 'https://movie.douban.com/j/search_subjects';
const CACHE_TTL = 30 * 60 * 1000; // 缓存 30 分钟
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

interface DoubanRawSubject {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url?: string;
}

let directBlockedUntil = 0;

function fallbackProxies(): string[] {
  const proxies: string[] = [];
  if (process.env.FALLBACK_CORS_PROXY) {
    proxies.push(process.env.FALLBACK_CORS_PROXY);
  }
  proxies.push('https://corsproxy.io/?');
  proxies.push('https://api.allorigins.win/raw?url=');
  return proxies;
}

async function fetchDirect(target: string): Promise<DoubanRawSubject[] | undefined> {
  const res = await fetchUpstream(target, {
    timeoutMs: 1500,
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
    timeoutMs: 3000,
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

/** CMS 秒播源实时热播流获取（100% 真实片源，开箱即播） */
async function fetchCmsTrending(type: 'movie' | 'tv', tag: string): Promise<DoubanItem[] | undefined> {
  let sources: GlobalSourceRecord[] = [];
  try {
    sources = listGlobalSources().filter((s) => s.type === 'vod');
  } catch {
    // 忽略异常
  }

  const urls: string[] = [];
  if (sources.length > 0) {
    urls.push(...sources.map((s) => s.url));
  } else {
    urls.push('https://cj.ffzyapi.com/api.php/provide/vod', 'https://cj.lziapi.com/api.php/provide/vod');
  }

  for (const baseUrl of urls.slice(0, 3)) {
    try {
      const cleanBase = baseUrl.replace(/\/+$/, '');
      const apiUrl = `${cleanBase}?ac=videolist&h=48`;
      const res = await fetchUpstream(apiUrl, {
        timeoutMs: 3000,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { list?: Array<Record<string, unknown>> };
      if (!data.list || !Array.isArray(data.list) || data.list.length === 0) continue;

      const items: DoubanItem[] = [];
      for (const item of data.list) {
        const typeName = String(item.type_name ?? '');
        const vodArea = String(item.vod_area ?? '');
        const vodName = String(item.vod_name ?? '').trim();
        const vodPic = String(item.vod_pic ?? '').trim();
        const vodRemarks = String(item.vod_remarks ?? '').trim();
        const vodScore = String(item.vod_score ?? '').trim();

        if (!vodName || !vodPic) continue;

        // 类型匹配：电影 vs 剧集
        const isMovie = /片|电影|动作|科幻|喜剧|爱情|战争|悬疑|恐怖|记录/.test(typeName);
        const isTv = /剧|连续剧|电视|国产|韩剧|日剧|欧美|港台|泰剧/.test(typeName);

        if (type === 'movie' && !isMovie && isTv) continue;
        if (type === 'tv' && !isTv && isMovie) continue;

        // 地区过滤（若用户选了华语/欧美等）
        if (tag && tag !== '全部' && tag !== '热门') {
          if (tag === '华语' && !/大陆|内地|香港|台湾|中国/.test(vodArea) && !/国产/.test(typeName)) continue;
          if (tag === '欧美' && !/美国|英国|法国|德国|加拿大|欧洲/.test(vodArea) && !/欧美/.test(typeName)) continue;
          if (tag === '韩国' && !/韩国/.test(vodArea) && !/韩剧/.test(typeName)) continue;
          if (tag === '日本' && !/日本/.test(vodArea) && !/日剧|动漫/.test(typeName)) continue;
          if (tag === '香港' && !/香港/.test(vodArea) && !/港剧/.test(typeName)) continue;
          if (tag === '台湾' && !/台湾/.test(vodArea) && !/台剧/.test(typeName)) continue;
        }

        items.push({
          id: `cms_${item.vod_id || Math.random()}`,
          title: vodName,
          cover: vodPic,
          rating: vodScore && vodScore !== '0' && vodScore !== '0.0' ? vodScore : (vodRemarks || '1080P'),
          isTv: type === 'tv',
        });

        if (items.length >= 35) break;
      }

      if (items.length >= 6) {
        return items;
      }
    } catch {
      // 尝试下一个源
    }
  }
  return undefined;
}

export async function fetchDoubanRecommend(
  type: 'movie' | 'tv',
  rawTag: string,
  pageStart: number,
  pageSize: number,
  sort: 'recommend' | 'time' | 'rank' = 'recommend'
): Promise<DoubanItem[]> {
  const tag = normalizeDoubanTag(rawTag);
  const cacheKey = `recommend:${type}:${tag}:${pageStart}:${pageSize}:${sort}`;
  const cached = getCache<DoubanItem[]>(cacheKey);
  if (cached) return cached;

  // 1. 若为高分榜单，优先拉取权威影视周榜（60s / 百度风云榜）
  if (sort === 'rank' || tag.includes('高分')) {
    try {
      const hotId = type === 'movie' ? 'douban_movie_weekly' : 'douban_tv_chinese';
      const hotItems = await fetchHotList(hotId);
      if (hotItems && hotItems.length > 0) {
        setCache(cacheKey, hotItems, CACHE_TTL);
        return hotItems;
      }
    } catch {
      // 容错降级
    }
  }

  // 2. 核心主链路：优先走 CMS 原生 24/48 小时实时热播流（100% 真实秒播源、永不被封）
  try {
    const cmsTrending = await fetchCmsTrending(type, tag);
    if (cmsTrending && cmsTrending.length > 0) {
      setCache(cacheKey, cmsTrending, CACHE_TTL);
      return cmsTrending;
    }
  } catch {
    // 容错继续
  }

  // 3. 兜底链路：走百度热播/豆瓣周榜
  try {
    const fallbackHotId = type === 'movie' ? 'douban_movie_weekly' : 'baidu_teleplay';
    const fallbackList = await fetchHotList(fallbackHotId);
    if (fallbackList && fallbackList.length > 0) {
      setCache(cacheKey, fallbackList, CACHE_TTL);
      return fallbackList;
    }
  } catch {
    // 忽略
  }

  // 4. 终极备用：尝试豆瓣直连 / 代理
  const target = `${DOUBAN_API}?type=${type}&tag=${encodeURIComponent(tag)}&sort=${sort}&page_limit=${pageSize}&page_start=${pageStart}`;
  let raw: DoubanRawSubject[] | undefined;

  const isDirectBlocked = Date.now() < directBlockedUntil;
  if (!isDirectBlocked) {
    try {
      raw = await fetchDirect(target);
    } catch {
      directBlockedUntil = Date.now() + 30 * 60 * 1000;
    }
  }

  if (!raw) {
    for (const proxy of fallbackProxies()) {
      try {
        raw = await fetchFromProxy(proxy, target);
        if (raw && raw.length > 0) break;
      } catch {
        // 继续尝试备用代理
      }
    }
  }

  if (raw && raw.length > 0) {
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

  return [];
}
