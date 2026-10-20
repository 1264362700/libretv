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
  keyword?: string; // 分类内深度搜索关键词
  sort?: 'recommend' | 'time' | 'rank' | string; // 排序模式：recommend(热门推荐) | time(最新上映) | rank(豆瓣高分)
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

  // 1. 短剧频道匹配（微短剧/短剧/爽文，内置天涯54、标准36/58等典型短剧分类）
  if (type === 'short_drama') {
    const found = classes.find((c) => /短剧|微短剧|爽文/.test(c.type_name));
    if (found) return found.type_id;
    // 常见 CMS 短剧固定分类 ID 备选（54 为天涯影视等 MacCMS 标准，36/58/45 为常见源）
    const candidateIds = [54, 36, 58, 45, 23];
    const cand = classes.find((c) => candidateIds.includes(Number(c.type_id)));
    return cand ? cand.type_id : 54;
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
  if (type === 'all') return [];

  if (!Array.isArray(classes) || classes.length === 0) return [];

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
  const { url, type, typeId, keyword, sort = 'recommend', page = 1, pageSize = 24, sourceKey, filterAdult = true } = options;
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

  const cacheKey = `cms_catalog:${cleanUrl}:${type}:${targetTypeId ?? 'all'}:${keyword || ''}:${typeId || ''}:${sort}:${page}:${pageSize}:${filterAdult ? 1 : 0}`;
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
  }
  if (keyword && keyword.trim()) {
    params.set('wd', keyword.trim().slice(0, 100));
  }
  if (sort === 'time') {
    params.set('by', 'time');
  } else if (sort === 'rank') {
    params.set('by', 'score');
  } else if (sort === 'recommend') {
    params.set('by', 'hits');
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
  let pagecount = Number.isFinite(rawPageCount) && rawPageCount > 0 ? rawPageCount : 1;
  let total = Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : rawList.length;

  // 3. 成人与短剧严格隔离过滤（先对原始 vod 实体执行精准类型过滤）
  let filteredList = rawList;
  if (filterAdult) {
    filteredList = filteredList.filter(
      (v) => !isAdultContent(v.type_name) && !isAdultContent(v.vod_name)
    );
  }

  if (type !== 'short_drama') {
    filteredList = filteredList.filter(
      (v) =>
        !isShortDramaTitle(v.vod_name || '') &&
        !/短剧|微短剧|爽文/.test(v.type_name || '')
    );
  }

  // 4. 苹果 CMS 虚父分类智能下钻自愈：
  // 若未指定特定二级子类，且当前父级直属返回的数据极少（<= 1 条，如电影/电视剧仅为目录节点），
  // 但源站存在该频道的细分子分类（subCategories.length > 0），自动下钻至首个有效子分类（如动作片、内地剧）重新获取
  if (typeId === undefined && filteredList.length <= 1 && subCategories.length > 0) {
    const fallbackSubId = subCategories[0].id;
    const fallbackParams = new URLSearchParams({
      ac: 'videolist',
      pg: String(Math.max(1, page)),
      pagesize: String(pageSize),
      t: String(fallbackSubId),
    });
    if (keyword && keyword.trim()) {
      fallbackParams.set('wd', keyword.trim().slice(0, 100));
    }
    if (sort === 'time') {
      fallbackParams.set('by', 'time');
    } else if (sort === 'rank') {
      fallbackParams.set('by', 'score');
    } else if (sort === 'recommend') {
      fallbackParams.set('by', 'hits');
    }

    try {
      const fallbackRes = await fetchUpstream(`${cleanUrl}?${fallbackParams.toString()}`, {
        timeoutMs: 6000,
        headers: cmsRequestHeaders(),
      });
      if (fallbackRes.ok) {
        const fbData = (await fallbackRes.json()) as typeof data;
        const fbRawList = Array.isArray(fbData.list) ? fbData.list : [];
        if (fbRawList.length > 0) {
          let fbFiltered = fbRawList;
          if (filterAdult) {
            fbFiltered = fbFiltered.filter(
              (v) => !isAdultContent(v.type_name) && !isAdultContent(v.vod_name)
            );
          }
          if (type !== 'short_drama') {
            fbFiltered = fbFiltered.filter(
              (v) =>
                !isShortDramaTitle(v.vod_name || '') &&
                !/短剧|微短剧|爽文/.test(v.type_name || '')
            );
          }
          if (fbFiltered.length > 0) {
            filteredList = fbFiltered;
            total = Number(fbData.total) || fbFiltered.length;
            pagecount = Number(fbData.pagecount) || 1;
          }
        }
      }
    } catch (e) {
      console.warn(`[CmsCatalog] 虚父分类自动下钻重试异常 (t=${fallbackSubId}):`, e);
    }
  }

  // 5. 排序规则归一化生效（解决上游采集源忽略 by 参数或乱序问题）
  if (sort === 'time') {
    // 最新上映 / 最新更新：优先按 vod_time 倒序，其次按年份 vod_year 倒序，再次按 vod_id 倒序
    filteredList = [...filteredList].sort((a, b) => {
      const timeA = a.vod_time ? Date.parse(a.vod_time.replace(/-/g, '/')) || 0 : 0;
      const timeB = b.vod_time ? Date.parse(b.vod_time.replace(/-/g, '/')) || 0 : 0;
      if (timeA !== timeB) return timeB - timeA;
      const yearA = parseInt(String(a.vod_year || '0'), 10) || 0;
      const yearB = parseInt(String(b.vod_year || '0'), 10) || 0;
      if (yearA !== yearB) return yearB - yearA;
      return Number(b.vod_id || 0) - Number(a.vod_id || 0);
    });
  } else if (sort === 'rank') {
    // 豆瓣高分：优先按评分倒序，其次按年份倒序，再次按更新时间倒序
    filteredList = [...filteredList].sort((a, b) => {
      const scoreA =
        parseFloat(
          String(
            (a as Record<string, unknown>).vod_score ||
              (a as Record<string, unknown>).vod_douban_score ||
              (a as Record<string, unknown>).rate ||
              0
          )
        ) || 0;
      const scoreB =
        parseFloat(
          String(
            (b as Record<string, unknown>).vod_score ||
              (b as Record<string, unknown>).vod_douban_score ||
              (b as Record<string, unknown>).rate ||
              0
          )
        ) || 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      const yearA = parseInt(String(a.vod_year || '0'), 10) || 0;
      const yearB = parseInt(String(b.vod_year || '0'), 10) || 0;
      if (yearA !== yearB) return yearB - yearA;
      const timeA = a.vod_time ? Date.parse(a.vod_time.replace(/-/g, '/')) || 0 : 0;
      const timeB = b.vod_time ? Date.parse(b.vod_time.replace(/-/g, '/')) || 0 : 0;
      return timeB - timeA;
    });
  }

  // 6. 映射为 DoubanItem
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

      // 评分标/角标显示状态：若选高分排序且有评分数值，优先透出 ★评分；否则优先更新集数，其次分类或年份
      let ratingBadge: string | undefined = undefined;
      const rawScore =
        (vod as Record<string, unknown>).vod_score || (vod as Record<string, unknown>).vod_douban_score;
      if (sort === 'rank' && rawScore && Number(rawScore) > 0) {
        ratingBadge = `★${Number(rawScore).toFixed(1)}`;
      } else if (remarks) {
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
        isTv: type === 'tv' || type === 'anime' || type === 'short_drama',
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
