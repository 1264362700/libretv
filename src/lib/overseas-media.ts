/**
 * 海外影视资料库适配层（免 key 免费源聚合）
 *
 * 目标：补齐项目现有 76 个采集站缺失的「资料维度」能力。采集站只提供播放地址与
 * 粗粒度标题/封面，海外影视条目还需要评分、演职员、简介、集数、播出状态等元数据。
 *
 * 三个免 key 数据源（均已实测连通）：
 * 1. Cinemeta / Stremio (v3-cinemeta.strem.io)
 *    - 覆盖电影与剧集，元数据最完整：评分、导演、主演、简介、类型、年份、时长
 *    - 海报走 images.metahub.space，实测无防盗链
 *    - ⚠️ 目录与搜索端点返回 307 跳转至 cinemeta-catalogs.strem.io。
 *      fetchUpstream 默认开启安全重定向可正确跟随；一旦关闭 safeRedirects
 *      会得到「HTTP 200 但响应体为空」的静默失败，务必不要关闭。
 * 2. TVMaze (api.tvmaze.com)
 *    - 剧集维度最强：完整分集清单、播出状态与档期、cast/crew 演职员、人物资料
 *    - 全站免 key、无风控、结构稳定
 * 3. AniList (graphql.anilist.co)
 *    - 动漫维度：评分 0-100、题材标签、制作人员、连载状态
 *    - ⚠️ 仅支持 POST 请求，GET 一律返回 404
 *
 * 设计约束：
 * - 全部走服务端 fetchUpstream（含 SSRF 校验与逐跳安全重定向），前端不直连
 * - 统一归一化为 OverseasMediaItem / OverseasMediaDetail，上层无需感知源差异
 * - 任一源失败不影响其他源，返回体带 failures 明示降级情况
 */

import { fetchUpstream, getCache, setCache } from './fetch-utils';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** 详情与人物资料缓存 24 小时（海外条目信息基本静态，变更极少） */
const DETAIL_CACHE_TTL = 24 * 60 * 60 * 1000;
/** 搜索结果缓存 10 分钟（平衡新鲜度与上游压力，实测上游耗时 1.1-1.3s） */
const SEARCH_CACHE_TTL = 10 * 60 * 1000;
/** 目录列表缓存 2 小时（对齐 douban-weekly 的 CACHE_TTL 量级） */
const CATALOG_CACHE_TTL = 2 * 60 * 60 * 1000;

export type OverseasMediaType = 'movie' | 'series' | 'anime';

export const OVERSEAS_MEDIA_TYPES: OverseasMediaType[] = ['movie', 'series', 'anime'];

/** 海外资料条目：三个源归一化后的统一结构 */
export interface OverseasMediaItem {
  /** 全局唯一标识，形如 `cinemeta:tt0111161` / `tvmaze:169` / `anilist:154587` */
  id: string;
  /** 数据来源标识，便于前端回查与排错 */
  source: 'cinemeta' | 'tvmaze' | 'anilist';
  /** 来源内原始 ID（IMDb id / TVMaze show id / AniList media id） */
  sourceId: string;
  title: string;
  originalTitle?: string;
  cover?: string;
  backdrop?: string;
  year?: string;
  /** 评分，统一 0-10 制保留一位小数 */
  rating?: string;
  genres?: string[];
  description?: string;
  type: OverseasMediaType;
  /** 电影：片长；剧集：单集时长 */
  runtime?: string;
  /** 剧集：播出状态（Ended / Running 等） */
  status?: string;
  /** 剧集：播出电视台或网络 */
  network?: string;
  /** 电影/剧集：上映或首播日期 */
  released?: string;
  country?: string;
  language?: string;
  /** 导演（电影） */
  directors?: string[];
  /** 主演 */
  cast?: string[];
}

/** 分集条目 */
export interface OverseasEpisode {
  id: string;
  season: number;
  number: number;
  name: string;
  airdate?: string;
  summary?: string;
}

/** 演职员条目 */
export interface OverseasPerson {
  id: string;
  name: string;
  /** 角色名或职务（Actor / Director / Writer 等） */
  roles: string[];
  image?: string;
  country?: string;
  birthday?: string;
  url?: string;
}

/** 详情结构：条目 + 分集 + 演职员 */
export interface OverseasMediaDetail {
  item: OverseasMediaItem;
  episodes?: OverseasEpisode[];
  people?: OverseasPerson[];
  /** 该源原始载荷，便于前端取用未归一化的字段 */
  raw?: unknown;
}

/** 搜索结果：条目 + 各源失败情况 */
export interface OverseasSearchResult {
  list: OverseasMediaItem[];
  failures: { source: string; error: string }[];
}

// ——————————————————————————————————————————————————————————
// 通用工具（纯函数，可独立单测）
// ——————————————————————————————————————————————————————————

/** 归一化评分：接受字符串或数字，非法值返回 undefined */
export function normalizeRating(raw: unknown): string | undefined {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0 || raw > 10) return undefined;
    return raw.toFixed(1);
  }
  if (typeof raw === 'string') {
    // 空字符串（catalog 端点常见）是首要防护点：parseFloat('') 得 NaN
    const num = parseFloat(raw);
    if (!Number.isFinite(num) || num <= 0 || num > 10) return undefined;
    return num.toFixed(1);
  }
  return undefined;
}

/** 把 AniList 的 0-100 分转成 0-10 制字符串 */
export function normalizeAniListScore(score?: number | null): string | undefined {
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) return undefined;
  return (score / 10).toFixed(1);
}

/** 从 "1994" / "2008–2013" / "2024-01-05" 中取起始年份 */
export function extractYear(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const m = raw.match(/(\d{4})/);
  return m ? m[1] : undefined;
}

/** 归一化字符串数组：去空、去重、限长 */
export function normalizeGenres(raw: unknown, limit = 8): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const g of raw) {
    if (typeof g !== 'string') continue;
    const v = g.trim();
    if (!v || out.includes(v)) continue;
    out.push(v);
    if (out.length >= limit) break;
  }
  return out.length ? out : undefined;
}

/** 归一化人名数组 */
export function normalizeNames(raw: unknown, limit = 12): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const n of raw) {
    if (typeof n !== 'string') continue;
    const v = n.trim();
    if (!v || out.includes(v)) continue;
    out.push(v);
    if (out.length >= limit) break;
  }
  return out.length ? out : undefined;
}

/** 去掉 HTML 标签与常见实体，压缩空白 */
export function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 拼装统一 id */
export function makeOverseasId(source: string, sourceId: string): string {
  return `${source}:${sourceId}`;
}

/** 解析统一 id；格式非法返回 null */
export function parseOverseasId(id: string): { source: string; sourceId: string } | null {
  const idx = id.indexOf(':');
  if (idx <= 0 || idx === id.length - 1) return null;
  const source = id.slice(0, idx);
  const sourceId = id.slice(idx + 1);
  if (!/^[a-z]+$/.test(source)) return null;
  if (!sourceId) return null;
  return { source, sourceId };
}

/** 安全取非空字符串 */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

// ——————————————————————————————————————————————————————————
// 数据源一：Cinemeta / Stremio
// ——————————————————————————————————————————————————————————

const CINEMETA_META_BASE = 'https://v3-cinemeta.strem.io/meta';
const CINEMETA_CATALOG_BASE = 'https://v3-cinemeta.strem.io/catalog';

interface CinemetaRaw {
  id?: string;
  imdb_id?: string;
  type?: string;
  name?: string;
  poster?: string;
  background?: string;
  description?: string;
  /** meta 端点：上映信息（可能是年份或年份区间） */
  releaseInfo?: string;
  /** catalog 端点：ISO 格式上映时间 */
  released?: string;
  year?: string | number;
  imdbRating?: string | number;
  /** meta 端点用 genres（复数），catalog 端点用 genre（单数）——两种都要认 */
  genres?: string[];
  genre?: string[];
  runtime?: string;
  director?: string | string[];
  cast?: string[];
  country?: string;
  language?: string;
  releaseDate?: string;
  aired?: string;
  status?: string;
  network?: string;
}

interface CinemetaCatalogResponse {
  metas?: CinemetaRaw[];
}

/** Cinemeta 原始结构 → 统一条目 */
export function cinemetaToItem(raw: CinemetaRaw, type: OverseasMediaType): OverseasMediaItem | undefined {
  const sourceId = str(raw.id) || str(raw.imdb_id);
  const title = str(raw.name);
  if (!sourceId || !title) return undefined;

  // meta 端点给 releaseInfo，catalog 端点给 released，两者取先到者
  const releaseText = str(raw.releaseInfo) || str(raw.released) || str(raw.releaseDate) || str(raw.aired);
  // year 可能是 number（catalog）或 string（meta）
  const year = (typeof raw.year === 'number' ? String(raw.year) : str(raw.year)) || extractYear(releaseText);

  // genres（meta 复数）与 genre（catalog 单数）两种字段名都要认，只认一套会静默丢类型
  const genreList = Array.isArray(raw.genres) ? raw.genres : Array.isArray(raw.genre) ? raw.genre : [];

  return {
    id: makeOverseasId('cinemeta', sourceId),
    source: 'cinemeta',
    sourceId,
    title,
    cover: str(raw.poster),
    backdrop: str(raw.background),
    year,
    rating: normalizeRating(raw.imdbRating),
    genres: normalizeGenres(genreList),
    description: str(raw.description),
    type,
    runtime: str(raw.runtime),
    status: str(raw.status),
    network: str(raw.network),
    released: releaseText,
    country: str(raw.country),
    language: str(raw.language),
    directors: normalizeNames(Array.isArray(raw.director) ? raw.director : raw.director ? [raw.director] : []),
    cast: normalizeNames(raw.cast),
  };
}

/** 拉取 Cinemeta 详情（电影/剧集） */
export async function fetchCinemetaDetail(
  sourceId: string,
  type: OverseasMediaType
): Promise<OverseasMediaDetail | null> {
  // 动漫走 AniList 体系，Cinemeta 的 anime 目录覆盖不全
  if (type === 'anime') return null;

  const cacheKey = `overseas:cinemeta:${type}:${sourceId}`;
  const cached = getCache<OverseasMediaDetail>(cacheKey);
  if (cached) return cached;

  try {
    // safeRedirects 保持默认开启：meta 端点不跳转，但保持与其他请求一致的安全策略
    const res = await fetchUpstream(`${CINEMETA_META_BASE}/${type}/${encodeURIComponent(sourceId)}.json`, {
      timeoutMs: 8000,
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { meta?: CinemetaRaw };
    const raw = data?.meta;
    if (!raw) return null;
    const item = cinemetaToItem(raw, type);
    if (!item) return null;
    const detail: OverseasMediaDetail = { item, raw };
    setCache(cacheKey, detail, DETAIL_CACHE_TTL);
    return detail;
  } catch (err) {
    console.warn('[Overseas] Cinemeta 详情获取异常:', err);
    return null;
  }
}

/** Cinemeta 搜索（走 catalog 的 search 变体） */
export async function searchCinemeta(keyword: string, type: OverseasMediaType): Promise<OverseasMediaItem[]> {
  const kw = keyword.trim();
  if (!kw || type === 'anime') return [];

  const cacheKey = `overseas:cinemeta:search:${type}:${kw.toLowerCase()}`;
  const cached = getCache<OverseasMediaItem[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${CINEMETA_CATALOG_BASE}/${type}/top/search=${encodeURIComponent(kw)}.json`;
    const res = await fetchUpstream(url, {
      timeoutMs: 8000,
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as CinemetaCatalogResponse;
    const metas = Array.isArray(data?.metas) ? data.metas : [];
    const items = metas
      .map((m) => cinemetaToItem(m, type))
      .filter((x): x is OverseasMediaItem => Boolean(x));
    if (items.length) setCache(cacheKey, items, SEARCH_CACHE_TTL);
    return items;
  } catch (err) {
    console.warn('[Overseas] Cinemeta 搜索异常:', err);
    return [];
  }
}

/** Cinemeta 目录浏览（按排序维度取整页榜单） */
export async function fetchCinemetaCatalog(
  type: OverseasMediaType,
  sort: string = 'top'
): Promise<OverseasMediaItem[]> {
  if (type === 'anime') return [];
  // 白名单校验，防止 sort 参与构造上游路径
  const safeSort = /^[a-zA-Z0-9_]{1,20}$/.test(sort) ? sort : 'top';

  const cacheKey = `overseas:cinemeta:catalog:${type}:${safeSort}`;
  const cached = getCache<OverseasMediaItem[]>(cacheKey);
  if (cached) return cached;

  try {
    // 此端点有 307 跳转，依赖 fetchUpstream 默认的 safeRedirects 跟随
    const res = await fetchUpstream(`${CINEMETA_CATALOG_BASE}/${type}/${safeSort}.json`, {
      timeoutMs: 10000,
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as CinemetaCatalogResponse;
    const metas = Array.isArray(data?.metas) ? data.metas : [];
    const items = metas
      .map((m) => cinemetaToItem(m, type))
      .filter((x): x is OverseasMediaItem => Boolean(x));
    if (items.length) setCache(cacheKey, items, CATALOG_CACHE_TTL);
    return items;
  } catch (err) {
    console.warn('[Overseas] Cinemeta 目录获取异常:', err);
    return [];
  }
}

// ——————————————————————————————————————————————————————————
// 数据源二：TVMaze
// ——————————————————————————————————————————————————————————

const TVMAZE_BASE = 'https://api.tvmaze.com';

interface TvmazeShowRaw {
  id?: number;
  name?: string;
  type?: string;
  language?: string;
  genres?: string[];
  status?: string;
  runtime?: number;
  averageRuntime?: number;
  premiered?: string;
  schedule?: { time?: string; days?: string[] };
  rating?: { average?: number };
  network?: { name?: string } | null;
  webChannel?: { name?: string } | null;
  image?: { original?: string; medium?: string };
  summary?: string;
  url?: string;
  externals?: { imdb?: string };
}

interface TvmazeCastEntry {
  person?: {
    id?: number;
    name?: string;
    url?: string;
    country?: { name?: string } | null;
    birthday?: string | null;
    image?: { original?: string; medium?: string } | null;
  };
  character?: { name?: string };
}

interface TvmazeCrewEntry {
  person?: { id?: number; name?: string; url?: string; image?: { original?: string; medium?: string } | null };
  type?: string;
}

interface TvmazeEpisodeRaw {
  id?: number;
  name?: string;
  season?: number;
  number?: number;
  airdate?: string;
  summary?: string | null;
}

/** TVMaze 剧集原始结构 → 统一条目 */
export function tvmazeToItem(raw: TvmazeShowRaw): OverseasMediaItem | undefined {
  // TVMaze 的 show id 从 1 开始，0 与负数均为非法值
  if (typeof raw?.id !== 'number' || !Number.isInteger(raw.id) || raw.id <= 0 || !raw.name) return undefined;
  const network = raw.network?.name || raw.webChannel?.name;
  return {
    id: makeOverseasId('tvmaze', String(raw.id)),
    source: 'tvmaze',
    sourceId: String(raw.id),
    title: raw.name.trim(),
    cover: raw.image?.original || raw.image?.medium,
    backdrop: raw.image?.original,
    year: extractYear(raw.premiered),
    rating: normalizeRating(raw.rating?.average),
    genres: normalizeGenres(raw.genres),
    description: str(raw.summary),
    type: 'series',
    runtime: raw.averageRuntime ? `${raw.averageRuntime} min` : raw.runtime ? `${raw.runtime} min` : undefined,
    status: str(raw.status),
    network: str(network),
    released: str(raw.premiered),
    language: str(raw.language),
  };
}

/** 拉取 TVMaze 剧集详情（含分集与演职员） */
export async function fetchTvmazeDetail(sourceId: string): Promise<OverseasMediaDetail | null> {
  const idNum = Number(sourceId);
  if (!Number.isInteger(idNum) || idNum <= 0) return null;

  const cacheKey = `overseas:tvmaze:${idNum}`;
  const cached = getCache<OverseasMediaDetail>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchUpstream(`${TVMAZE_BASE}/shows/${idNum}`, {
      timeoutMs: 8000,
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as TvmazeShowRaw;
    const item = tvmazeToItem(raw);
    if (!item) return null;

    // 分集与演职员并发取，任一失败仅缺该部分，不影响条目本体
    const [episodes, people] = await Promise.all([
      fetchTvmazeEpisodes(idNum),
      fetchTvmazePeople(idNum),
    ]);

    const detail: OverseasMediaDetail = { item, episodes, people, raw };
    setCache(cacheKey, detail, DETAIL_CACHE_TTL);
    return detail;
  } catch (err) {
    console.warn('[Overseas] TVMaze 详情获取异常:', err);
    return null;
  }
}

/** 拉取 TVMaze 分集清单 */
export async function fetchTvmazeEpisodes(showId: number): Promise<OverseasEpisode[]> {
  if (!Number.isInteger(showId) || showId <= 0) return [];

  const cacheKey = `overseas:tvmaze:episodes:${showId}`;
  const cached = getCache<OverseasEpisode[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchUpstream(`${TVMAZE_BASE}/shows/${showId}/episodes`, {
      timeoutMs: 10000,
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!res.ok) return [];
    const raw = (await res.json()) as TvmazeEpisodeRaw[];
    if (!Array.isArray(raw)) return [];
    const episodes = raw
      .filter((e) => typeof e?.id === 'number')
      .map((e) => ({
        id: `tvmaze:ep:${e.id}`,
        season: typeof e.season === 'number' ? e.season : 0,
        number: typeof e.number === 'number' ? e.number : 0,
        name: str(e.name) || `第 ${e.season ?? 0} 季 第 ${e.number ?? 0} 集`,
        airdate: str(e.airdate),
        summary: str(e.summary),
      }));
    if (episodes.length) setCache(cacheKey, episodes, DETAIL_CACHE_TTL);
    return episodes;
  } catch (err) {
    console.warn('[Overseas] TVMaze 分集获取异常:', err);
    return [];
  }
}

/** 拉取 TVMaze 演职员（cast + crew） */
export async function fetchTvmazePeople(showId: number): Promise<OverseasPerson[]> {
  if (!Number.isInteger(showId) || showId <= 0) return [];

  const cacheKey = `overseas:tvmaze:people:${showId}`;
  const cached = getCache<OverseasPerson[]>(cacheKey);
  if (cached) return cached;

  try {
    const [castRes, crewRes] = await Promise.all([
      fetchUpstream(`${TVMAZE_BASE}/shows/${showId}/cast`, {
        timeoutMs: 10000,
        headers: { Accept: 'application/json', 'User-Agent': UA },
      }),
      fetchUpstream(`${TVMAZE_BASE}/shows/${showId}/crew`, {
        timeoutMs: 10000,
        headers: { Accept: 'application/json', 'User-Agent': UA },
      }),
    ]);

    const people: OverseasPerson[] = [];

    if (castRes.ok) {
      const cast = (await castRes.json()) as TvmazeCastEntry[];
      if (Array.isArray(cast)) {
        for (const entry of cast) {
          const p = entry?.person;
          if (!p?.id || !p.name) continue;
          people.push({
            id: makeOverseasId('tvmaze', String(p.id)),
            name: p.name.trim(),
            roles: entry.character?.name ? [entry.character.name.trim()] : ['Actor'],
            image: p.image?.original || p.image?.medium,
            country: p.country?.name,
            birthday: p.birthday || undefined,
            url: p.url,
          });
        }
      }
    }

    if (crewRes.ok) {
      const crew = (await crewRes.json()) as TvmazeCrewEntry[];
      if (Array.isArray(crew)) {
        for (const entry of crew) {
          const p = entry?.person;
          if (!p?.id || !p.name) continue;
          people.push({
            id: makeOverseasId('tvmaze', String(p.id)),
            name: p.name.trim(),
            roles: [str(entry.type) || 'Crew'],
            image: p.image?.original || p.image?.medium,
            url: p.url,
          });
        }
      }
    }

    // 同一人可能同时出现在 cast 与 crew，按「姓名+角色」去重
    const seen = new Set<string>();
    const deduped = people.filter((p) => {
      const key = `${p.name.toLowerCase()}|${p.roles[0]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length) setCache(cacheKey, deduped, DETAIL_CACHE_TTL);
    return deduped;
  } catch (err) {
    console.warn('[Overseas] TVMaze 演职员获取异常:', err);
    return [];
  }
}

/** TVMaze 搜索剧集 */
export async function searchTvmaze(keyword: string): Promise<OverseasMediaItem[]> {
  const kw = keyword.trim();
  if (!kw) return [];

  const cacheKey = `overseas:tvmaze:search:${kw.toLowerCase()}`;
  const cached = getCache<OverseasMediaItem[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchUpstream(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(kw)}`, {
      timeoutMs: 8000,
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!res.ok) return [];
    const raw = (await res.json()) as Array<{ show?: TvmazeShowRaw }>;
    if (!Array.isArray(raw)) return [];
    const items = raw
      .map((r) => (r?.show ? tvmazeToItem(r.show) : undefined))
      .filter((x): x is OverseasMediaItem => Boolean(x));
    if (items.length) setCache(cacheKey, items, SEARCH_CACHE_TTL);
    return items;
  } catch (err) {
    console.warn('[Overseas] TVMaze 搜索异常:', err);
    return [];
  }
}

/** TVMaze 人物详情（含参演作品集） */
export async function fetchTvmazePerson(sourceId: string): Promise<{
  person: OverseasPerson;
  credits: OverseasMediaItem[];
} | null> {
  const idNum = Number(sourceId);
  if (!Number.isInteger(idNum) || idNum <= 0) return null;

  const cacheKey = `overseas:tvmaze:person:${idNum}`;
  const cached = getCache<{ person: OverseasPerson; credits: OverseasMediaItem[] }>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchUpstream(`${TVMAZE_BASE}/people/${idNum}`, {
      timeoutMs: 8000,
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as {
      id?: number;
      name?: string;
      url?: string;
      birthday?: string | null;
      country?: { name?: string } | null;
      image?: { original?: string; medium?: string } | null;
    };
    if (typeof raw?.id !== 'number' || !raw.name) return null;

    const person: OverseasPerson = {
      id: makeOverseasId('tvmaze', String(raw.id)),
      name: raw.name.trim(),
      roles: [],
      image: raw.image?.original || raw.image?.medium,
      country: raw.country?.name,
      birthday: raw.birthday || undefined,
      url: raw.url,
    };

    // 参演剧集：castcredits + crewcredits（结果包在 _embedded.show 中）
    const credits: OverseasMediaItem[] = [];
    try {
      const [castRes, crewRes] = await Promise.all([
        fetchUpstream(`${TVMAZE_BASE}/people/${idNum}/castcredits?embed=show`, {
          timeoutMs: 8000,
          headers: { Accept: 'application/json', 'User-Agent': UA },
        }),
        fetchUpstream(`${TVMAZE_BASE}/people/${idNum}/crewcredits?embed=show`, {
          timeoutMs: 8000,
          headers: { Accept: 'application/json', 'User-Agent': UA },
        }),
      ]);

      // 必须 await 完 JSON 解析再返回：fire-and-forget 会让 credits 在返回时仍为空数组
      const collect = async (res: Response): Promise<void> => {
        if (!res.ok) return;
        const arr = (await res.json()) as Array<{ _embedded?: { show?: TvmazeShowRaw } }>;
        if (!Array.isArray(arr)) return;
        for (const entry of arr) {
          const show = entry?._embedded?.show;
          const item = show ? tvmazeToItem(show) : undefined;
          if (item) credits.push(item);
        }
      };
      await Promise.all([collect(castRes), collect(crewRes)]);
    } catch {
      // 作品列表失败不影响人物本体
    }

    const result = { person, credits };
    setCache(cacheKey, result, DETAIL_CACHE_TTL);
    return result;
  } catch (err) {
    console.warn('[Overseas] TVMaze 人物获取异常:', err);
    return null;
  }
}

// ——————————————————————————————————————————————————————————
// 数据源三：AniList（GraphQL，动漫）
// ——————————————————————————————————————————————————————————

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

interface AniListMedia {
  id?: number;
  title?: { romaji?: string | null; english?: string | null; native?: string | null };
  description?: string | null;
  coverImage?: { large?: string | null; medium?: string | null } | null;
  bannerImage?: string | null;
  averageScore?: number | null;
  genres?: string[] | null;
  status?: string | null;
  startDate?: { year?: number | null } | null;
  duration?: number | null;
  countryOfOrigin?: string | null;
  staff?: {
    edges?: Array<{
      role?: string | null;
      node?: { id?: number; name?: { full?: string | null } | null; image?: { large?: string | null } | null };
    }>;
  };
  characters?: {
    edges?: Array<{
      role?: string | null;
      node?: { id?: number; name?: { full?: string | null } | null; image?: { large?: string | null } | null };
    }>;
  };
}

/** AniList 媒体条目 → 统一条目 */
export function anilistToItem(raw: AniListMedia): OverseasMediaItem | undefined {
  if (typeof raw?.id !== 'number') return undefined;
  const title = str(raw.title?.english) || str(raw.title?.romaji) || str(raw.title?.native);
  if (!title) return undefined;

  return {
    id: makeOverseasId('anilist', String(raw.id)),
    source: 'anilist',
    sourceId: String(raw.id),
    title,
    originalTitle: str(raw.title?.romaji) || str(raw.title?.native),
    cover: str(raw.coverImage?.large) || str(raw.coverImage?.medium),
    backdrop: str(raw.bannerImage),
    year: raw.startDate?.year ? String(raw.startDate.year) : undefined,
    rating: normalizeAniListScore(raw.averageScore),
    genres: normalizeGenres(raw.genres),
    description: raw.description ? stripHtml(raw.description) : undefined,
    type: 'anime',
    runtime: raw.duration ? `${raw.duration} min` : undefined,
    status: str(raw.status),
    released: raw.startDate?.year ? String(raw.startDate.year) : undefined,
    country: str(raw.countryOfOrigin),
    language: 'Japanese',
  };
}

const ANILIST_MEDIA_FIELDS = `
  id
  title { romaji english native }
  description(asHtml: false)
  coverImage { large medium }
  bannerImage
  averageScore
  genres
  status
  startDate { year }
  duration
  countryOfOrigin
`;

/** AniList GraphQL 请求（必须 POST，GET 一律 404） */
async function anilistQuery(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const res = await fetchUpstream(ANILIST_ENDPOINT, {
    method: 'POST',
    timeoutMs: 10000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AniList 上游请求失败: ${res.status}`);
  const data = (await res.json()) as { data?: unknown; errors?: Array<{ message?: string }> };
  if (data?.errors?.length) {
    throw new Error(data.errors[0]?.message || 'AniList 查询出错');
  }
  return data?.data;
}

/** AniList 搜索（动漫） */
export async function searchAniList(keyword: string): Promise<OverseasMediaItem[]> {
  const kw = keyword.trim();
  if (!kw) return [];

  const cacheKey = `overseas:anilist:search:${kw.toLowerCase()}`;
  const cached = getCache<OverseasMediaItem[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = (await anilistQuery(
      `query ($search: String, $page: Int) {
        Page(page: $page, perPage: 30) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${ANILIST_MEDIA_FIELDS} }
        }
      }`,
      { search: kw, page: 1 }
    )) as { Page?: { media?: AniListMedia[] } } | undefined;

    const list = data?.Page?.media;
    if (!Array.isArray(list)) return [];
    const items = list
      .map((m) => anilistToItem(m))
      .filter((x): x is OverseasMediaItem => Boolean(x));
    if (items.length) setCache(cacheKey, items, SEARCH_CACHE_TTL);
    return items;
  } catch (err) {
    console.warn('[Overseas] AniList 搜索异常:', err);
    return [];
  }
}

/** AniList 动漫详情 */
export async function fetchAniListDetail(sourceId: string): Promise<OverseasMediaDetail | null> {
  const idNum = Number(sourceId);
  if (!Number.isInteger(idNum) || idNum <= 0) return null;

  const cacheKey = `overseas:anilist:${idNum}`;
  const cached = getCache<OverseasMediaDetail>(cacheKey);
  if (cached) return cached;

  try {
    const data = (await anilistQuery(
      `query ($id: Int) {
        Media(id: $id, type: ANIME) {
          ${ANILIST_MEDIA_FIELDS}
          staff(perPage: 12) { edges { role node { id name { full } image { large } } } }
          characters(perPage: 12, sort: ROLE) { edges { role node { id name { full } image { large } } } }
        }
      }`,
      { id: idNum }
    )) as { Media?: AniListMedia } | undefined;

    const raw = data?.Media;
    if (!raw) return null;
    const item = anilistToItem(raw);
    if (!item) return null;

    const people: OverseasPerson[] = [];
    for (const edge of raw.characters?.edges || []) {
      const node = edge?.node;
      if (!node?.id || !node.name?.full) continue;
      people.push({
        id: makeOverseasId('anilist', String(node.id)),
        name: node.name.full.trim(),
        roles: [str(edge.role) || 'Character'],
        image: str(node.image?.large),
      });
    }
    for (const edge of raw.staff?.edges || []) {
      const node = edge?.node;
      if (!node?.id || !node.name?.full) continue;
      people.push({
        id: makeOverseasId('anilist', String(node.id)),
        name: node.name.full.trim(),
        roles: [str(edge.role) || 'Staff'],
        image: str(node.image?.large),
      });
    }

    const detail: OverseasMediaDetail = { item, people, raw };
    setCache(cacheKey, detail, DETAIL_CACHE_TTL);
    return detail;
  } catch (err) {
    console.warn('[Overseas] AniList 详情获取异常:', err);
    return null;
  }
}

// ——————————————————————————————————————————————————————————
// 聚合层：跨源搜索与详情
// ——————————————————————————————————————————————————————————

/**
 * 跨源搜索：按类型决定参与的源。
 * - movie / series：Cinemeta（主，元数据最全）+ TVMaze（剧集补充）
 * - anime：AniList（主）+ TVMaze（补充）
 *
 * 任一源失败仅记录到 failures，不影响其余源结果。
 */
export async function searchOverseas(
  keyword: string,
  type: OverseasMediaType = 'movie'
): Promise<OverseasSearchResult> {
  const kw = keyword.trim();
  if (!kw) return { list: [], failures: [] };

  const tasks: Array<{ source: string; run: () => Promise<OverseasMediaItem[]> }> =
    type === 'anime'
      ? [
          { source: 'anilist', run: () => searchAniList(kw) },
          { source: 'tvmaze', run: () => searchTvmaze(kw) },
        ]
      : [
          { source: 'cinemeta', run: () => searchCinemeta(kw, type) },
          { source: 'tvmaze', run: () => searchTvmaze(kw) },
        ];

  const failures: OverseasSearchResult['failures'] = [];
  const settled = await Promise.all(
    tasks.map(async (t) => {
      try {
        return await t.run();
      } catch (err) {
        failures.push({
          source: t.source,
          error: err instanceof Error ? err.message : String(err),
        });
        return [] as OverseasMediaItem[];
      }
    })
  );

  // 按 id 去重（跨源同一作品），保留先出现的（Cinemeta/AniList 元数据更全）
  const seen = new Set<string>();
  const list: OverseasMediaItem[] = [];
  for (const group of settled) {
    for (const item of group) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      list.push(item);
    }
  }

  // 有评分的排前面
  list.sort((a, b) => {
    const ar = a.rating ? parseFloat(a.rating) : 0;
    const br = b.rating ? parseFloat(b.rating) : 0;
    if (ar !== br) return br - ar;
    return (b.year || '').localeCompare(a.year || '');
  });

  return { list, failures };
}

/** 跨源详情：按 id 前缀路由到对应源 */
export async function fetchOverseasDetail(id: string): Promise<OverseasMediaDetail | null> {
  const parsed = parseOverseasId(id);
  if (!parsed) return null;

  if (parsed.source === 'cinemeta') {
    // IMDb id 不区分电影与剧集，需并发探测双路径取先命中者，避免串行多一次往返
    const [movie, series] = await Promise.all([
      fetchCinemetaDetail(parsed.sourceId, 'movie'),
      fetchCinemetaDetail(parsed.sourceId, 'series'),
    ]);
    return movie || series;
  }
  if (parsed.source === 'tvmaze') return fetchTvmazeDetail(parsed.sourceId);
  if (parsed.source === 'anilist') return fetchAniListDetail(parsed.sourceId);
  return null;
}
