/**
 * 豆瓣官方开放接口前端 SDK（壳肉分离 - 门面层数据客户端）
 * 所有请求均经由 /api/douban-proxy 代理转发并受服务端缓存保护
 */

export interface DoubanSubject {
  id: string; // 豆瓣 subject_id
  title: string;
  cover: string; // 高清海报 URL
  rate: string; // 豆瓣评分，如 "8.5" 或 "暂无评分"
  year?: string; // 年份，如 "2024"
  genres?: string[]; // 类型标签，如 ["剧情", "动作"]
  countries?: string[]; // 地区，如 ["中国大陆"]
  intro?: string; // 完整剧情简介
  actors?: string[]; // 主演名单
  directors?: string[]; // 导演名单
  cardSubtitle?: string; // 副标题或简短描述
}

export type DoubanCollectionId =
  | 'movie_hot'
  | 'tv_hot'
  | 'tv_variety_show'
  | 'tv_animation'
  | 'movie_top250'
  | 'movie_weekly_best';

export interface DoubanFilterParams {
  tags?: '电影' | '电视剧' | '综艺' | '动漫' | string;
  sort?: 'U' | 'T' | 'S' | 'R' | string; // U: 近期热门, T: 标记最多, S: 评分最高, R: 最新上映
  start?: number;
  genres?: string; // 如 "剧情,动作"
  countries?: string; // 如 "中国大陆,香港"
  yearRange?: string; // 如 "2020,2024"
}

export interface DoubanDetailResult {
  id: string;
  title: string;
  cover: string;
  rate: string;
  year?: string;
  intro?: string;
  genres: string[];
  countries: string[];
  durations: string[];
  actors: string[];
  directors: string[];
}

export interface DoubanSuggestItem {
  id: string;
  title: string;
  year?: string;
  subTitle?: string;
  img?: string;
  type?: string;
}

/** 规范化豆瓣封面图片（支持 no-referrer，或降级镜像） */
export function formatDoubanCover(url?: string): string {
  if (!url) return '';
  // 豆瓣图片直连在带 referrerpolicy="no-referrer" 时通常可直接展示
  // 移除豆瓣图片缩略图限制，返回原尺寸高清海报
  return url.replace(/\/view\/subject\/[s|m]\/public\//, '/view/subject/l/public/');
}

/** 1. 榜单接口：获取热门电影、电视剧、动漫、综艺等 */
export async function fetchDoubanCollection(
  collectionId: DoubanCollectionId,
  start = 0,
  count = 20,
  signal?: AbortSignal
): Promise<{ items: DoubanSubject[]; total: number }> {
  const url = `/api/douban-proxy?type=collection&collectionId=${encodeURIComponent(
    collectionId
  )}&start=${start}&count=${count}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`获取豆瓣榜单失败: HTTP ${res.status}`);
  }

  const json = await res.json();
  const rawItems = json?.subject_collection_items || [];
  const total = typeof json?.total === 'number' ? json.total : rawItems.length;

  const items: DoubanSubject[] = rawItems.map((raw: Record<string, unknown>) => {
    const rawRate = (raw?.rating as Record<string, unknown> | undefined)?.value;
    const rate = rawRate ? Number(rawRate).toFixed(1) : '暂无评分';
    const pic = raw?.pic as Record<string, unknown> | undefined;
    const cover = raw?.cover as Record<string, unknown> | undefined;
    const coverUrl = String(
      pic?.large || pic?.normal || cover?.url || raw?.cover_url || ''
    );

    // 解析年份（优先从 year 字段，没有则从 card_subtitle 中正则提取）
    let year = raw?.year ? String(raw.year) : '';
    if (!year && raw?.card_subtitle) {
      const match = String(raw.card_subtitle).match(/\b(19\d{2}|20\d{2})\b/);
      if (match) year = match[1];
    }

    return {
      id: String(raw?.id || ''),
      title: String(raw?.title || '').trim(),
      cover: formatDoubanCover(coverUrl),
      rate,
      year,
      cardSubtitle: typeof raw?.card_subtitle === 'string' ? raw.card_subtitle : '',
    };
  });

  return { items, total };
}

/** 2. 多维分类筛选接口：片库多维联动（支持服务端自愈与客户端平滑降级） */
export async function fetchDoubanFilter(
  params: DoubanFilterParams,
  signal?: AbortSignal
): Promise<{ items: DoubanSubject[] }> {
  const q = new URLSearchParams({
    type: 'search',
    tags: params.tags || '电影',
    sort: params.sort || 'U',
    start: String(params.start || 0),
  });

  if (params.genres) q.set('genres', params.genres);
  if (params.countries) q.set('countries', params.countries);
  if (params.yearRange) q.set('year_range', params.yearRange);

  try {
    const res = await fetch(`/api/douban-proxy?${q.toString()}`, { signal });
    if (!res.ok) {
      console.warn(`[DoubanAPI] 筛选代理返回 HTTP ${res.status}，尝试切换备用推荐通道`);
      // 备用推荐通道兜底
      const mediaType = params.tags?.includes('电视剧') ? 'tv' : 'movie';
      const fallbackRes = await fetch(
        `/api/douban-proxy?type=recommend&mediaType=${mediaType}&tags=${encodeURIComponent(
          params.tags || '热门'
        )}&start=${params.start || 0}&count=20`,
        { signal }
      );
      if (fallbackRes.ok) {
        const fbJson = await fallbackRes.json();
        const fbList = Array.isArray(fbJson?.items) ? fbJson.items : [];
        const fallbackItems: DoubanSubject[] = fbList.map((raw: Record<string, unknown>) => {
          const ratingObj = raw?.rating as { value?: number } | undefined;
          const rate = ratingObj?.value ? Number(ratingObj.value).toFixed(1) : '暂无评分';
          const picObj = raw?.pic as { normal?: string; large?: string } | undefined;
          const cover = picObj?.normal || picObj?.large || String(raw?.cover_url || '');
          return {
            id: String(raw?.id || ''),
            title: String(raw?.title || '').trim(),
            cover: formatDoubanCover(cover),
            rate,
            year: raw?.year ? String(raw.year) : undefined,
          };
        });
        return { items: fallbackItems };
      }
      return { items: [] };
    }

    const json = await res.json();
    const rawList = Array.isArray(json?.data) ? json.data : [];

    const items: DoubanSubject[] = rawList.map((raw: Record<string, unknown>) => {
      const rawRate = raw?.rate;
      const rate = rawRate && rawRate !== '0' ? Number(rawRate).toFixed(1) : '暂无评分';
      return {
        id: String(raw?.id || ''),
        title: String(raw?.title || '').trim(),
        cover: formatDoubanCover(String(raw?.cover || '')),
        rate,
        year: raw?.year ? String(raw.year) : undefined,
      };
    });

    return { items };
  } catch (err) {
    if (signal?.aborted) return { items: [] };
    console.warn('[DoubanAPI] 分类筛选请求捕获异常，已优雅降级为空集:', err);
    return { items: [] };
  }
}

/** 3. 单部影片详情接口：获取完整简介、演员、导演与类型 */
export async function fetchDoubanDetail(
  doubanId: string,
  signal?: AbortSignal
): Promise<DoubanDetailResult> {
  const res = await fetch(`/api/douban-proxy?type=detail&id=${encodeURIComponent(doubanId)}`, {
    signal,
  });

  if (!res.ok) {
    throw new Error(`获取豆瓣详情失败: HTTP ${res.status}`);
  }

  const json = await res.json();
  const rawRate = json?.rating?.value;
  const rate = rawRate ? Number(rawRate).toFixed(1) : '暂无评分';
  const coverUrl = json?.pic?.large || json?.pic?.normal || json?.cover?.url || '';

  const actors = Array.isArray(json?.actors)
    ? json.actors
        .map((a: unknown) => (typeof a === 'string' ? a : (a as Record<string, unknown>)?.name))
        .filter((n: unknown): n is string => typeof n === 'string' && Boolean(n))
    : [];

  const directors = Array.isArray(json?.directors)
    ? json.directors
        .map((d: unknown) => (typeof d === 'string' ? d : (d as Record<string, unknown>)?.name))
        .filter((n: unknown): n is string => typeof n === 'string' && Boolean(n))
    : [];

  const genres = Array.isArray(json?.genres) ? json.genres.map(String) : [];
  const countries = Array.isArray(json?.countries) ? json.countries.map(String) : [];
  const durations = Array.isArray(json?.durations) ? json.durations.map(String) : [];

  return {
    id: String(json?.id || doubanId),
    title: String(json?.title || '').trim(),
    cover: formatDoubanCover(coverUrl),
    rate,
    year: json?.year ? String(json.year) : undefined,
    intro: json?.intro || '',
    genres,
    countries,
    durations,
    actors,
    directors,
  };
}

/** 4. 搜索框实时联想接口 */
export async function fetchDoubanSuggest(
  keyword: string,
  signal?: AbortSignal
): Promise<DoubanSuggestItem[]> {
  if (!keyword.trim()) return [];

  const res = await fetch(
    `/api/douban-proxy?type=suggest&q=${encodeURIComponent(keyword.trim())}`,
    { signal }
  );

  if (!res.ok) return [];

  try {
    const list = await res.json();
    if (!Array.isArray(list)) return [];
    return list.map((raw: Record<string, unknown>) => ({
      id: String(raw?.id || ''),
      title: String(raw?.title || ''),
      year: raw?.year ? String(raw.year) : undefined,
      subTitle: typeof raw?.sub_title === 'string' ? raw.sub_title : undefined,
      img: formatDoubanCover(typeof raw?.img === 'string' ? raw.img : undefined),
      type: typeof raw?.type === 'string' ? raw.type : undefined,
    }));
  } catch {
    return [];
  }
}
