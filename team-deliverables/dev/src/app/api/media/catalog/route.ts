import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import {
  fetchCinemetaCatalog,
  fetchTvmazeEpisodes,
  OVERSEAS_MEDIA_TYPES,
  type OverseasMediaType,
} from '@/lib/overseas-media';

export const runtime = 'nodejs';

/**
 * 海外影视资料目录浏览：
 * - 无 showId 时按类型返回榜单目录（anime 由 AniList 承载，此处返回空列表）
 * - 带 showId 时返回该剧集的分集清单（TVMaze）
 *
 * 查询参数：
 * - type    movie | series | anime（默认 movie）
 * - sort    目录排序维度（默认 top）
 * - showId  TVMaze 剧集 id（数字），可选
 */
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const url = new URL(req.url);
  const rawType = url.searchParams.get('type') || 'movie';
  const type: OverseasMediaType = (OVERSEAS_MEDIA_TYPES as string[]).includes(rawType)
    ? (rawType as OverseasMediaType)
    : 'movie';
  const sort = (url.searchParams.get('sort') || 'top').slice(0, 20);
  const showId = (url.searchParams.get('showId') || '').trim();

  try {
    if (showId) {
      if (!/^\d+$/.test(showId)) {
        return jsonError('showId 必须为数字', 400);
      }
      const episodes = await fetchTvmazeEpisodes(Number(showId));
      return NextResponse.json(
        { showId: Number(showId), total: episodes.length, episodes },
        { headers: { 'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400' } }
      );
    }

    const list = await fetchCinemetaCatalog(type, sort);
    return NextResponse.json(
      { type, sort, total: list.length, list },
      { headers: { 'Cache-Control': 'private, max-age=7200, stale-while-revalidate=14400' } }
    );
  } catch (err) {
    console.error('[api/media/catalog] 目录获取异常:', err);
    return jsonError('海外影视资料目录获取失败', 502);
  }
}
