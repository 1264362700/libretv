import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { fetchOverseasDetail } from '@/lib/overseas-media';

export const runtime = 'nodejs';

/**
 * 海外影视资料详情：按统一 id 取详情。
 * id 形如 cinemeta:tt0111161 / tvmaze:169 / anilist:154587。
 * 详情自带分集清单（TVMaze）与演职员表（TVMaze / AniList）。
 */
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim().slice(0, 120);

  if (!id) {
    return jsonError('缺少条目 id', 400);
  }

  try {
    const detail = await fetchOverseasDetail(id);
    if (!detail) {
      return jsonError('未找到对应的海外影视资料', 404);
    }
    return NextResponse.json(detail, {
      headers: {
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error('[api/media/detail] 海外资料详情异常:', err);
    return jsonError('海外影视资料详情获取失败', 502);
  }
}
