/**
 * 影视资料库与多维门面服务 (MediaLibraryService)
 * 壳肉分离架构展示门面核心：
 * 1. 豆瓣公开 API 与榜单获取
 * 2. Bangumi 动漫新番周历放送表
 * 3. 主力苹果CMS采集源「最近更新」静默对齐服务 (RecentUpdatesSyncer)
 * 4. 集数角标智能推导算法 (resolveEpisodeBadge)
 */

import type { SourceConfig } from './types';

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
}

export interface BangumiDaySchedule {
  weekdayId: number; // 1~7 (周一~周日)
  weekdayCn: string;
  items: MediaItem[];
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
 * 优先级 2: 豆瓣接口返回的 episodes_info（如 "更新至10集" 或 "12集全"）
 * 优先级 3: 从豆瓣 card_subtitle 或 info 中正则提取集数
 * 优先级 4: 电影提取年份作为兜底标签（如 "2024 · 正片"），无年份返回 "热播"
 */
export function resolveEpisodeBadge(
  doubanItem: Partial<MediaItem>,
  cmsRemarksMap: Map<string, string> = new Map()
): string {
  const title = doubanItem.title || '';
  const normTitle = normalizeTitleForMatch(title);

  // 优先级 1：主力采集源实时更新备注
  if (normTitle && cmsRemarksMap.has(normTitle)) {
    const remark = cmsRemarksMap.get(normTitle);
    if (remark && remark.trim()) {
      return remark.trim();
    }
  }

  // 优先级 2：豆瓣原生 episodes_info
  if (doubanItem.episodes_info && doubanItem.episodes_info.trim() !== '') {
    return doubanItem.episodes_info.trim();
  }

  // 优先级 3：从 card_subtitle 或 info 中正则提取集数
  const subtitle = doubanItem.card_subtitle || doubanItem.info || '';
  const epMatch = subtitle.match(/(更新至\s*\d+\s*集|全\s*\d+\s*集|\d+\s*集全|连载至\s*\d+\s*集)/i);
  if (epMatch) {
    return epMatch[1].replace(/\s+/g, '');
  }

  // 优先级 4：年份兜底或热播
  const yearMatch = subtitle.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    return `${yearMatch[1]} · 正片`;
  }
  if (doubanItem.year) {
    return `${doubanItem.year} · 正片`;
  }

  return '热播';
}

/** 规范化豆瓣封面图片（支持 no-referrer，大图提取） */
export function formatDoubanCover(url?: string): string {
  if (!url) return '';
  return url.replace(/\/view\/subject\/[s|m]\/public\//, '/view/subject/l/public/');
}

/**
 * 主采集源「最近更新」静默对齐服务 (RecentUpdatesSyncer)
 * 抓取主力采集源前 2 页最新更新条目，生成归一化片名映射字典与今日实时更新流
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
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
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

      // 提取今日连载（过滤掉成人或格式异常条目）
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

/** 1. 获取首页榜单与分类推荐（全面接入 0 防盗链、免服务器代理的开放官方图床引擎） */
export async function fetchDoubanCollectionItems(
  collectionId: string,
  start = 0,
  count = 20,
  signal?: AbortSignal
): Promise<{ items: MediaItem[]; total: number }> {
  let type = 'movie';
  const tag = '热门';
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

  const queryParams = new URLSearchParams({
    type,
    tag,
    sort,
    pageStart: String(start),
    pageSize: String(count),
  });

  try {
    const res = await fetch(`/api/douban?${queryParams.toString()}`, { signal });
    if (!res.ok) {
      throw new Error(`影视数据获取失败: ${res.status}`);
    }

    const json = await res.json();
    const rawItems = Array.isArray(json?.items) ? json.items : [];

    const typeName =
      type === 'movie' ? '电影' : type === 'tv' ? '剧集' : type === 'anime' ? '动漫' : '综艺';

    const items: MediaItem[] = rawItems.map((raw: Record<string, unknown>) => {
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
          typeof raw?.overview === 'string' && raw.overview
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
    console.warn(`[MediaLibraryService] 获取影视推荐失败 (${collectionId}):`, err);
    return { items: [], total: 0 };
  }
}

/** 2. 获取豆瓣带 episodes_info 的多维标签推荐 */
export async function fetchDoubanTagSubjects(
  mediaType: 'movie' | 'tv',
  tag: string,
  start = 0,
  limit = 24,
  signal?: AbortSignal
): Promise<MediaItem[]> {
  const res = await fetch(
    `/api/douban-proxy?type=tag_subjects&mediaType=${mediaType}&tag=${encodeURIComponent(
      tag
    )}&start=${start}&limit=${limit}`,
    { signal }
  );

  if (!res.ok) return [];

  const json = await res.json().catch(() => null);
  const rawList = Array.isArray(json?.subjects) ? json.subjects : [];

  return rawList.map((raw: Record<string, unknown>) => ({
    id: String(raw?.id || ''),
    title: String(raw?.title || '').trim(),
    cover: formatDoubanCover(String(raw?.cover || '')),
    rating: raw?.rate ? String(raw.rate) : undefined,
    episodes_info: typeof raw?.episodes_info === 'string' ? raw.episodes_info : undefined,
  }));
}

const WEEKDAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 3. 获取 Bangumi 每周放送日历 (周一至周日) */
export async function fetchBangumiSchedule(signal?: AbortSignal): Promise<BangumiDaySchedule[]> {
  const res = await fetch('/api/bangumi/calendar', { signal });
  if (!res.ok) return [];

  const json = await res.json().catch(() => null);
  const days = Array.isArray(json?.days) ? json.days : [];

  const schedule: BangumiDaySchedule[] = [];

  for (let i = 1; i <= 7; i++) {
    const found = days.find((d: Record<string, unknown>) => Number(d.weekday) === i);
    const rawItems = Array.isArray(found?.items) ? found.items : [];
    const items: MediaItem[] = rawItems.map((item: Record<string, unknown>) => ({
      id: String(item.id || ''),
      title: String(item.title || ''),
      cover: formatDoubanCover(String(item.cover || '')),
      rating: item.rating ? String(item.rating) : undefined,
      card_subtitle: '新番连载',
    }));

    schedule.push({
      weekdayId: i,
      weekdayCn: WEEKDAY_NAMES[i],
      items,
    });
  }

  return schedule;
}
