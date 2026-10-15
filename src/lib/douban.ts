import type { DoubanItem } from './types';
import { fetchUpstream, getCache, setCache } from './fetch-utils';
import { fetchHotList } from './douban-weekly';

/**
 * 影视多维分类与探索大厅数据引擎：
 * 全面基于 360 影视官方开放分类接口（api.web.360kan.com）重构：
 * 1. 彻底解决海外云机房（如 Render 等）遭遇豆瓣 403 阻断与风控验证码问题。
 * 2. 原生支持电影 (catid=1)、剧集 (catid=2)、综艺 (catid=3)、动漫 (catid=4)。
 * 3. 完美支持各地区过滤（日本、韩国、美国、大陆、香港、台湾、英国等）。
 * 4. 完美支持真分页（换一批直接换页拉取下一组全新内容）。
 * 5. 百度/60s 影视榜单作为二级高可用兜底。
 */

const CACHE_TTL = 30 * 60 * 1000; // 缓存 30 分钟

interface MovieItem360 {
  id?: string;
  title?: string;
  cdncover?: string;
  cover?: string;
  doubanscore?: string | number | null;
  score?: string | number | null;
  comment?: string;
  pubdate?: string;
}

interface FilterResponse360 {
  data?: {
    current_page?: number;
    total?: number;
    movies?: MovieItem360[] | null;
  } | null;
  errno?: number;
  msg?: string;
}

function mapCatId(type: string, tag: string): number {
  if (type === 'movie') return 1;
  if (type === 'tv') {
    if (tag.includes('动漫') || tag.includes('动画')) return 4;
    if (tag.includes('综艺')) return 3;
    return 2;
  }
  if (type === 'anime') return 4;
  if (type === 'variety') return 3;
  return 1;
}

function mapArea(tag: string): string {
  const t = tag.trim();
  if (t === '日本' || t === '日剧' || t === '日本动画') return '日本';
  if (t === '韩国' || t === '韩剧' || t === '韩国综艺') return '韩国';
  if (t === '欧美' || t === '美剧' || t === '欧美动画' || t === '欧美综艺') return '美国';
  if (t === '华语' || t === '国产剧' || t === '国产动画' || t === '国产综艺' || t === '大陆') return '大陆';
  if (t === '香港' || t === '港剧') return '香港';
  if (t === '台湾' || t === '台剧') return '台湾';
  if (t === '英国' || t === '英剧') return '英国';
  if (t === '法国') return '法国';
  return '';
}

function mapRank(sort: string): 'rankhot' | 'ranklatest' | 'rankpoint' {
  if (sort === 'time') return 'ranklatest';
  if (sort === 'rank') return 'rankpoint';
  return 'rankhot';
}

function mapGenre(tag: string): string {
  const genres = ['动作', '喜剧', '爱情', '科幻', '恐怖', '惊悚', '战争', '悬疑', '动画', '剧情', '纪录片', '脱口秀', '真人秀'];
  for (const g of genres) {
    if (tag.includes(g)) return g;
  }
  return '';
}

export async function fetchDoubanRecommend(
  type: 'movie' | 'tv' | string,
  rawTag: string,
  pageStart: number,
  pageSize: number,
  sort: 'recommend' | 'time' | 'rank' = 'recommend'
): Promise<DoubanItem[]> {
  const catId = mapCatId(type, rawTag);
  const area = mapArea(rawTag);
  const genre = mapGenre(rawTag);
  const rank = mapRank(sort);
  const size = Math.min(50, Math.max(14, pageSize));
  const pageno = Math.max(1, Math.floor(pageStart / size) + 1);

  const cacheKey = `kan360:v2:${catId}:${area}:${genre}:${rank}:${pageno}:${size}`;
  const cached = getCache<DoubanItem[]>(cacheKey);
  if (cached) return cached;

  // 1. 优先调用 360 影视官方开放分类接口（全球畅通，无封禁，直连海外机房）
  try {
    const apiUrl = `https://api.web.360kan.com/v1/filter/list?catid=${catId}&rank=${rank}&area=${encodeURIComponent(area)}&cat=${encodeURIComponent(genre)}&act=&year=&pageno=${pageno}&size=${size}`;
    const res = await fetchUpstream(apiUrl, {
      timeoutMs: 4000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    if (res.ok) {
      const data = (await res.json()) as FilterResponse360;
      const movies = data.data?.movies;
      if (Array.isArray(movies) && movies.length > 0) {
        const items: DoubanItem[] = movies
          .map((m) => {
            const rawCover = m.cdncover || m.cover || '';
            const cover = rawCover.startsWith('//') ? `https:${rawCover}` : rawCover;
            // 严格仅提取纯数字评分（如 7.1, 9.0），绝不使用 comment 一句话短评兜底，防止文字污染
            let score: string | undefined;
            const rawScore = m.doubanscore || m.score;
            if (rawScore) {
              const num = parseFloat(String(rawScore));
              if (!Number.isNaN(num) && num > 0 && num <= 10) {
                score = num.toFixed(1);
              }
            }

            return {
              id: `360_${m.id || Math.random().toString(36).slice(2)}`,
              title: m.title?.trim() || '',
              cover,
              rating: score,
              isTv: catId === 2,
            };
          })
          .filter((item) => item.title && item.cover);

        if (items.length > 0) {
          setCache(cacheKey, items, CACHE_TTL);
          return items;
        }
      }
    }
  } catch (err) {
    console.warn('[Explore API] 360kan 接口调用异常，尝试兜底:', err);
  }

  // 2. 兜底容灾：若 360kan 偶发波动，无缝使用百度影视榜 / 60s 影视热榜
  try {
    const hotId = catId === 1 ? 'douban_movie_weekly' : 'baidu_teleplay';
    const fallbackList = await fetchHotList(hotId);
    if (fallbackList && fallbackList.length > 0) {
      setCache(cacheKey, fallbackList, CACHE_TTL);
      return fallbackList;
    }
  } catch {
    // 忽略兜底失败
  }

  return [];
}
