import { NextResponse } from 'next/server';
import { fetchUpstream, getCache, setCache } from '@/lib/fetch-utils';

export const runtime = 'nodejs';

/**
 * 豆瓣官方接口反代路由（防封与移动端伪装）
 * 强制注入移动端 Request Headers 规避 403 / 400，并提供服务端多级 TTL 缓存
 */
const DOUBAN_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
const DOUBAN_REFERER = 'https://m.douban.com/movie/';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const customUrl = searchParams.get('url');

  let targetUrl = '';
  let cacheTtlMs = 3600 * 1000; // 默认 1 小时

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
    // 2. 多维标签推荐（带 episodes_info 原生更新集数字段）
    const movieOrTv = searchParams.get('mediaType') || 'tv'; // 'movie' | 'tv'
    const tag = searchParams.get('tag') || '热门';
    const sort = searchParams.get('sort') || 'recommend';
    const pageLimit = searchParams.get('limit') || '24';
    const pageStart = searchParams.get('start') || '0';
    targetUrl = `https://movie.douban.com/j/search_subjects?type=${encodeURIComponent(
      movieOrTv
    )}&tag=${encodeURIComponent(tag)}&sort=${encodeURIComponent(sort)}&page_limit=${pageLimit}&page_start=${pageStart}`;
    cacheTtlMs = 1800 * 1000; // 30 分钟
  } else if (type === 'recommend') {
    // 3. 多维分类推荐
    const mediaType = searchParams.get('mediaType') === 'tv' ? 'tv' : 'movie';
    const start = searchParams.get('start') || '0';
    const count = searchParams.get('count') || '24';
    const tags = searchParams.get('tags') || '';
    const sort = searchParams.get('sort') || 'T'; // 'T'近期热门 | 'R'最新上映 | 'S'高分
    targetUrl = `https://m.douban.com/rexxar/api/v2/${mediaType}/recommend?refresh=0&start=${start}&count=${count}&tags=${encodeURIComponent(
      tags
    )}&sort=${encodeURIComponent(sort)}`;
    cacheTtlMs = 3600 * 1000;
  } else if (type === 'search') {
    // 多维搜索过滤
    const sort = searchParams.get('sort') || 'U';
    const tags = searchParams.get('tags') || '电影';
    const start = searchParams.get('start') || '0';
    const genres = searchParams.get('genres') || '';
    const countries = searchParams.get('countries') || '';
    const yearRange = searchParams.get('year_range') || '';

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
    // 4. 单部影片详情接口
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 });
    targetUrl = `https://m.douban.com/rexxar/api/v2/movie/${encodeURIComponent(id)}`;
    cacheTtlMs = 86400 * 1000; // 详情 24 小时
  } else if (type === 'suggest') {
    // 搜索实时联想
    const q = searchParams.get('q') || '';
    if (!q) return NextResponse.json({ error: '缺少 q 参数' }, { status: 400 });
    targetUrl = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(q)}`;
    cacheTtlMs = 600 * 1000; // 联想 10 分钟
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
      headers: {
        Referer: DOUBAN_REFERER,
        'User-Agent': DOUBAN_MOBILE_UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      timeoutMs: 8000,
    });

    if (!upstreamRes.ok) {
      return NextResponse.json(
        { error: `豆瓣上游接口返回异常: ${upstreamRes.status}` },
        { status: upstreamRes.status }
      );
    }

    const data = await upstreamRes.json();
    setCache(cacheKey, data, cacheTtlMs);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': `public, max-age=${Math.floor(cacheTtlMs / 1000)}`,
        'X-Cache': 'MISS',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '豆瓣代理请求失败' },
      { status: 502 }
    );
  }
}
