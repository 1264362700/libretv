import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { fetchTvmazePerson } from '@/lib/overseas-media';

export const runtime = 'nodejs';

/**
 * 海外影视人物资料：演员/导演/主创的生平信息与参演作品集。
 * 当前基于 TVMaze 人物接口，id 须形如 tvmaze:1。
 */
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim().slice(0, 120);

  if (!id) {
    return jsonError('缺少人物 id', 400);
  }

  const idx = id.indexOf(':');
  if (idx <= 0 || id.slice(0, idx) !== 'tvmaze' || !/^\d+$/.test(id.slice(idx + 1))) {
    return jsonError('人物 id 格式无效（应为 tvmaze:<数字>）', 400);
  }
  const sourceId = id.slice(idx + 1);

  try {
    const result = await fetchTvmazePerson(sourceId);
    if (!result) {
      return jsonError('未找到对应的人物资料', 404);
    }
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error('[api/media/person] 人物资料获取异常:', err);
    return jsonError('人物资料获取失败', 502);
  }
}
