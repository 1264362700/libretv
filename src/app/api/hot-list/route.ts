import { NextResponse } from 'next/server';
import { fetchHotList, isHotListId } from '@/lib/douban-weekly';

export const runtime = 'nodejs';

/** 影视热榜与全网实时大盘服务转发与优雅降级，确保 100% 成功返回，绝不抛出 502 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const pageStart = Math.max(0, parseInt(url.searchParams.get('pageStart') || '0', 10) || 0);

  if (!isHotListId(id)) {
    return NextResponse.json({ error: `未知榜单: ${id.slice(0, 30)}` }, { status: 400 });
  }

  try {
    const items = await fetchHotList(id, pageStart);
    return NextResponse.json(
      { items, total: items.length },
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
