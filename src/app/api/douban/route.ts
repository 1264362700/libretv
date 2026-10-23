import { NextResponse } from 'next/server';
import { fetchTmdbCatalog } from '@/lib/tmdb';

export const runtime = 'nodejs';

/** 影视资料库推荐接口：全面切换至 TMDB 官方 v3 引擎 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawType = url.searchParams.get('type') || 'movie';
  const type = ['tv', 'movie', 'anime', 'variety', 'documentary', 'short_drama', 'trending'].includes(rawType)
    ? rawType
    : 'movie';
  const tag = (url.searchParams.get('tag') || '热门').slice(0, 50);
  const area = (url.searchParams.get('area') || '').slice(0, 30);
  const genre = (url.searchParams.get('genre') || '').slice(0, 30);
  const year = (url.searchParams.get('year') || '').slice(0, 10);
  const sort = (url.searchParams.get('sort') || 'recommend').slice(0, 20);
  const pageStart = Math.max(0, parseInt(url.searchParams.get('pageStart') || '0', 10) || 0);
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));
  const page = Math.floor(pageStart / pageSize) + 1;

  try {
    const { items, total, totalPages } = await fetchTmdbCatalog({
      type,
      area: area || tag,
      genre: genre || tag,
      year,
      sort,
      page,
    });
    return NextResponse.json(
      { items, total, totalPages },
      {
        headers: {
          'Cache-Control': 'private, max-age=300',
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      {
        items: [],
        total: 0,
        totalPages: 1,
        warning: err instanceof Error ? err.message : 'TMDB 资料库获取失败',
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
