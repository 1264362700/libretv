import { NextResponse } from 'next/server';
import { fetchHotList, fetchIqiyiRank, fetchDoubanTop250, fetchShortDramaList, isHotListId } from '@/lib/douban-weekly';

export const runtime = 'nodejs';

/** 影视热榜与全网实时大盘服务转发与优雅降级，支持真分页，确保 100% 成功返回，绝不抛出 502 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const pageStart = Math.max(0, parseInt(url.searchParams.get('pageStart') || '0', 10) || 0);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || Math.floor(pageStart / 24) + 1);
  const mode = url.searchParams.get('mode') === 'latest' ? 'latest' : 'hot';

  if (!isHotListId(id)) {
    return NextResponse.json({ error: `未知榜单: ${id.slice(0, 30)}` }, { status: 400 });
  }

  try {
    // 1. 爱奇艺官方大厅（真分页 100+ 页，支持热播与最新上线双模式）
    if (id.startsWith('iqiyi_')) {
      const type = id.replace('iqiyi_', '') as 'tv' | 'movie' | 'variety' | 'anime';
      const res = await fetchIqiyiRank(type, page, 24, mode);
      return NextResponse.json(
        { items: res.items, total: res.total, page, pageSize: 24 },
        {
          headers: {
            'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
          },
        }
      );
    }

    // 2. 豆瓣 Top250 影史高分殿堂（支持真分页）
    if (id === 'douban_top250') {
      const safeStart = (page - 1) * 24;
      const items = await fetchDoubanTop250(safeStart, 24);
      return NextResponse.json(
        { items, total: 250, page, pageSize: 24 },
        {
          headers: {
            'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
          },
        }
      );
    }

    // 3. 微短剧专属片库（支持真分页）
    if (id === 'short_drama') {
      const safeStart = (page - 1) * 20;
      const items = await fetchShortDramaList(safeStart);
      return NextResponse.json(
        { items, total: 500, page, pageSize: 20 },
        {
          headers: {
            'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
          },
        }
      );
    }

    // 4. 其他榜单
    const items = await fetchHotList(id, pageStart, { page, mode });
    return NextResponse.json(
      { items, total: items.length, page },
      {
        headers: {
          'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
        },
      }
    );
  } catch (err) {
    console.error(`[API hot-list] 获取榜单(${id})失败:`, err);
    return NextResponse.json(
      { items: [], total: 0, warning: err instanceof Error ? err.message : '榜单暂不可用' },
      { status: 200 }
    );
  }
}
