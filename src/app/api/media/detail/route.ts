import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { fetchTmdbDetail } from '@/lib/tmdb';
import { fetchOverseasDetail } from '@/lib/overseas-media';

export const runtime = 'nodejs';

/**
 * 全球权威影视资料详情 (/api/media/detail)
 * 支持按权威 ID 或按片名+年份精准反查
 */
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim().slice(0, 120);
  const title = (url.searchParams.get('title') || url.searchParams.get('name') || '').trim().slice(0, 120);
  const year = (url.searchParams.get('year') || '').trim().slice(0, 10);
  const type = (url.searchParams.get('type') || '').trim().slice(0, 20);

  if (!id && !title) {
    return jsonError('缺少条目 id 或 title', 400);
  }

  try {
    // 1. 若为旧版带协议前缀的 ID（如 cinemeta:tt... 或 tvmaze:...），先走 overseas-media
    if (id && (id.includes(':') || id.startsWith('tt'))) {
      const legacyDetail = await fetchOverseasDetail(id);
      if (legacyDetail) {
        return NextResponse.json(legacyDetail, {
          headers: {
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          },
        });
      }
    }

    // 2. 权威元数据资料库详情查询
    const detail = await fetchTmdbDetail({ id: id || undefined, title: title || undefined, year: year || undefined, type: type || undefined });
    if (!detail) {
      // 降级尝试海外接口
      if (id) {
        const fallback = await fetchOverseasDetail(id);
        if (fallback) {
          return NextResponse.json(fallback, {
            headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
          });
        }
      }
      return jsonError('未找到对应的影视资料', 404);
    }

    return NextResponse.json(detail, {
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error('[api/media/detail] 影视资料详情异常:', err);
    return jsonError('影视资料详情获取失败', 502);
  }
}
