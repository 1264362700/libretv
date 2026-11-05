import type { SearchResultItem, VideoDetail } from './types';

/**
 * Apple CMS（苹果CMS）资源站响应解析
 * 与旧版 js/api.js 逻辑对齐，迁移为纯函数以便单元测试。
 */

const M3U8_PATTERN = /\$https?:\/\/[^"'\s]+?\.m3u8/g;

const UA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

export function cmsRequestHeaders(): Record<string, string> {
  return { ...UA_HEADERS };
}

/** 搜索响应 → 统一结果列表（兼容 Apple CMS / 苹果 CMS VOD 常见响应变体） */
export function parseSearchList(
  data: unknown,
  source: { key: string; name: string; url: string; isAdult?: boolean }
): SearchResultItem[] {
  if (!data || typeof data !== 'object') throw new Error('API返回的数据格式无效');
  const d = data as { list?: unknown; data?: unknown };
  const rawList = d.list !== undefined ? d.list : d.data;
  // 部分源站无结果时返回 list: null（而非 []），视为空结果而非格式错误
  if (rawList !== null && rawList !== undefined && !Array.isArray(rawList)) {
    throw new Error('API返回的数据格式无效');
  }
  const list = Array.isArray(rawList) ? rawList : [];
  return list.map((item) => {
    const vod = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const vodId = String(vod.vod_id ?? vod.id ?? vod.vodId ?? '');
    const name = String(vod.vod_name ?? vod.title ?? vod.name ?? '');
    const pic = typeof vod.vod_pic === 'string' ? vod.vod_pic : typeof vod.pic === 'string' ? vod.pic : typeof vod.poster === 'string' ? vod.poster : undefined;
    const typeName = typeof vod.type_name === 'string' ? vod.type_name : typeof vod.category === 'string' ? vod.category : typeof vod.typeName === 'string' ? vod.typeName : undefined;
    const year = typeof vod.vod_year === 'string' ? vod.vod_year : typeof vod.year === 'string' ? vod.year : typeof vod.vod_year === 'number' ? String(vod.vod_year) : undefined;
    const area = typeof vod.vod_area === 'string' ? vod.vod_area : typeof vod.area === 'string' ? vod.area : typeof vod.region === 'string' ? vod.region : undefined;
    const remarks = typeof vod.vod_remarks === 'string' ? vod.vod_remarks : typeof vod.remarks === 'string' ? vod.remarks : typeof vod.note === 'string' ? vod.note : undefined;
    const updatedAt = typeof vod.vod_time === 'string' ? vod.vod_time : typeof vod.time === 'string' ? vod.time : undefined;

    return {
      sourceKey: source.key,
      sourceName: source.name,
      vodId,
      name,
      pic: pic?.trim() || undefined,
      typeName: typeName?.trim() || undefined,
      year: year?.trim() || undefined,
      area: area?.trim() || undefined,
      remarks: remarks?.trim() || undefined,
      updatedAt: updatedAt?.trim() || undefined,
      sourceUrl: source.url,
      isAdult: source.isAdult,
    };
  });
}

/**
 * 从 vod_play_url 中提取分集地址：格式 源1$$$源2，集1$URL1#集2$URL2。
 * 部分源（如量子 lziapi、非凡 ffzy）第一条线路是网页中转页（…/share/xxx，不可播），
 * 真实 m3u8 在后面的线路里，因此优先取包含 m3u8 直链的线路；均无 m3u8 时回退第一条。
 */
export function extractEpisodesFromPlayUrl(playUrl: string): string[] {
  if (!playUrl) return [];
  const groups = playUrl
    .split('$$$')
    .map((group) =>
      group
        .split('#')
        .map((ep) => {
          const parts = ep.split('$');
          return parts.length > 1 ? parts[1] : '';
        })
        .filter((url) => url.startsWith('http://') || url.startsWith('https://'))
    )
    .filter((eps) => eps.length > 0);
  if (groups.length === 0) return [];
  return groups.find((eps) => eps.some((url) => url.includes('.m3u8'))) ?? groups[0];
}

/** 从简介文本中兜底提取 m3u8 链接 */
export function extractM3u8FromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(M3U8_PATTERN) || [];
  return matches.map((link) => link.replace(/^\$/, ''));
}

/** 详情 JSON 响应 → 统一详情 */
export function parseDetail(
  data: unknown,
  source: { key: string; name: string; url: string }
): VideoDetail {
  const d = data as { list?: Record<string, unknown>[] };
  if (!d || !Array.isArray(d.list) || d.list.length === 0) {
    throw new Error('获取到的详情内容无效');
  }
  const vod = d.list[0];
  let episodes = extractEpisodesFromPlayUrl(String(vod.vod_play_url ?? ''));
  if (episodes.length === 0) {
    episodes = extractM3u8FromText(String(vod.vod_content ?? ''));
  }
  return {
    episodes,
    videoInfo: {
      title: str(vod.vod_name),
      cover: str(vod.vod_pic),
      desc: str(vod.vod_content),
      typeName: str(vod.type_name),
      year: str(vod.vod_year),
      area: str(vod.vod_area),
      director: str(vod.vod_director),
      actor: str(vod.vod_actor),
      remarks: str(vod.vod_remarks),
      sourceKey: source.key,
      sourceName: source.name,
      sourceUrl: source.url,
    },
  };
}

function str(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || undefined;
}

/**
 * 部分源的列表接口不返回播放地址，需要爬详情页 HTML 提取 m3u8。
 * 与旧版 handleSpecialSourceDetail 对齐。
 */
export function parseDetailPageHtml(
  html: string,
  source: { key: string; name: string; url: string }
): VideoDetail {
  // 先尝试通用模式，再尝试非凡影视的日期哈希特征路径
  let matches = html.match(/\$(https?:\/\/[^"'\s]+?\.m3u8)/g) || [];
  if (matches.length === 0) {
    matches = html.match(/\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g) || [];
  }
  // 去重并清理尾缀
  const episodes = [...new Set(matches)].map((link) => {
    let u = link.substring(1);
    const parenIndex = u.indexOf('(');
    if (parenIndex > 0) u = u.substring(0, parenIndex);
    return u;
  });

  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const descMatch = html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);

  return {
    episodes,
    videoInfo: {
      title: titleMatch ? titleMatch[1].trim() : undefined,
      desc: descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : undefined,
      sourceKey: source.key,
      sourceName: source.name,
      sourceUrl: source.url,
    },
  };
}

/** 敏感分类过滤（成人内容过滤，关键词与旧版保持一致） */
const ADULT_KEYWORDS = [
  '伦理片', '福利', '倫理片', '福利片', '日本伦理', '日本福利', '日本福利片', '日本伦理片', '擦边短剧', '擦边', '韩国伦理','里番动漫', '门事件', '萝莉少女', '制服诱惑', '国产传媒',
  'cosplay', '黑丝诱惑', '无码', '日本无码', '有码', '日本有码', 'SWAG',
  '网红主播', '色情片', '同性片', '福利视频', '无码高清', '有码高清', '91视频', '自拍偷拍', 'mini传媒', '福利片',
];

export function isAdultContent(typeName: string | undefined): boolean {
  if (!typeName) return false;
  return ADULT_KEYWORDS.some((k) => typeName.includes(k));
}

export function filterAdultResults<T extends { typeName?: string }>(items: T[], enabled: boolean): T[] {
  if (!enabled) return items;
  return items.filter((item) => !isAdultContent(item.typeName));
}

/**
 * 智能清洗搜索词：
 * 1. 剔除外层书名号、括号、特殊标点与年份（如《三体 (2023)》-> 三体）
 * 2. 剥离中英文双语标题中的英文副标（如「周处除三害 The Pig, the Snake and the Pigeon」-> 周处除三害）
 * 3. 提取主体中文名，大幅提升 CMS 采集站的 LIKE 模糊匹配命中率
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query) return '';
  let s = query.trim();

  // 1. 去除外层书名号或引号《》“”''""
  s = s.replace(/^《([^》]+)》$/, '$1').replace(/^["'“”‘']([^"'“”‘']+)["'“”‘']$/, '$1').trim();

  // 2. 移除尾部或括号内的年份，如 "三体 (2023)"、"狂飙[2023]"
  s = s.replace(/[\(（\[【]\s*\b(19\d\d|20\d\d)\b\s*[\)）\]】]/g, '');
  s = s.replace(/\b(19\d\d|20\d\d)\b\s*$/g, '');

  // 3. 中英文混排处理：若前面有 2 个以上汉字，后面跟着大段纯英文片名，提取前面的中文主要片名
  const zhEnMatch = s.match(/^([\u4e00-\u9fa50-9·：:—\-]{2,})\s+[A-Za-z0-9\s:,'\.-]{2,}$/);
  if (zhEnMatch && zhEnMatch[1]) {
    s = zhEnMatch[1];
  }

  // 4. 清理首尾可能残留的连字符、冒号与标点
  s = s.replace(/^[\s,.:;!?'"“”‘’（）\(\)\[\]【】·—\-]+|[\s,.:;!?'"“”‘’（）\(\)\[\]【】·—\-]+$/g, '');

  return s.trim() || query.trim();
}

/**
 * 归一化标题/关键词：去空白、标点与符号，转小写。
 * 用于跨标点差异匹配（源站存「摔跤吧!爸爸」而用户搜「摔跤吧！爸爸」）。
 */
export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

/**
 * 相关性判断：结果标题是否真的命中了搜索词。
 * 部分采集站会做分词/OR 模糊搜索，逐条校验后只保留真正相关的结果。
 */
export function isRelevant(name: string, wd: string): boolean {
  const nName = normalizeTitle(name);
  const nWd = normalizeTitle(wd);
  if (!nName || !nWd) return true; // 空关键词不参与过滤
  if (nName.includes(nWd)) return true;

  // 容错 1：多词查询（空格分隔）时每个词都命中才算相关
  const tokens = wd.trim().split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((t) => {
      const n = normalizeTitle(t);
      return !n || nName.includes(n);
    });
  }

  // 容错 2：单词或无空格时，尝试经过智能清洗后的核心词
  const clean = sanitizeSearchQuery(wd);
  const nClean = normalizeTitle(clean);
  if (nClean && nName.includes(nClean)) return true;

  return false;
}

/**
 * 结果相关性过滤：丢弃与关键词无关的条目。
 * 过滤后为空时回退到原列表——宁可多展示也不把源站唯一可用的结果清空。
 */
export function filterRelevantResults<T extends { name?: string }>(items: T[], wd: string): T[] {
  const filtered = items.filter((item) => isRelevant(item.name || '', wd));
  return filtered.length > 0 ? filtered : items;
}

/**
 * 全角字符转半角字符
 */
export function toHalfWidth(str: string): string {
  return str
    .replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}

/**
 * 第一级：标题深度清洗规范化
 * - 去除 HTML 标签；
 * - 全角转半角；
 * - 统一大小写与常见分隔符（冒号、破折号）；
 * - 剥离常见画质/版本/状态修饰标签（如 [4K超清]、[完结]、[国语版]、抢先版等）；
 * - 完好保留季数（如“第2季”、“Season 2”、“S2”）与正片主标题。
 */
export function cleanTitleForDeduplication(title: string): string {
  if (!title) return '';
  let s = title.replace(/<[^>]+>/g, ''); // 去除 HTML
  s = toHalfWidth(s).trim();

  // 1. 去除外层书名号或各类成对引号
  s = s.replace(/^《([^》]+)》$/, '$1').replace(/^["'“”‘']([^"'“”‘']+)["'“”‘']$/, '$1').trim();

  // 2. 清洗画质/资源标签（括号或方括号内包含画质、压制、音轨或完结状态的组合词）
  const bracketNoisePattern =
    /[\[\(【（［]\s*(?:4k|8k|1080p|720p|2160p|hd|bd|tc|ts|dvd|蓝光|超清|高清|标清|国语|粤语|沪语|英语|原声|中字|双语|国粤双语|完结|全集|抢先版|修正版|未删减版|未删减|纯净版|无修版|合集|修复版|珍藏版|重制版|加长版|最终版|版|\s|[a-zA-Z0-9])+\s*[\]\)】）］]/gi;
  s = s.replace(bracketNoisePattern, ' ');

  // 3. 清除末尾独立的画质/版本修饰后缀（如 "三体 4K"、"繁花 抢先版"、"繁花 沪语版"）
  const trailingNoisePattern =
    /\s+(?:4k|8k|1080p|720p|2160p|hd|bd|tc|蓝光|超清|高清|国语版|粤语版|沪语版|英语版|原声版|中字|双语|完结|全集|抢先版|未删减版|珍藏版|重制版)$/gi;
  s = s.replace(trailingNoisePattern, '');

  // 4. 分隔符归一化
  s = s.replace(/[:：]/g, ':').replace(/[—–-]/g, '-');

  // 5. 压缩多余空格
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * 提取季数标识（区分不同季剧集）
 */
export function extractSeason(title: string): string {
  const half = toHalfWidth(title).toLowerCase();
  const m1 = half.match(/(?:第\s*([0-9一二三四五六七八九十]+)\s*季)|(?:season\s*([0-9]+))|(?:\bs([0-9]{1,2})\b)/i);
  if (m1) {
    const s = m1[1] || m1[2] || m1[3];
    return `s${s}`;
  }
  return 's1';
}

/**
 * 提取作品类别（区分电影与剧集/动漫/短剧/综艺）
 */
export function extractCategory(item: { typeName?: string; remarks?: string; name?: string }): string {
  const text = `${item.typeName || ''} ${item.remarks || ''} ${item.name || ''}`;
  if (text.includes('短剧') || text.includes('微短剧')) return 'short_drama';
  if (text.includes('动漫') || text.includes('动画') || text.includes('新番')) return 'anime';
  if (text.includes('综艺')) return 'variety';
  if (text.includes('纪录') || text.includes('纪录片')) return 'documentary';
  if (text.includes('剧') || text.includes('连载') || text.includes('集') || text.includes('更新至')) return 'tv';
  return 'movie';
}

/**
 * 提取规范化 4 位年份
 */
export function extractYear(rawYear?: string): string {
  if (!rawYear) return '';
  const m = rawYear.match(/\b(19\d\d|20\d\d)\b/);
  return m ? m[1] : '';
}

/**
 * 第二级：建立候选去重键
 * 规范化标题 + 季数 + 内容类别 + 年份
 */
export function buildDeduplicationKey(item: SearchResultItem): string {
  const normTitle = normalizeTitle(cleanTitleForDeduplication(item.name || ''));
  const season = extractSeason(item.name || '');
  const category = extractCategory(item);
  const year = extractYear(item.year);
  return `${normTitle}###${season}###${category}###${year}`;
}

/**
 * 计算单个条目的数据丰富度与质量打分（最高分者被选为主展示卡片）
 */
function scoreItemCompleteness(item: SearchResultItem): number {
  let score = 0;
  if (item.pic && item.pic.startsWith('http')) score += 10;
  if (item.year && extractYear(item.year)) score += 5;
  if (item.remarks && item.remarks.length > 1) score += 5;
  if (item.area) score += 3;
  if (item.typeName) score += 2;
  // 标题越干净规整，加分
  const rawLen = item.name.length;
  const cleanLen = cleanTitleForDeduplication(item.name).length;
  if (rawLen > 0 && cleanLen / rawLen >= 0.8) score += 2;
  return score;
}

/**
 * 多源聚合、二级去重与相关性排序引擎
 * 1. 过滤成人内容（若开启）；
 * 2. 关键词相关性校验；
 * 3. 二级指纹去重并合并为单一主卡片，附带 matchedSources；
 * 4. 相关性精排（完全匹配 > 前缀匹配 > 包含完整关键词 > 模糊匹配），辅以数据完整度与多源热度。
 */
export function aggregateAndDedupeSearchItems(
  items: SearchResultItem[],
  wd: string,
  filterAdult: boolean
): SearchResultItem[] {
  // 1. 同源同 vodId 基础防重
  const seenRaw = new Set<string>();
  const rawList = items.filter((item) => {
    const k = `${item.sourceKey}_${item.vodId}`;
    if (seenRaw.has(k)) return false;
    seenRaw.add(k);
    return true;
  });

  // 2. 成人内容过滤
  let filtered = filterAdultResults(rawList, filterAdult);

  // 3. 关键词相关性初筛
  filtered = filterRelevantResults(filtered, wd);

  // 4. 跨源二级指纹去重与聚合分组
  const groups = new Map<string, SearchResultItem[]>();
  for (const item of filtered) {
    const key = buildDeduplicationKey(item);
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  // 5. 每组选取信息最完整的结果作为主卡片，并汇聚 matchedSources
  const aggregated: SearchResultItem[] = [];
  for (const groupItems of groups.values()) {
    if (groupItems.length === 1) {
      const single = groupItems[0];
      aggregated.push({
        ...single,
        matchedSources: [
          {
            sourceKey: single.sourceKey,
            sourceName: single.sourceName,
            sourceVodId: single.vodId,
            sourceUrl: single.sourceUrl,
            remarks: single.remarks,
          },
        ],
      });
      continue;
    }

    // 选出完整度得分最高的一项作为主卡片
    let best = groupItems[0];
    let bestScore = scoreItemCompleteness(best);
    for (let i = 1; i < groupItems.length; i++) {
      const s = scoreItemCompleteness(groupItems[i]);
      if (s > bestScore) {
        best = groupItems[i];
        bestScore = s;
      }
    }

    // 收集所有匹配来源（按 sourceKey 去重）
    const matchedSeen = new Set<string>();
    const matchedSources = groupItems
      .filter((item) => {
        const k = `${item.sourceKey}_${item.vodId}`;
        if (matchedSeen.has(k)) return false;
        matchedSeen.add(k);
        return true;
      })
      .map((item) => ({
        sourceKey: item.sourceKey,
        sourceName: item.sourceName,
        sourceVodId: item.vodId,
        sourceUrl: item.sourceUrl,
        remarks: item.remarks,
      }));

    aggregated.push({
      ...best,
      matchedSources,
    });
  }

  // 6. 最终相关性精排
  const exactWd = normalizeTitle(cleanTitleForDeduplication(wd));
  const rawWd = normalizeTitle(wd);

  aggregated.sort((a, b) => {
    const aNorm = normalizeTitle(cleanTitleForDeduplication(a.name || ''));
    const bNorm = normalizeTitle(cleanTitleForDeduplication(b.name || ''));

    // Rank 1: 完全匹配
    const aExact = aNorm === exactWd || aNorm === rawWd ? 0 : 1;
    const bExact = bNorm === exactWd || bNorm === rawWd ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    // Rank 2: 以关键词开头
    const aStarts = aNorm.startsWith(exactWd) || aNorm.startsWith(rawWd) ? 0 : 1;
    const bStarts = bNorm.startsWith(exactWd) || bNorm.startsWith(rawWd) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;

    // Rank 3: 包含完整关键词
    const aIncludes = aNorm.includes(exactWd) || aNorm.includes(rawWd) ? 0 : 1;
    const bIncludes = bNorm.includes(exactWd) || bNorm.includes(rawWd) ? 0 : 1;
    if (aIncludes !== bIncludes) return aIncludes - bIncludes;

    // Rank 4: 多源命中有更多片源的排前面
    const aSources = a.matchedSources?.length || 1;
    const bSources = b.matchedSources?.length || 1;
    if (aSources !== bSources) return bSources - aSources;

    // Rank 5: 数据完整度更高优先
    const aScore = scoreItemCompleteness(a);
    const bScore = scoreItemCompleteness(b);
    if (aScore !== bScore) return bScore - aScore;

    // Rank 6: 按中文名称稳定排序
    return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN');
  });

  return aggregated;
}
