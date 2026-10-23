import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DoubanItem } from './types';
import { getCache, setCache } from './fetch-utils';

const execFileAsync = promisify(execFile);

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_W500 = 'https://image.tmdb.org/t/p/w500';
const IMAGE_BASE_ORIGINAL = 'https://image.tmdb.org/t/p/original';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟缓存

export interface TmdbMediaItem extends DoubanItem {
  backdrop?: string;
  overview?: string;
  card_subtitle?: string;
  area?: string;
  category?: 'movie' | 'tv';
  categoryName?: string;
  hotRank?: number;
  hotScore?: string;
}

export interface TmdbRawItem {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
  origin_country?: string[];
  genre_ids?: number[];
}

export interface TmdbDiscoverOptions {
  type?: 'movie' | 'tv' | 'anime' | 'variety' | 'documentary' | 'short_drama' | 'trending' | string;
  area?: string;
  genre?: string;
  year?: string;
  sort?: 'recommend' | 'time' | 'rank' | 'hot' | 'latest' | 'rating' | string;
  page?: number;
  query?: string;
}

const MOVIE_GENRE_MAP: Record<string, string> = {
  动作: '28',
  冒险: '12',
  动画: '16',
  喜剧: '35',
  犯罪: '80',
  纪录片: '99',
  剧情: '18',
  家庭: '10751',
  奇幻: '14',
  历史: '36',
  古装: '36',
  武侠: '28,36',
  恐怖: '27',
  音乐: '10402',
  悬疑: '9648',
  爱情: '10749',
  言情: '10749',
  科幻: '878',
  惊悚: '53',
  战争: '10752',
};

const TV_GENRE_MAP: Record<string, string> = {
  动作: '10759',
  冒险: '10759',
  热血: '10759',
  战斗: '10759',
  武侠: '10759',
  动画: '16',
  喜剧: '35',
  搞笑: '35',
  犯罪: '80',
  纪录片: '99',
  自然: '99',
  科学: '99',
  人文: '99',
  剧情: '18',
  都市: '18',
  言情: '18',
  爱情: '18',
  偶像: '18',
  恋爱: '18',
  校园: '18',
  治愈: '18',
  家庭: '10751',
  奇幻: '10765',
  科幻: '10765',
  机战: '10765',
  古装: '18,10768',
  历史: '10768',
  战争: '10768',
  军事: '10768',
  谍战: '9648,10768',
  悬疑: '9648',
  恐怖: '9648',
  惊悚: '9648',
  真人秀: '10764',
  竞技: '10764',
  美食: '10764',
  脱口秀: '10767',
  访谈: '10767',
};

const AREA_TO_ISO_MAP: Record<string, string> = {
  大陆: 'CN',
  中国大陆: 'CN',
  华语: 'CN',
  国产剧: 'CN',
  国产动画: 'CN',
  国产综艺: 'CN',
  香港: 'HK',
  中国香港: 'HK',
  港剧: 'HK',
  台湾: 'TW',
  中国台湾: 'TW',
  台剧: 'TW',
  美国: 'US',
  欧美: 'US',
  美剧: 'US',
  欧美动画: 'US',
  欧美综艺: 'US',
  日本: 'JP',
  日剧: 'JP',
  日本动画: 'JP',
  韩国: 'KR',
  韩剧: 'KR',
  韩国综艺: 'KR',
  英国: 'GB',
  英剧: 'GB',
  法国: 'FR',
  泰国: 'TH',
  泰剧: 'TH',
  印度: 'IN',
};

const GENRE_ID_NAME_MAP: Record<number, string> = {
  28: '动作',
  12: '冒险',
  16: '动画',
  35: '喜剧',
  80: '犯罪',
  99: '纪录片',
  18: '剧情',
  10751: '家庭',
  14: '奇幻',
  36: '历史',
  27: '恐怖',
  10402: '音乐',
  9648: '悬疑',
  10749: '爱情',
  878: '科幻',
  53: '惊悚',
  10752: '战争',
  10759: '动作冒险',
  10764: '真人秀',
  10765: '科幻奇幻',
  10767: '脱口秀',
  10768: '历史战争',
};

/** 读取环境变量中的 TMDB_API_KEY */
export function getTmdbApiKey(): string {
  return (process.env.TMDB_API_KEY || '').trim();
}

/** 底层 TMDB JSON 请求：优先原生 fetch，超时或代理受阻时自动回退至系统 curl */
async function requestTmdbJson(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<{
  results?: TmdbRawItem[];
  total_pages?: number;
  total_results?: number;
}> {
  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    throw new Error('未配置 TMDB_API_KEY 环境变量');
  }

  const query = new URLSearchParams({
    api_key: apiKey,
    language: 'zh-CN',
    ...params,
  });
  const fullUrl = `${TMDB_BASE_URL}${endpoint}?${query.toString()}`;
  const cacheKey = `tmdb:v1:${endpoint}:${query.toString()}`;
  const cached = getCache<{
    results?: TmdbRawItem[];
    total_pages?: number;
    total_results?: number;
  }>(cacheKey);
  if (cached) return cached;

  // 1. 原生 fetch（单元测试及标准容器直连）
  try {
    const res = await fetch(fullUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = await res.json();
      setCache(cacheKey, data, CACHE_TTL_MS);
      return data;
    }
  } catch {
    // 若在本地代理环境且 Node Undici 未走 http_proxy，则由下方 curl 兜底
  }

  // 2. 系统级 curl 桥接兜底（自动继承系统代理与 TLS 证书栈）
  if (!process.env.VITEST) {
    const { stdout } = await execFileAsync('curl', ['-s', '-L', '-m', '7', fullUrl], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const data = JSON.parse(stdout);
    if (data && Array.isArray(data.results)) {
      setCache(cacheKey, data, CACHE_TTL_MS);
      return data;
    }
  }

  throw new Error(`TMDB 接口请求失败: ${endpoint}`);
}

export function mapTmdbItem(
  item: TmdbRawItem,
  defaultMediaType: 'movie' | 'tv' = 'movie',
  overrideArea?: string,
  rankIndex?: number
): TmdbMediaItem {
  const title = (item.title || item.name || '').trim();
  const isTv = item.media_type === 'tv' || (item.media_type !== 'movie' && defaultMediaType === 'tv');
  const year = (item.release_date || item.first_air_date || '').slice(0, 4) || undefined;
  const rating =
    typeof item.vote_average === 'number' && item.vote_average > 0
      ? item.vote_average.toFixed(1)
      : undefined;
  const genreNames = (item.genre_ids || [])
    .map((gid) => GENRE_ID_NAME_MAP[gid])
    .filter(Boolean)
    .slice(0, 2);
  const firstGenre = genreNames[0];
  const categoryName = firstGenre || (isTv ? '精选剧集' : '院线电影');
  const cover = item.poster_path ? `${IMAGE_BASE_W500}${item.poster_path}` : '';
  const backdrop = item.backdrop_path ? `${IMAGE_BASE_ORIGINAL}${item.backdrop_path}` : cover;
  const area = overrideArea || item.origin_country?.[0] || undefined;
  const cardSubtitle = [year, area, ...genreNames].filter(Boolean).join(' · ') || categoryName;

  return {
    id: `tmdb_${item.id}`,
    title,
    cover,
    backdrop,
    rating,
    isTv,
    year,
    area,
    category: isTv ? 'tv' : 'movie',
    categoryName,
    card_subtitle: cardSubtitle,
    overview: item.overview || undefined,
    remarks: rating ? `★ ${rating}` : year ? `${year} · 4K` : '4K 臻彩',
    episodes_info: categoryName,
    hotRank: rankIndex !== undefined ? rankIndex + 1 : undefined,
    hotScore: rankIndex !== undefined ? `${(158 - rankIndex * 6.2).toFixed(1)}万` : undefined,
  };
}

/**
 * TMDB 全维影视资料库查询（支持趋势榜、多频道与类型/地区/年份/排序四维联合检索）
 */
export async function fetchTmdbCatalog(options: TmdbDiscoverOptions = {}): Promise<{
  items: TmdbMediaItem[];
  total: number;
  totalPages: number;
}> {
  const rawType = options.type || 'movie';
  const page = Math.max(1, options.page || 1);
  const query = (options.query || '').trim();

  // 1. 关键词搜索
  if (query) {
    const data = await requestTmdbJson('/search/multi', {
      query,
      page: String(page),
      include_adult: 'false',
    });
    const rawList = Array.isArray(data.results) ? data.results : [];
    const items = rawList
      .filter((i) => i.poster_path && (i.title || i.name))
      .map((i) => mapTmdbItem(i, rawType === 'tv' ? 'tv' : 'movie'));
    return {
      items,
      total: data.total_results || items.length,
      totalPages: Math.min(500, data.total_pages || 1),
    };
  }

  // 2. 全球实时热力趋势榜 (/trending/all/day)
  if (rawType === 'trending') {
    const data = await requestTmdbJson('/trending/all/day', { page: String(page) });
    const rawList = Array.isArray(data.results) ? data.results : [];
    const items = rawList
      .filter((i) => i.poster_path && (i.title || i.name))
      .map((i, idx) => mapTmdbItem(i, 'movie', undefined, idx));
    return {
      items,
      total: data.total_results || items.length,
      totalPages: Math.min(500, data.total_pages || 1),
    };
  }

  // 3. 频道与四维筛选参数组装 (/discover/movie 或 /discover/tv)
  const isMovieChannel = rawType === 'movie';
  const endpoint = isMovieChannel ? '/discover/movie' : '/discover/tv';
  const params: Record<string, string> = {
    page: String(page),
    include_adult: 'false',
  };

  const genreList: string[] = [];
  if (rawType === 'anime') genreList.push('16');
  else if (rawType === 'variety') genreList.push('10764|10767');
  else if (rawType === 'documentary') genreList.push('99');

  const rawGenre = (options.genre || '').trim();
  if (rawGenre && rawGenre !== '全部' && rawGenre !== '热门') {
    const gMap = isMovieChannel ? MOVIE_GENRE_MAP : TV_GENRE_MAP;
    const mappedGenre = gMap[rawGenre];
    if (mappedGenre && !genreList.includes(mappedGenre)) {
      genreList.push(mappedGenre);
    }
  }
  if (genreList.length > 0) {
    params.with_genres = genreList.join(',');
  }

  // 地区过滤
  const rawArea = (options.area || '').trim();
  const isoCountry = rawArea && rawArea !== '全部' ? AREA_TO_ISO_MAP[rawArea] : undefined;
  if (isoCountry) {
    params.with_origin_country = isoCountry;
  } else if (rawType === 'short_drama') {
    params.with_origin_country = 'CN';
  }

  // 年份过滤
  const rawYear = (options.year || '').trim();
  if (rawYear && rawYear !== '全部') {
    if (rawYear === '更早') {
      if (isMovieChannel) params['primary_release_date.lte'] = '2018-12-31';
      else params['first_air_date.lte'] = '2018-12-31';
    } else if (/^\d{4}$/.test(rawYear)) {
      if (isMovieChannel) params.primary_release_year = rawYear;
      else params.first_air_date_year = rawYear;
    }
  }

  // 排序过滤
  const sort = options.sort || 'recommend';
  if (sort === 'rank' || sort === 'rating') {
    params.sort_by = 'vote_average.desc';
    params['vote_count.gte'] = '30';
  } else if (sort === 'time' || sort === 'latest') {
    const today = new Date().toISOString().slice(0, 10);
    if (isMovieChannel) {
      params.sort_by = 'primary_release_date.desc';
      params['primary_release_date.lte'] = today;
    } else {
      params.sort_by = 'first_air_date.desc';
      params['first_air_date.lte'] = today;
    }
    params['vote_count.gte'] = '1';
  } else {
    params.sort_by = 'popularity.desc';
  }

  const data = await requestTmdbJson(endpoint, params);
  const rawList = Array.isArray(data.results) ? data.results : [];
  const items = rawList
    .filter((i) => i.poster_path && (i.title || i.name))
    .map((i, idx) =>
      mapTmdbItem(
        i,
        isMovieChannel ? 'movie' : 'tv',
        rawArea && rawArea !== '全部' ? rawArea : undefined,
        idx
      )
    );

  return {
    items,
    total: data.total_results || items.length,
    totalPages: Math.min(500, data.total_pages || 1),
  };
}
