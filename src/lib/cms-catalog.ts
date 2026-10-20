import type { DoubanItem } from './types';
import { cmsRequestHeaders, isAdultContent } from './cms-parser';
import { fetchUpstream, getCache, setCache } from './fetch-utils';
import { checkUpstreamAllowed } from './ssrf';
import { isShortDramaTitle } from './short-drama';

const CLASS_CACHE_TTL = 12 * 60 * 60 * 1000; // 分类树缓存 12 小时
const CATALOG_CACHE_TTL = 3 * 60 * 1000; // 采集站片库数据缓存 3 分钟

export interface CmsClassItem {
  type_id: number;
  type_name: string;
  type_pid?: number;
}

export interface CmsCatalogOptions {
  url: string;
  type: 'movie' | 'tv' | 'anime' | 'variety' | 'short_drama' | 'documentary' | 'all' | string;
  page?: number;
  pageSize?: number;
  sourceKey?: string;
  filterAdult?: boolean;
}

export interface CmsCatalogResult {
  items: DoubanItem[];
  total: number;
  pagecount: number;
  page: number;
  pageSize: number;
}

/**
 * 从源站获取分类树结构（带 12 小时缓存）
 */
export async function fetchCmsClasses(sourceUrl: string): Promise<CmsClassItem[]> {
  const cleanUrl = sourceUrl.replace(/\/+$/, '');
  const cacheKey = `cms_class:${cleanUrl}`;
  const cached = getCache<CmsClassItem[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const listApi = `${cleanUrl}?ac=list`;
    const res = await fetchUpstream(listApi, {
      timeoutMs: 6000,
      headers: cmsRequestHeaders(),
    });
    if (res.ok) {
      const data = (await res.json()) as { class?: CmsClassItem[] };
      if (Array.isArray(data.class) && data.class.length > 0) {
        setCache(cacheKey, data.class, CLASS_CACHE_TTL);
        return data.class;
      }
    }
  } catch (err) {
    console.warn(`[CmsCatalog] 获取分类列表失败 (${cleanUrl}):`, err);
  }

  return [];
}

/**
 * 根据频道分类（电影/电视剧/动漫/综艺/短剧/纪录片）智能解析对应的 CMS type_id
 */
export function resolveCmsTypeId(
  type: string,
  classes: CmsClassItem[]
): number | undefined {
  if (type === 'all') return undefined;

  // 1. 短剧频道匹配（微短剧/短剧/爽文）
  if (type === 'short_drama' || type === 'ai') {
    const found = classes.find((c) => /短剧|微短剧|爽文/.test(c.type_name));
    if (found) return found.type_id;
    // 常见 CMS 短剧固定分类 ID 备选
    const candidateIds = [36, 58, 45, 23];
    const cand = classes.find((c) => candidateIds.includes(Number(c.type_id)));
    return cand ? cand.type_id : 36;
  }

  // 2. 电视剧/剧集匹配
  if (type === 'tv') {
    const found = classes.find(
      (c) =>
        (c.type_name === '连续剧' || c.type_name === '电视剧' || c.type_name === '剧集') &&
        (!c.type_pid || c.type_pid === 0)
    );
    if (found) return found.type_id;
    const loose = classes.find((c) => /连续剧|电视剧|国产剧|韩剧|美剧/.test(c.type_name));
    return loose ? loose.type_id : 2;
  }

  // 3. 电影匹配
  if (type === 'movie') {
    const found = classes.find(
      (c) =>
        (c.type_name === '电影' || c.type_name === '院线' || c.type_name === '电影片') &&
        (!c.type_pid || c.type_pid === 0)
    );
    if (found) return found.type_id;
    const loose = classes.find((c) => /电影|动作片|喜剧片|爱情片|科幻片/.test(c.type_name));
    return loose ? loose.type_id : 1;
  }

  // 4. 动漫匹配
  if (type === 'anime') {
    const found = classes.find((c) => /动漫|动画/.test(c.type_name));
    return found ? found.type_id : 4;
  }

  // 5. 综艺匹配
  if (type === 'variety') {
    const found = classes.find((c) => /综艺|娱乐|脱口秀/.test(c.type_name));
    return found ? found.type_id : 3;
  }

  // 6. 纪录片匹配
  if (type === 'documentary') {
    const found = classes.find((c) => /纪录片|纪录/.test(c.type_name));
    return found ? found.type_id : 1;
  }

  return undefined;
}

/**
 * 采集站原生全量分类片库查询（支持 500+ 页真分页、高可用、成人内容与短剧精准过滤）
 */
export async function fetchCmsCatalog(options: CmsCatalogOptions): Promise<CmsCatalogResult> {
  const { url, type, page = 1, pageSize = 24, sourceKey, filterAdult = true } = options;
  const cleanUrl = (url || '').trim().replace(/\/+$/, '');

  if (!cleanUrl || !/^https?:\/\//.test(cleanUrl)) {
    return { items: [], total: 0, pagecount: 0, page, pageSize };
  }

  // 安全审计：SSRF 检测
  const verdict = await checkUpstreamAllowed(cleanUrl);
  if (!verdict.ok) {
    throw new Error(verdict.reason || '源地址不被允许访问');
  }

  const cacheKey = `cms_catalog:${cleanUrl}:${type}:${page}:${pageSize}:${filterAdult ? 1 : 0}`;
  const cached = getCache<CmsCatalogResult>(cacheKey);
  if (cached) return cached;

  // 1. 获取源站分类并匹配目标 type_id
  const classes = await fetchCmsClasses(cleanUrl);
  const targetTypeId = resolveCmsTypeId(type, classes);

  // 2. 请求 ?ac=videolist
  const params = new URLSearchParams({
    ac: 'videolist',
    pg: String(Math.max(1, page)),
    pagesize: String(pageSize),
  });
  if (targetTypeId !== undefined) {
    params.set('t', String(targetTypeId));
  }

  const res = await fetchUpstream(`${cleanUrl}?${params.toString()}`, {
    timeoutMs: 8000,
    headers: cmsRequestHeaders(),
  });

  if (!res.ok) {
    throw new Error(`上游源响应异常 (HTTP ${res.status})`);
  }

  const data = (await res.json()) as {
    page?: number | string;
    pagecount?: number | string;
    total?: number | string;
    limit?: number | string;
    list?: Array<{
      vod_id?: number | string;
      vod_name?: string;
      vod_pic?: string;
      vod_remarks?: string;
      type_name?: string;
      vod_year?: string;
      vod_area?: string;
      vod_time?: string;
    }>;
  };

  const rawList = Array.isArray(data.list) ? data.list : [];
  const rawPageCount = parseInt(String(data.pagecount || '1'), 10);
  const rawTotal = parseInt(String(data.total || '0'), 10);
  const pagecount = Number.isFinite(rawPageCount) && rawPageCount > 0 ? rawPageCount : 1;
  const total = Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : rawList.length;

  // 3. 成人与短剧严格隔离过滤（先对原始 vod 实体执行精准类型过滤）
  let filteredList = rawList;
  if (filterAdult) {
    filteredList = filteredList.filter(
      (v) => !isAdultContent(v.type_name) && !isAdultContent(v.vod_name)
    );
  }

  if (type !== 'short_drama' && type !== 'ai') {
    filteredList = filteredList.filter(
      (v) =>
        !isShortDramaTitle(v.vod_name || '') &&
        !/短剧|微短剧|爽文/.test(v.type_name || '')
    );
  }

  // 4. 映射为 DoubanItem
  const mappedItems: DoubanItem[] = filteredList
    .map((vod): DoubanItem | undefined => {
      const title = (vod.vod_name || '').trim();
      let cover = (vod.vod_pic || '').trim();
      if (!title || !cover) return undefined;

      if (cover.startsWith('http://')) {
        cover = cover.replace('http://', 'https://');
      }

      const remarks = (vod.vod_remarks || '').trim();
      const typeName = (vod.type_name || '').trim();
      const year = (vod.vod_year || '').trim();

      // 评分标/角标显示状态：优先更新集数（如 更新至28集），其次分类或年份
      let ratingBadge: string | undefined = undefined;
      if (remarks) {
        ratingBadge = remarks.length <= 10 ? remarks : remarks.slice(0, 10);
      } else if (typeName) {
        ratingBadge = typeName;
      } else if (year) {
        ratingBadge = year;
      }

      return {
        id: `cms_${sourceKey || 'vod'}_${vod.vod_id || Math.random().toString(36).slice(2)}`,
        title,
        cover,
        rating: ratingBadge,
        isTv: type === 'tv' || type === 'anime' || type === 'short_drama' || type === 'ai',
      };
    })
    .filter((x): x is DoubanItem => Boolean(x));

  const result: CmsCatalogResult = {
    items: mappedItems,
    total,
    pagecount,
    page,
    pageSize,
  };

  setCache(cacheKey, result, CATALOG_CACHE_TTL);
  return result;
}
