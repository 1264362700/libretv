import { NextResponse } from 'next/server';
import { fetchTmdbCatalog } from '@/lib/tmdb';

export const runtime = 'nodejs';

/**
 * TMDB 官方全球影视资料库统一路由：
 * 支持热门趋势榜 (type=trending)、全频道探索 (movie/tv/anime/variety/documentary)
 * 以及类型 (genre)、地区 (area)、年份 (year)、排序 (sort) 四维联合筛选与关键词检索 (q)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'movie';
  const area = (url.searchParams.get('area') || url.searchParams.get('region') || '').slice(0, 30);
  const genre = (url.searchParams.get('genre') || '').slice(0, 30);
  const year = (url.searchParams.get('year') || '').slice(0, 10);
  const sort = (url.searchParams.get('sort') || 'recommend').slice(0, 20);
  const query = (url.searchParams.get('q') || url.searchParams.get('wd') || '').slice(0, 80);

  const pageParam = parseInt(url.searchParams.get('page') || '0', 10);
  const pageStart = Math.max(0, parseInt(url.searchParams.get('pageStart') || '0', 10) || 0);
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));
  const page = pageParam > 0 ? pageParam : Math.floor(pageStart / pageSize) + 1;

  try {
    const result = await fetchTmdbCatalog({
      type,
      area,
      genre,
      year,
      sort,
      page,
      query,
    });
    return NextResponse.json(
      {
        items: result.items,
        total: result.total,
        totalPages: result.totalPages,
        page,
      },
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
        page: 1,
        warning: err instanceof Error ? err.message : 'TMDB 资料库请求失败',
      },
      { status: 200 }
    );
  }
}
