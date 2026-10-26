/**
 * 影视资料库门面服务 (MediaLibraryService)
 * 1. 全球 4K 榜单与分类推荐 (/api/media/feed)
 * 2. 主力采集源「最近更新」静默对齐服务 (RecentUpdatesSyncer)
 * 3. 集数角标智能推导算法 (resolveEpisodeBadge)
 */

import type { SourceConfig } from './types';
import { buildObfuscatedProxyUrl } from './url-obfuscator';
import { buildMediaFeedParams } from './media-feed';

export interface MediaItem {
  id: string;
  title: string;
  cover: string;
  backdrop?: string;
  overview?: string;
  area?: string;
  rating?: string;
  episodes_info?: string;
  card_subtitle?: string;
  info?: string;
  year?: string;
  typeName?: string;
  remarks?: string;
  actors?: string[];
  isRecent?: boolean;
  hotRank?: number;
  hotScore?: string;
  isTv?: boolean;
  category?: string;
}

/** 归一化片名，用于跨系统精确匹配对齐 */
export function normalizeTitleForMatch(title: string): string {
  return (title || '')
    .replace(/[\s:：·\-—_()（）【】\[\]《》`'"]/g, '')
    .toLowerCase();
}

/**
 * 提取海报卡片上的更新集数/状态角标 (核心算法)
 * 优先级 1: 命中主力采集源实时更新备注（如 "更新至18集"、"全40集"、"HD国语"）
 * 优先级 2: 从 episodes_info 或 remarks 中智能识别明确集数与完结状态
 * 优先级 3: 从 card_subtitle / info / overview 中正则提取集数
 * 优先级 4: 剧集/连续剧/动漫按年份推导连载或完结（"连载更新中" / "全集完结"）
 * 优先级 5: 电影提取年份作为兜底标签（如 "2024 · 正片"），无年份返回 "热播"
 */
export function resolveEpisodeBadge(
  mediaItem: Partial<MediaItem> & { isTv?: boolean; category?: string },
  cmsRemarksMap: Map<string, string> = new Map()
): string {
  const title = mediaItem.title || '';
  const normTitle = normalizeTitleForMatch(title);

  // 优先级 1：主力采集源实时更新备注
  if (normTitle && cmsRemarksMap.has(normTitle)) {
    const remark = cmsRemarksMap.get(normTitle);
    if (remark && remark.trim()) {
      return remark.trim();
    }
  }

  // 优先级 2：原生 episodes_info 或 remarks（若含集数或完结特征）
  const candidates = [mediaItem.episodes_info, mediaItem.remarks];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '0' || trimmed === 'null') continue;
    if (
      /(?:更新至|连载至|全|第)\s*\d+\s*集|\d+\s*集全|完结|连载|更新中/.test(trimmed) &&
      !trimmed.includes('★')
    ) {
      return trimmed.replace(/\s+/g, '');
    }
  }

  // 优先级 3：从 card_subtitle / info / overview 中正则提取集数
  const textContent = `${mediaItem.card_subtitle || ''} ${mediaItem.info || ''} ${mediaItem.overview || ''}`;
  const epMatch = textContent.match(/(?:更新至|连载至|全|共)\s*第?\s*(\d+)\s*集|\d+\s*集全/i);
  if (epMatch) {
    const matchStr = epMatch[0].replace(/\s+/g, '');
    return matchStr.startsWith('共') ? `全${epMatch[1]}集` : matchStr;
  }

  // 如果 episodes_info 存在且不是通用标签（如排除“精选剧集”、“院线电影”），仍然允许直接展示
  if (
    mediaItem.episodes_info &&
    mediaItem.episodes_info.trim() &&
    !['精选剧集', '院线电影', '剧情', '4K 臻彩', '4K'].includes(mediaItem.episodes_info.trim())
  ) {
    return mediaItem.episodes_info.trim();
  }

  // 优先级 4：判断剧集/动漫/综艺，按年份推导连载或完结
  const isTv =
    Boolean(mediaItem.isTv) ||
    mediaItem.category === 'tv' ||
    Boolean(mediaItem.typeName?.includes('剧')) ||
    Boolean(mediaItem.typeName?.includes('动漫')) ||
    Boolean(mediaItem.typeName?.includes('综艺'));

  if (isTv) {
    const currentYear = new Date().getFullYear();
    const numYear = mediaItem.year ? parseInt(mediaItem.year, 10) : currentYear;
    return numYear >= currentYear - 1 ? '连载更新中' : '全集完结';
  }

  // 优先级 5：电影提取年份作为兜底标签（如 "2024 · 正片"），无年份返回 "热播"
  const yearMatch = textContent.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    return `${yearMatch[1]} · 正片`;
  }
  if (mediaItem.year) {
    return `${mediaItem.year} · 正片`;
  }

  return '热播';
}

/**
 * 主采集源「最近更新」静默对齐服务 (RecentUpdatesSyncer)
 */
export async function syncRecentUpdates(
  masterSource: SourceConfig,
  signal?: AbortSignal
): Promise<{
  remarksMap: Map<string, string>;
  recentList: MediaItem[];
}> {
  const remarksMap = new Map<string, string>();
  const recentList: MediaItem[] = [];
  if (!masterSource?.url) return { remarksMap, recentList };

  const baseUrl = masterSource.url.replace(/\/+$/, '');
  const pages = [1, 2];

  const fetchPage = async (page: number) => {
    try {
      const targetUrl = `${baseUrl}?ac=videolist&pg=${page}`;
      const proxyUrl = buildObfuscatedProxyUrl(targetUrl);
      const res = await fetch(proxyUrl, { signal, headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const json = await res.json().catch(() => null);
      if (!json || typeof json !== 'object') return [];
      const list = Array.isArray(json.list) ? json.list : Array.isArray(json.data) ? json.data : [];
      return list;
    } catch {
      return [];
    }
  };

  const results = await Promise.allSettled(pages.map(fetchPage));

  for (const r of results) {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
    for (const item of r.value) {
      if (!item || typeof item !== 'object') continue;
      const vodName = String(item.vod_name || item.name || '').trim();
      const vodRemarks = String(item.vod_remarks || item.remarks || '').trim();
      if (!vodName) continue;

      const norm = normalizeTitleForMatch(vodName);
      if (vodRemarks && !remarksMap.has(norm)) {
        remarksMap.set(norm, vodRemarks);
      }

      const vodPic = String(item.vod_pic || item.pic || '');
      const typeName = String(item.type_name || item.typeName || '');
      const year = String(item.vod_year || item.year || '');
      const id = String(item.vod_id || item.id || '');

      recentList.push({
        id: `recent_${id}`,
        title: vodName,
        cover: vodPic,
        remarks: vodRemarks,
        typeName,
        year,
        isRecent: true,
      });
    }
  }

  return { remarksMap, recentList };
}

/** 获取首页榜单与分类推荐（统一请求资料流 /api/media/feed 接口） */
export async function fetchDoubanCollectionItems(
  collectionId: string,
  start = 0,
  count = 20,
  signal?: AbortSignal
): Promise<{ items: MediaItem[]; total: number }> {
  let type = 'movie';
  let sort = 'recommend';

  if (collectionId === 'tv_hot') {
    type = 'tv';
  } else if (collectionId === 'movie_top250') {
    type = 'movie';
    sort = 'rank';
  } else if (collectionId === 'tv_animation') {
    type = 'anime';
  } else if (collectionId === 'tv_variety_show') {
    type = 'variety';
  } else if (collectionId === 'trending') {
    type = 'trending';
  } else if (collectionId === 'movie_hot') {
    type = 'movie';
  }

  const page = Math.max(1, Math.floor(start / Math.max(1, count)) + 1);
  // 与首页推荐区/片库页统一参数顺序，避免同一接口因 query 顺序不同而错过浏览器/CDN 缓存。
  const queryParams = buildMediaFeedParams({ type, sort, page });

  try {
    const res = await fetch(`/api/media/feed?${queryParams.toString()}`, { signal });
    if (!res.ok) {
      throw new Error(`TMDB 影视数据获取失败: ${res.status}`);
    }

    const json = await res.json();
    const rawItems = Array.isArray(json?.items) ? json.items : [];

    const typeName =
      type === 'movie' ? '电影' : type === 'tv' ? '剧集' : type === 'anime' ? '动漫' : '综艺';

    const items: MediaItem[] = rawItems.slice(0, count).map((raw: Record<string, unknown>) => {
      const rawRate = raw?.rating;
      const rating = rawRate ? String(rawRate) : undefined;
      const year = raw?.year ? String(raw.year) : undefined;
      const title = String(raw?.title || '').trim();

      const epInfo =
        typeof raw?.episodes_info === 'string' && raw.episodes_info
          ? raw.episodes_info
          : typeof raw?.remarks === 'string' && raw.remarks
            ? raw.remarks
            : undefined;

      return {
        id: String(raw?.id || ''),
        title,
        cover: String(raw?.cover || ''),
        backdrop: typeof raw?.backdrop === 'string' && raw.backdrop ? raw.backdrop : String(raw?.cover || ''),
        overview: typeof raw?.overview === 'string' && raw.overview ? raw.overview : undefined,
        area: typeof raw?.area === 'string' && raw.area ? raw.area : undefined,
        rating,
        year,
        typeName,
        card_subtitle:
          typeof raw?.card_subtitle === 'string' && raw.card_subtitle
            ? raw.card_subtitle
            : typeof raw?.overview === 'string' && raw.overview
              ? raw.overview
              : year
                ? `${year} · ${typeName}`
                : typeName,
        episodes_info: epInfo,
        hotRank: typeof raw?.hotRank === 'number' ? raw.hotRank : undefined,
        hotScore: typeof raw?.hotScore === 'string' ? raw.hotScore : undefined,
      };
    });

    return { items, total: json?.total ?? items.length };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    console.warn(`[MediaLibraryService] 获取 TMDB 推荐失败 (${collectionId}):`, err);
    return { items: [], total: 0 };
  }
}
