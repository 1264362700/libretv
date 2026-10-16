import type { DoubanItem } from './types';
import { fetchUpstream, getCache, setCache } from './fetch-utils';

/**
 * 影视热榜聚合（经 60s API，免 key，https://github.com/vikiboss/60s）。
 * 豆瓣周榜走其 rexxar 移动端接口（需伪装 iPhone UA），百度热播剧榜解析 top.baidu.com，
 * 均由 60s 代为抓取；这里只做服务端转发 + 内存缓存 + 字段归一。
 * 默认走社区实例 crystelf.top，失败自动回退官方公共实例（每日额度有限，
 * 数据中心出口 IP 常被限流，Vercel 上不可依赖）；可用 60S_API_BASE 指向自部署实例。
 */

const CACHE_TTL = 2 * 60 * 60 * 1000; // 缓存 2 小时
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const FALLBACK_BASE = 'https://60s.viki.moe';

function apiBase(): string {
  return (process.env['60S_API_BASE'] || 'https://60s.crystelf.top').replace(/\/+$/, '');
}

/** 榜单标识：豆瓣五个周榜 + 百度热播剧榜 + 百度电影榜 + 豆瓣 Top250 */
export const HOT_LIST_IDS = [
  'douban_movie_weekly',
  'douban_tv_chinese',
  'douban_tv_global',
  'douban_show_chinese',
  'douban_show_global',
  'baidu_teleplay',
  'baidu_movie',
  'douban_top250',
] as const;

export type HotListId = (typeof HOT_LIST_IDS)[number];

export function isHotListId(id: string): id is HotListId {
  return (HOT_LIST_IDS as readonly string[]).includes(id);
}

const DOUBAN_WEEKLY_CATEGORY: Partial<Record<HotListId, string>> = {
  douban_movie_weekly: 'movie',
  douban_tv_chinese: 'tv_chinese',
  douban_tv_global: 'tv_global',
  douban_show_chinese: 'show_chinese',
  douban_show_global: 'show_global',
};

// —— 60s API 原始结构（只取用到的字段） ——

interface DoubanWeeklyRaw {
  id?: number | string;
  title?: string;
  rating?: number;
  cover_proxy?: string;
  cover?: string;
}

interface BaiduTeleplayRaw {
  title?: string;
  cover?: string | null;
}

interface SixtyResponse<T> {
  code?: number;
  data?: T;
}

/** 豆瓣周榜条目 → DoubanItem；缺标题或封面的脏数据丢弃 */
export function doubanWeeklyToItem(raw: DoubanWeeklyRaw, isTv: boolean): DoubanItem | undefined {
  const cover = raw.cover || raw.cover_proxy;
  if (!raw.id || !raw.title || !cover) return undefined;
  return {
    id: String(raw.id),
    title: raw.title,
    cover,
    rating: raw.rating && raw.rating > 0 ? String(raw.rating) : undefined,
    isTv,
  };
}

/** 百度热播剧条目 → DoubanItem；无评分，海报为空的条目丢弃 */
export function baiduTeleplayToItem(raw: BaiduTeleplayRaw, index: number): DoubanItem | undefined {
  if (!raw.title || !raw.cover) return undefined;
  return {
    id: `baidu_${index}`,
    title: raw.title,
    cover: raw.cover,
    isTv: true,
  };
}

function assertArray<T>(value: unknown, what: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${what}数据异常`);
  return value as T[];
}

/**
 * 百度风云榜直连抓取（极速免 key，毫秒级响应，覆盖实时电影/电视剧大盘）：
 * 直接解析 top.baidu.com SSR 注入的 <!--s-data:...--> 结构
 */
export async function fetchBaiduBoard(tab: 'movie' | 'teleplay'): Promise<DoubanItem[]> {
  const cacheKey = `baidu_board:${tab}`;
  const cached = getCache<DoubanItem[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const res = await fetchUpstream(`https://top.baidu.com/board?tab=${tab}`, {
      timeoutMs: 6000,
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    });
    if (!res.ok) throw new Error(`百度风云榜响应异常: ${res.status}`);
    const html = await res.text();
    const match = html.match(/<!--s-data:(.*?)-->/);
    if (!match) throw new Error('百度风云榜未匹配到数据块');
    const json = JSON.parse(match[1]);
    const cards = json.data?.cards || [];
    const content = cards[0]?.content || [];
    const items: DoubanItem[] = content
      .map((item: { word?: string; img?: string; hotScore?: string; index?: number }) => {
        if (!item.word || !item.img) return undefined;
        let score: string | undefined;
        if (item.hotScore) {
          const num = Number(item.hotScore);
          if (!Number.isNaN(num) && num > 0) {
            score = (num / 10000).toFixed(1);
          }
        }
        return {
          id: `baidu_${tab}_${item.index ?? Math.random().toString(36).slice(2)}`,
          title: item.word.trim(),
          cover: item.img,
          rating: score,
          isTv: tab === 'teleplay',
        };
      })
      .filter((x: DoubanItem | undefined): x is DoubanItem => Boolean(x));

    if (items.length > 0) {
      setCache(cacheKey, items, CACHE_TTL);
      return items;
    }
  } catch (err) {
    console.warn(`[HotList] 百度风云榜(${tab})直连异常:`, err);
  }
  return [];
}

/**
 * 豆瓣影史高分经典 Top250 直连抓取（经典神作殿堂）：
 * 解析 movie.douban.com/top250 HTML
 */
export async function fetchDoubanTop250(start = 0): Promise<DoubanItem[]> {
  const cacheKey = `douban_top250:${start}`;
  const cached = getCache<DoubanItem[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const res = await fetchUpstream(`https://movie.douban.com/top250?start=${start}`, {
      timeoutMs: 7000,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: 'https://movie.douban.com/',
      },
    });
    if (res.ok) {
      const html = await res.text();
      const regex = /<div class="item">[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<span class="title">([^<]+)<\/span>[\s\S]*?<span class="rating_num"[^>]*>([^<]+)<\/span>/g;
      const items: DoubanItem[] = [];
      let m: RegExpExecArray | null;
      while ((m = regex.exec(html)) !== null) {
        items.push({
          id: `top250_${start + items.length}`,
          cover: m[1],
          title: m[2].trim(),
          rating: m[3].trim(),
          isTv: false,
        });
      }
      if (items.length > 0) {
        setCache(cacheKey, items, CACHE_TTL);
        return items;
      }
    }
  } catch (err) {
    console.warn('[HotList] 豆瓣 Top250 直连抓取异常:', err);
  }
  return [];
}

async function fetchJson(path: string): Promise<unknown> {
  const primary = apiBase();
  const bases = primary === FALLBACK_BASE ? [primary] : [primary, FALLBACK_BASE];

  let lastError: unknown;
  for (const base of bases) {
    try {
      const res = await fetchUpstream(`${base}${path}`, {
        timeoutMs: 5000,
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`60s API 响应异常 (${res.status})`);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('60s API 请求失败');
}

export async function fetchHotList(id: HotListId): Promise<DoubanItem[]> {
  const cacheKey = `hot-list:${id}`;
  const cached = getCache<DoubanItem[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  let items: DoubanItem[] = [];

  // 1. 百度直连榜单优先直出（毫秒级超高稳定性）
  if (id === 'baidu_movie') {
    items = await fetchBaiduBoard('movie');
    if (items.length > 0) {
      setCache(cacheKey, items, CACHE_TTL);
      return items;
    }
  }

  if (id === 'baidu_teleplay') {
    items = await fetchBaiduBoard('teleplay');
    if (items.length > 0) {
      setCache(cacheKey, items, CACHE_TTL);
      return items;
    }
  }

  if (id === 'douban_top250') {
    items = await fetchDoubanTop250(0);
    if (items.length > 0) {
      setCache(cacheKey, items, CACHE_TTL);
      return items;
    }
  }

  // 2. 豆瓣周榜类目
  const category = DOUBAN_WEEKLY_CATEGORY[id];
  if (category) {
    try {
      const raw = (await fetchJson(`/v2/douban/weekly/${category}`)) as SixtyResponse<DoubanWeeklyRaw[]>;
      const isTv = id !== 'douban_movie_weekly';
      items = assertArray<DoubanWeeklyRaw>(raw.data, '豆瓣周榜')
        .map((entry) => doubanWeeklyToItem(entry, isTv))
        .filter((item): item is DoubanItem => item !== undefined);
    } catch (err) {
      console.warn(`[HotList] 60s 周榜(${category})获取异常，触发智能兜底:`, err);
      // 容灾兜底：电影周榜回退百度电影，电视剧周榜回退百度热剧
      if (id === 'douban_movie_weekly') {
        items = await fetchBaiduBoard('movie');
      } else if (id === 'douban_tv_chinese' || id === 'douban_tv_global') {
        items = await fetchBaiduBoard('teleplay');
      }
    }
  } else if (id === 'baidu_teleplay') {
    try {
      const raw = (await fetchJson('/v2/baidu/teleplay')) as SixtyResponse<BaiduTeleplayRaw[]>;
      items = assertArray<BaiduTeleplayRaw>(raw.data, '百度热播剧榜')
        .map((entry, i) => baiduTeleplayToItem(entry, i))
        .filter((item): item is DoubanItem => item !== undefined);
    } catch {
      items = await fetchBaiduBoard('teleplay');
    }
  }

  if (items.length === 0) {
    // 终极安全保底：若当前抓取全空，电影兜底百度电影，剧集兜底百度热播
    if (id.includes('movie')) items = await fetchBaiduBoard('movie');
    else items = await fetchBaiduBoard('teleplay');
  }

  if (items.length === 0) throw new Error('榜单数据为空');

  setCache(cacheKey, items, CACHE_TTL);
  return items;
}
