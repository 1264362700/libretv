import { NextResponse } from 'next/server';
import { fetchUpstream, getCache, setCache } from '@/lib/fetch-utils';

export const runtime = 'nodejs';

/** 生成合规 11 位豆瓣 bid 设备识别指纹 Cookie，防止被判定为冷启动爬虫 */
function generateBid(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let bid = '';
  for (let i = 0; i < 11; i++) bid += chars[Math.floor(Math.random() * chars.length)];
  return bid;
}

/** 根据请求域名动静解耦伪装请求头，彻底规避 403 跨域防护 */
function getUpstreamHeaders(targetUrl: string): Record<string, string> {
  const isDesktop = targetUrl.includes('movie.douban.com');
  if (isDesktop) {
    return {
      Referer: 'https://movie.douban.com/explore',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Cookie: `bid=${generateBid()}; __yadk_uid=auto`,
    };
  }
  return {
    Referer: 'https://m.douban.com/movie/',
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const customUrl = searchParams.get('url');

  let targetUrl = '';
  let cacheTtlMs = 3600 * 1000; // 默认 1 小时

  // 记录筛选参数用于降级
  let searchMeta: {
    sort: string;
    tags: string;
    start: string;
    genres: string;
    countries: string;
  } | null = null;

  if (type === 'collection') {
    // 1. 榜单与热门集合
    const collectionId = searchParams.get('collectionId') || 'movie_hot';
    const start = searchParams.get('start') || '0';
    const count = searchParams.get('count') || '20';
    targetUrl = `https://m.douban.com/rexxar/api/v2/subject_collection/${encodeURIComponent(
      collectionId
    )}/items?start=${start}&count=${count}`;
    cacheTtlMs = 3600 * 1000;
  } else if (type === 'tag_subjects') {
    // 2. 多维标签推荐
    const movieOrTv = searchParams.get('mediaType') || 'tv';
    const tag = searchParams.get('tag') || '热门';
    const sort = searchParams.get('sort') || 'recommend';
    const pageLimit = searchParams.get('limit') || '24';
    const pageStart = searchParams.get('start') || '0';
    targetUrl = `https://movie.douban.com/j/search_subjects?type=${encodeURIComponent(
      movieOrTv
    )}&tag=${encodeURIComponent(tag)}&sort=${encodeURIComponent(sort)}&page_limit=${pageLimit}&page_start=${pageStart}`;
    cacheTtlMs = 1800 * 1000;
  } else if (type === 'recommend') {
    // 3. 移动端 Rexxar 多维分类推荐
    const mediaType = searchParams.get('mediaType') === 'tv' ? 'tv' : 'movie';
    const start = searchParams.get('start') || '0';
    const count = searchParams.get('count') || '24';
    const tags = searchParams.get('tags') || '';
    const sort = searchParams.get('sort') || 'T';
    targetUrl = `https://m.douban.com/rexxar/api/v2/${mediaType}/recommend?refresh=0&start=${start}&count=${count}&tags=${encodeURIComponent(
      tags
    )}&sort=${encodeURIComponent(sort)}`;
    cacheTtlMs = 3600 * 1000;
  } else if (type === 'search') {
    // 4. 多维搜索过滤
    const sort = searchParams.get('sort') || 'U';
    const tags = searchParams.get('tags') || '电影';
    const start = searchParams.get('start') || '0';
    const genres = searchParams.get('genres') || '';
    const countries = searchParams.get('countries') || '';
    const yearRange = searchParams.get('year_range') || '';

    searchMeta = { sort, tags, start, genres, countries };

    const params = new URLSearchParams({
      sort,
      range: '0,10',
      tags,
      start,
    });
    if (genres) params.set('genres', genres);
    if (countries) params.set('countries', countries);
    if (yearRange) params.set('year_range', yearRange);

    targetUrl = `https://movie.douban.com/j/new_search_subjects?${params.toString()}`;
    cacheTtlMs = 3600 * 1000;
  } else if (type === 'detail') {
    // 5. 单部影片详情接口
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 });
    targetUrl = `https://m.douban.com/rexxar/api/v2/movie/${encodeURIComponent(id)}`;
    cacheTtlMs = 86400 * 1000;
  } else if (type === 'suggest') {
    // 6. 搜索实时联想
    const q = searchParams.get('q') || '';
    if (!q) return NextResponse.json({ error: '缺少 q 参数' }, { status: 400 });
    targetUrl = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(q)}`;
    cacheTtlMs = 600 * 1000;
  } else if (customUrl) {
    try {
      const parsed = new URL(customUrl);
      if (parsed.hostname !== 'm.douban.com' && parsed.hostname !== 'movie.douban.com') {
        return NextResponse.json({ error: '只允许代理豆瓣官方域名' }, { status: 403 });
      }
      targetUrl = customUrl;
      cacheTtlMs = 1800 * 1000;
    } catch {
      return NextResponse.json({ error: '无效的目标 URL' }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: '缺少 type 或 url 参数' }, { status: 400 });
  }

  const cacheKey = `douban_proxy:${targetUrl}`;
  const cachedData = getCache(cacheKey);
  if (cachedData) {
    return NextResponse.json(cachedData, {
      headers: {
        'Cache-Control': `public, max-age=${Math.floor(cacheTtlMs / 1000)}`,
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    const upstreamRes = await fetchUpstream(targetUrl, {
      headers: getUpstreamHeaders(targetUrl),
      timeoutMs: 8000,
    });

    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      setCache(cacheKey, data, cacheTtlMs);

      return NextResponse.json(data, {
        headers: {
          'Cache-Control': `public, max-age=${Math.floor(cacheTtlMs / 1000)}`,
          'X-Cache': 'MISS',
        },
      });
    }

    // 若桌面端接口遇到 403 / 418，且属于分类筛选场景，自动触发移动端 Rexxar 极速降级自愈链
    if (type === 'search' && searchMeta && (upstreamRes.status === 403 || upstreamRes.status === 418 || upstreamRes.status >= 500)) {
      console.warn(`[DoubanProxy] 桌面端接口 HTTP ${upstreamRes.status}，自动切换至移动端 Rexxar 容灾源`);
      const fallbackResult = await fetchRexxarFallback(searchMeta);
      if (fallbackResult) {
        setCache(cacheKey, fallbackResult, cacheTtlMs);
        return NextResponse.json(fallbackResult, {
          headers: {
            'Cache-Control': `public, max-age=${Math.floor(cacheTtlMs / 1000)}`,
            'X-Fallback': 'Rexxar',
          },
        });
      }
    }

    return NextResponse.json(
      { error: `豆瓣上游接口返回异常: ${upstreamRes.status}` },
      { status: upstreamRes.status }
    );
  } catch (err) {
    // 网络超时或 DNS 异常时的降级
    if (type === 'search' && searchMeta) {
      console.warn('[DoubanProxy] 主接口网络异常，尝试 Rexxar 降级:', err);
      const fallbackResult = await fetchRexxarFallback(searchMeta);
      if (fallbackResult) {
        return NextResponse.json(fallbackResult, {
          headers: { 'X-Fallback': 'Rexxar-Recovery' },
        });
      }
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : '豆瓣代理请求失败' },
      { status: 502 }
    );
  }
}

/** 移动端 Rexxar 官方推荐接口容灾自愈抓取 */
async function fetchRexxarFallback(meta: {
  sort: string;
  tags: string;
  start: string;
  genres: string;
  countries: string;
}) {
  try {
    const isTv =
      meta.tags.includes('电视剧') ||
      meta.tags.includes('剧集') ||
      meta.tags.includes('国产剧') ||
      meta.tags.includes('美剧') ||
      meta.tags.includes('日剧') ||
      meta.tags.includes('韩剧') ||
      meta.tags.includes('短剧');
    const mediaType = isTv ? 'tv' : 'movie';
    const sort = meta.sort === 'R' ? 'R' : meta.sort === 'S' ? 'S' : 'T';
    const tagList = [meta.tags, meta.genres, meta.countries].filter(Boolean).join(',');
    const tagsParam = encodeURIComponent(tagList || (isTv ? '电视剧' : '电影'));

    const rexxarUrl = `https://m.douban.com/rexxar/api/v2/${mediaType}/recommend?refresh=0&start=${meta.start}&count=20&tags=${tagsParam}&sort=${sort}`;
    const res = await fetchUpstream(rexxarUrl, {
      headers: getUpstreamHeaders(rexxarUrl),
      timeoutMs: 6000,
    });

    if (!res.ok) return null;

    const json = (await res.json()) as {
      items?: Array<{
        id?: string | number;
        title?: string;
        rating?: { value?: number };
        pic?: { normal?: string; large?: string };
        cover?: { url?: string };
        cover_url?: string;
        year?: string;
        card_subtitle?: string;
      }>;
    };

    const items = Array.isArray(json.items) ? json.items : [];
    const normalizedData = items.map((it) => {
      const cover =
        it.pic?.normal || it.cover?.url || it.cover_url || it.pic?.large || '';
      return {
        id: String(it.id || ''),
        title: (it.title || '').trim(),
        rate: it.rating?.value ? String(it.rating.value) : '0',
        cover,
        year: it.year,
        url: `https://movie.douban.com/subject/${it.id}/`,
        directors: [],
      };
    });

    return { data: normalizedData };
  } catch (err) {
    console.warn('[DoubanProxy] Rexxar 降级失败:', err);
    return null;
  }
}
