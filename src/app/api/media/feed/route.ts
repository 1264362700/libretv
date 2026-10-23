import { NextResponse } from 'next/server';
import { fetchTmdbCatalog } from '@/lib/tmdb';

export const runtime = 'nodejs';

/**
 * 全球多维影视资料流与检索接口 (/api/media/feed)
 * 支持全频道探索、智能分类榜单、多维属性联合筛选与全局联想搜索
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
        warning: err instanceof Error ? err.message : '影视资料库请求失败',
      },
      { status: 200 }
    );
  }
}
