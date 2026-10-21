import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getEpisodeIntro } from '@/lib/episode-intro';

export const runtime = 'nodejs';

/**
 * 电视剧/动漫当前分集剧情介绍 API
 * 查询参数：
 * - title: 剧名
 * - episode: 当前集数（数字，1-based）
 * - type: 视频分类（tv, anime 等）
 */
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const url = new URL(req.url);
  const title = (url.searchParams.get('title') || '').trim().slice(0, 100);
  const episodeStr = url.searchParams.get('episode') || '1';
  const episode = Math.max(1, parseInt(episodeStr, 10) || 1);
  const type = (url.searchParams.get('type') || '').trim();

  if (!title) {
    return jsonError('缺少视频标题', 400);
  }

  try {
    const result = await getEpisodeIntro(title, episode, type);
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, max-age=1800, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error('[api/media/episode-intro] 获取分集介绍异常:', err);
    return jsonError('获取分集介绍失败', 500);
  }
}
