import { fetchUpstream, getCache, setCache } from './fetch-utils';

export interface EpisodeIntroResult {
  ok: boolean;
  episode: number;
  title?: string;
  desc?: string;
  airdate?: string;
  duration?: string;
  source?: 'bangumi' | 'tvmaze' | 'plot' | 'fallback';
}

const CACHE_TTL = 4 * 60 * 60 * 1000; // 缓存 4 小时
const BANGUMI_UA = 'LibreTV (+https://github.com/LibreSpark/LibreTV)';

interface BangumiEp {
  id: number;
  sort: number;
  ep: number;
  name: string;
  name_cn: string;
  desc?: string;
  airdate?: string;
  duration?: string;
}

/**
 * 从 Bangumi 番组计划获取单集介绍（重点覆盖日本动画与国漫新番）
 */
async function fetchBangumiEpisode(title: string, episodeNum: number): Promise<EpisodeIntroResult | null> {
  const normTitle = title.replace(/(第[一二三四五六七八九十\d]+季|Season\s*\d+|S\d+)/gi, '').trim() || title;
  const cacheKey = `ep:intro:bgm:${normTitle}:${episodeNum}`;
  const cached = getCache<EpisodeIntroResult>(cacheKey);
  if (cached) return cached;

  try {
    const searchUrl = `https://api.bgm.tv/search/subject/${encodeURIComponent(normTitle)}?type=2`;
    const searchRes = await fetchUpstream(searchUrl, {
      timeoutMs: 6000,
      headers: { 'User-Agent': BANGUMI_UA, Accept: 'application/json' },
    });
    if (!searchRes.ok) return null;

    const searchData = (await searchRes.json()) as { list?: Array<{ id: number }> };
    const subjectId = searchData.list?.[0]?.id;
    if (!subjectId) return null;

    // 拉取分集列表
    const epUrl = `https://api.bgm.tv/v0/episodes?subject_id=${subjectId}`;
    const epRes = await fetchUpstream(epUrl, {
      timeoutMs: 6000,
      headers: { 'User-Agent': BANGUMI_UA, Accept: 'application/json' },
    });
    if (!epRes.ok) return null;

    const epData = (await epRes.json()) as { data?: BangumiEp[] };
    const episodes = Array.isArray(epData.data) ? epData.data : [];
    const target = episodes.find((e) => e.sort === episodeNum || e.ep === episodeNum);
    if (!target) return null;

    const res: EpisodeIntroResult = {
      ok: true,
      episode: episodeNum,
      title: target.name_cn?.trim() || target.name?.trim() || undefined,
      desc: target.desc?.trim() || undefined,
      airdate: target.airdate?.trim() || undefined,
      duration: target.duration?.trim() || undefined,
      source: 'bangumi',
    };

    setCache(cacheKey, res, CACHE_TTL);
    return res;
  } catch (err) {
    console.warn('[episode-intro] Bangumi 分集获取失败:', err);
    return null;
  }
}

/**
 * 获取动漫或电视剧当前集的详情介绍
 */
export async function getEpisodeIntro(
  title: string,
  episodeNum: number,
  type?: string,
  extra?: { plotDetail?: string; plotName?: string }
): Promise<EpisodeIntroResult> {
  if (!title || episodeNum < 1) {
    return { ok: false, episode: episodeNum };
  }

  // 1. 如果有上游 CMS 自带的分集剧情 (vod_plot_detail)
  if (extra?.plotDetail) {
    const details = extra.plotDetail.split('$$$');
    const names = extra.plotName ? extra.plotName.split('$$$') : [];
    const plotIdx = episodeNum - 1;
    if (details[plotIdx] && details[plotIdx].trim()) {
      return {
        ok: true,
        episode: episodeNum,
        title: names[plotIdx]?.trim() || `第 ${episodeNum} 集`,
        desc: details[plotIdx].trim(),
        source: 'plot',
      };
    }
  }

  // 2. 动漫优先查 Bangumi
  const isAnime = type === 'anime' || /动漫|动画|番剧/.test(type || '') || /第.+季|剧场版/.test(title);
  if (isAnime) {
    const bgm = await fetchBangumiEpisode(title, episodeNum);
    if (bgm && (bgm.desc || bgm.title)) {
      return bgm;
    }
  }

  // 3. 通用剧集也尝试匹配 Bangumi（部分国产剧、漫改真人剧 Bangumi 同样有收录）
  const bgmTry = await fetchBangumiEpisode(title, episodeNum);
  if (bgmTry && (bgmTry.desc || bgmTry.title)) {
    return bgmTry;
  }

  // 4. 若无独立分集介绍，返回结构化轻量兜底
  return {
    ok: true,
    episode: episodeNum,
    title: `第 ${episodeNum} 集`,
    desc: undefined,
    source: 'fallback',
  };
}
