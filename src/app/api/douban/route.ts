import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchDoubanRecommend } from '@/lib/douban';

export const runtime = 'nodejs';

/** 豆瓣推荐：服务端直连 + 缓存，替代旧版浏览器经公共 CORS 代理的方案 */
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const url = new URL(req.url);
  const rawType = url.searchParams.get('type') || 'movie';
  const type = ['tv', 'movie', 'anime', 'variety', 'documentary'].includes(rawType) ? rawType : 'movie';
  const tag = (url.searchParams.get('tag') || '热门').slice(0, 50);
  const area = (url.searchParams.get('area') || '').slice(0, 30);
  const genre = (url.searchParams.get('genre') || '').slice(0, 30);
  const year = (url.searchParams.get('year') || '').slice(0, 10);
  const sort = (url.searchParams.get('sort') || 'recommend').slice(0, 20) as 'recommend' | 'time' | 'rank';
  const pageStart = Math.max(0, parseInt(url.searchParams.get('pageStart') || '0', 10) || 0);
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '24', 10) || 24));

  try {
    const { items, total } = await fetchDoubanRecommend(type, tag, pageStart, pageSize, sort, { area, genre, year });
    return NextResponse.json(
      { items, total },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      {
        items: [],
        total: 0,
        warning: err instanceof Error ? err.message : '影视推荐获取失败',
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
