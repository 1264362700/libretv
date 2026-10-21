import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { searchOverseas, OVERSEAS_MEDIA_TYPES, type OverseasMediaType } from '@/lib/overseas-media';

export const runtime = 'nodejs';

/** 关键词长度上限，防止构造超长上游 URL */
const MAX_KEYWORD = 80;

/**
 * 海外影视资料库搜索：跨 Cinemeta / TVMaze / AniList 三个免 key 源聚合。
 * 查询参数：
 * - q      关键词（必填）
 * - type   movie | series | anime（默认 movie）
 * - limit  返回条数上限（1-60，默认 40）
 */
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || url.searchParams.get('keyword') || '').trim().slice(0, MAX_KEYWORD);
  const rawType = url.searchParams.get('type') || 'movie';
  const type: OverseasMediaType = (OVERSEAS_MEDIA_TYPES as string[]).includes(rawType)
    ? (rawType as OverseasMediaType)
    : 'movie';
  const limit = Math.min(60, Math.max(1, parseInt(url.searchParams.get('limit') || '40', 10) || 40));

  if (!q) {
    return jsonError('缺少搜索关键词 q', 400);
  }

  try {
    const { list, failures } = await searchOverseas(q, type);
    return NextResponse.json(
      {
        query: q,
        type,
        total: list.length,
        list: list.slice(0, limit),
        failures,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=600, stale-while-revalidate=1800',
        },
      }
    );
  } catch (err) {
    console.error('[api/media/search] 海外资料搜索异常:', err);
    return jsonError('海外影视资料搜索失败', 502);
  }
}
