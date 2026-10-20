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

export interface CmsSubCategory {
  id: number;
  name: string;
}

export interface CmsCatalogOptions {
  url: string;
  type: 'movie' | 'tv' | 'anime' | 'variety' | 'short_drama' | 'documentary' | 'all' | string;
  typeId?: number; // 用户选中的具体二级子分类 ID
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
  subCategories?: CmsSubCategory[];
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

  // 1. AI 专区匹配（AI短剧 / AIGC / 科幻脑洞）
  if (type === 'ai') {
    const aiFound = classes.find((c) => /ai|人工智能|aigc|脑洞/.test(c.type_name.toLowerCase()));
    if (aiFound) return aiFound.type_id;
    const scifi = classes.find((c) => /科幻/.test(c.type_name));
    if (scifi) return scifi.type_id;
    return undefined;
  }

  // 2. 短剧频道匹配（微短剧/短剧/爽文）
  if (type === 'short_drama') {
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
 * 从源站分类树中智能抽取当前频道的二级细分子类
 */
export function extractSubCategories(
  type: string,
  classes: CmsClassItem[]
): CmsSubCategory[] {
  if (type === 'all' || !Array.isArray(classes) || classes.length === 0) return [];

  const parentId = resolveCmsTypeId(type, classes);
  const cleanClasses = classes.filter((c) => !isAdultContent(c.type_name));

  // 1. 优先按 type_pid 父级关联寻找子分类
  if (parentId !== undefined) {
    const directChildren = cleanClasses
      .filter((c) => Number(c.type_pid) === Number(parentId) && Number(c.type_id) !== Number(parentId))
      .map((c) => ({ id: Number(c.type_id), name: c.type_name.trim() }));

    if (directChildren.length > 0) {
      return directChildren;
    }
  }

  // 2. 若源站未正确设置 type_pid（设为 0 或缺失），基于频道语义进行智能识别归集
  let matcher: RegExp | null = null;
  if (type === 'tv') {
    matcher = /国产剧|华语剧|欧美剧|美剧|韩剧|韩国剧|日剧|日本剧|港剧|香港剧|台剧|台湾剧|泰剧|海外剧/;
  } else if (type === 'movie') {
    matcher = /动作片|喜剧片|爱情片|科幻片|恐怖片|剧情片|战争片|惊悚片|悬疑片|犯罪片|奇幻片|动画电影|纪录片/;
  } else if (type === 'anime') {
    matcher = /国产动漫|国漫|日韩动漫|日本动漫|欧美动漫|港台动漫|海外动漫/;
  } else if (type === 'variety') {
    matcher = /大陆综艺|内地综艺|港台综艺|日韩综艺|欧美综艺|真人秀|脱口秀/;
  } else if (type === 'ai') {
    matcher = /ai|人工智能|科幻|脑洞|未来|数字人|元宇宙/;
  } else if (type === 'short_drama') {
    matcher = /短剧|微短剧|爽文|现代都市|古代言情|玄幻武侠|重生逆袭/;
  }

  if (matcher) {
    const matched = cleanClasses
      .filter((c) => matcher.test(c.type_name) && Number(c.type_id) !== Number(parentId))
      .map((c) => ({ id: Number(c.type_id), name: c.type_name.trim() }));
    if (matched.length > 0) {
      return matched;
    }
  }

  return [];
}

/**
 * 采集站原生全量分类片库查询（支持 500+ 页真分页、高可用、二级细分子类下钻与敏感过滤）
 */
export async function fetchCmsCatalog(options: CmsCatalogOptions): Promise<CmsCatalogResult> {
  const { url, type, typeId, page = 1, pageSize = 24, sourceKey, filterAdult = true } = options;
  const cleanUrl = (url || '').trim().replace(/\/+$/, '');

  if (!cleanUrl || !/^https?:\/\//.test(cleanUrl)) {
    return { items: [], total: 0, pagecount: 0, page, pageSize, subCategories: [] };
  }

  // 安全审计：SSRF 检测
  const verdict = await checkUpstreamAllowed(cleanUrl);
  if (!verdict.ok) {
    throw new Error(verdict.reason || '源地址不被允许访问');
  }

  // 1. 获取源站分类并匹配目标 type_id 与二级细分子分类
  const classes = await fetchCmsClasses(cleanUrl);
  const subCategories = extractSubCategories(type, classes);
  const targetTypeId = typeId !== undefined ? typeId : resolveCmsTypeId(type, classes);

  const cacheKey = `cms_catalog:${cleanUrl}:${type}:${targetTypeId ?? 'all'}:${page}:${pageSize}:${filterAdult ? 1 : 0}`;
  const cached = getCache<CmsCatalogResult>(cacheKey);
  if (cached) return cached;

  // 2. 请求 ?ac=videolist
  const params = new URLSearchParams({
    ac: 'videolist',
    pg: String(Math.max(1, page)),
    pagesize: String(pageSize),
  });
  if (targetTypeId !== undefined) {
    params.set('t', String(targetTypeId));
  } else if (type === 'ai') {
    params.set('wd', 'AI');
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
    subCategories,
  };

  setCache(cacheKey, result, CATALOG_CACHE_TTL);
  return result;
}
