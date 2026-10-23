/**
 * 流式并发匹配引擎 (StreamSourceMatcher)
 * 壳肉分离架构内核：拿着标准片名/豆瓣ID并发探测几十个播放源，精准清洗防串片，并流式首源秒播
 */

import type { SourceConfig } from './types';
import {
  canProbeSource,
  getSourceQoSScore,
  recordSourceFailure,
  recordSourceSuccess,
} from './source-circuit-breaker';

export interface TargetMediaInfo {
  title: string;
  doubanId?: string;
  year?: string;
  /** 最低期望集数（如用户当前正在观看第 N 集时传入 N，优先命中集数达标的源） */
  minEpisodes?: number;
}

export interface MatchedEpisode {
  name: string;
  url: string;
}

export interface MatchedSource {
  source: SourceConfig;
  score: number;
  vodId: string;
  vodName: string;
  vodYear?: string;
  episodes: MatchedEpisode[];
  episodeUrls: string[]; // 兼容旧版 string[] 格式
  rawVodItem?: Record<string, unknown>;
  ms?: number; // 探测耗时毫秒数
  remarks?: string; // 该源最新集数/状态备注（如 "更新至24集"）
}

export interface MatcherProgress {
  completed: number;
  total: number;
  matched: number;
}

export interface MatcherOptions {
  concurrency?: number; // 并发数（建议 6~8）
  timeoutMs?: number; // 单源超时时间（默认 5000ms）
  signal?: AbortSignal;
  onSourceFound?: (matched: MatchedSource, isFirst: boolean) => void;
  onProgress?: (progress: MatcherProgress) => void;
  onComplete?: (allMatched: MatchedSource[]) => void;
}

/** 汉字数字转阿拉伯数字 */
const CN_NUM_MAP: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

/**
 * 衍生内容关键词：解说 / 二创 / 盘点。
 * 在「影视解说」这类频道里它们就是正片本身，必须放行；其余场景一律按噪音淘汰。
 */
const DERIVATIVE_KEYWORDS = ['解说', '二创', '盘点'];

/**
 * 片段类噪音关键词：预告 / 花絮 / 彩蛋 等。
 * 无论什么频道都不是正片，任何场景都淘汰。
 */
const FRAGMENT_BLACK_KEYWORDS = [
  '花絮',
  '预告',
  '彩蛋',
  '混剪',
  '特辑',
  '幕后',
  '纯享',
  '片花',
  '看点',
];

export interface CleanKeywordResult {
  cleanTitle: string;
  season: number;
  /**
   * 从标题中剥离出来的衍生内容标签（如 "电影解说"、"影视解说"）。
   * 保留下来是为了让打分环节能区分「解说版」与「同名原片」——
   * 二者清洗后标题完全一致，光靠片名相似度无法分辨。
   */
  derivativeTags: string[];
}

/**
 * 1. 关键词清洗预处理
 * 去掉季数（记录 season 供后续防串片强校验），剥离特殊符号与副标题，
 * 并把剥离出来的衍生标签原样保留在 derivativeTags 里供打分环节使用。
 */
export function cleanSearchKeyword(rawTitle: string): CleanKeywordResult {
  if (!rawTitle) return { cleanTitle: '', season: 1, derivativeTags: [] };

  let title = rawTitle.trim();
  let season = 1;

  // 1. 匹配并提取季数 (如 "第二季", "第2季", "第两季", "Season 2", "S2", "S02")
  const seasonPatterns = [
    /第\s*([0-9]+|[一二两三四五六七八九十]+)\s*季/i,
    /Season\s*([0-9]+)/i,
    /\bS([0-9]{1,2})\b/i,
    /第\s*([0-9]+|[一二两三四五六七八九十]+)\s*部/i,
  ];

  for (const pat of seasonPatterns) {
    const m = title.match(pat);
    if (m) {
      const rawVal = m[1];
      if (/^[0-9]+$/.test(rawVal)) {
        season = parseInt(rawVal, 10);
      } else if (CN_NUM_MAP[rawVal] !== undefined) {
        season = CN_NUM_MAP[rawVal];
      }
      title = title.replace(pat, ' ');
      break;
    }
  }

  // 2. 去掉冒号、破折号后面的副标题（如 "庆余年：第二季" 或 "流浪地球 - 抢先版"）
  title = title.split(/[:：—\-_]/)[0].trim();

  // 3. 去掉括号内的说明内容（如 "繁花 (剧版)", "三体 [国语版]"）
  //    括号里的内容并不丢弃，收进 derivativeTags，供后续判断「是否衍生内容」
  const derivativeTags: string[] = [];
  const collectBracket = (matched: string): string => {
    const inner = matched.slice(1, -1).trim();
    if (inner) derivativeTags.push(inner);
    return ' ';
  };
  title = title.replace(/[（(][^）)]*[）)]/g, collectBracket);
  title = title.replace(/[【\[][^】\]]*[】\]]/g, collectBracket);

  // 4. 去除特殊干扰标点符号
  title = title.replace(/[·・“”"'`《》]/g, ' ');

  // 5. 收敛多余空格
  let cleanTitle = title.replace(/\s+/g, ' ').trim();

  // 6. 剥离裸写的衍生词（如 "某某 电影解说" 这种没带括号的写法），同样记进标签。
  //    仅当衍生词不是标题全部内容时才剥，避免误伤本身就叫「解说」的极短标题。
  for (const kw of DERIVATIVE_KEYWORDS) {
    if (cleanTitle.includes(kw) && cleanTitle.length > kw.length) {
      derivativeTags.push(kw);
      cleanTitle = cleanTitle.split(kw).join(' ');
    }
  }
  cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();

  return {
    cleanTitle: cleanTitle || rawTitle.trim(),
    season: Math.max(1, season),
    derivativeTags,
  };
}

/** 判断一串标签里是否含有衍生内容关键词（用于决定要不要放宽黑名单） */
function hasDerivativeTag(tags: string[] | undefined): boolean {
  if (!tags || tags.length === 0) return false;
  return tags.some((tag) => DERIVATIVE_KEYWORDS.some((kw) => tag.includes(kw)));
}

/** 规范化标题用于相似度对比（去除空格并全小写） */
function normalizeForCompare(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·・“”"'`《》\-_:：]/g, '');
}

/**
 * 2. 精准打分与防串片算法
 * 豆瓣 ID 强匹配 (100分) > 片名与季数匹配 (80分) > 年份容错 (60分)
 * 淘汰规则：花絮、预告、彩蛋等片段类噪音直接 0 分；季数不合直接 0 分
 *
 * 衍生内容特例：当目标本身就是「影视解说」这类衍生内容时（allowDerivative = true），
 * 解说 / 二创 / 盘点 不再是噪音而是正片，从黑名单中释放；同时给命中衍生词的条目加分、
 * 给同名原片重罚，避免「点解说、播原片」的串片。
 */
export function matchAndScoreVodItem(
  target: {
    title: string;
    cleanTitle: string;
    season: number;
    doubanId?: string;
    year?: string;
    allowDerivative?: boolean;
    derivativeTags?: string[];
  },
  item: Record<string, unknown>
): number {
  const vodName = String(item.vod_name || item.name || item.title || '').trim();
  if (!vodName) return 0;

  const allowDerivative = Boolean(target.allowDerivative);

  // 淘汰规则 1：标题包含花絮/预告等非正片片段
  // 解说/二创/盘点仅在「目标本身就是衍生内容」时放行
  const blackKeywords = allowDerivative
    ? FRAGMENT_BLACK_KEYWORDS
    : [...FRAGMENT_BLACK_KEYWORDS, ...DERIVATIVE_KEYWORDS];
  for (const kw of blackKeywords) {
    if (vodName.includes(kw)) return 0;
  }

  // 淘汰规则 2：目标是解说/二创时，采集条目若无任何衍生标记即为「同名原片」，直接淘汰。
  // 实测两个解说分类（bfzy t=51 / lzi t=35）的条目标题统一带 [电影解说] 后缀，
  // 同名原片不带，据此可安全区分，避免「点解说、播原片」。
  let derivativeBonus = 0;
  if (allowDerivative && hasDerivativeTag(target.derivativeTags)) {
    const candidateText = `${vodName} ${String(item.vod_remarks || '')} ${String(
      item.type_name || ''
    )}`;
    const isDerivative = DERIVATIVE_KEYWORDS.some((kw) => candidateText.includes(kw));
    if (!isDerivative) return 0;
    derivativeBonus = 15; // 命中衍生标记，补足「包含关系」下的低分档
  }

  // 豆瓣 ID 强匹配（权重最高，100分）
  const vodDoubanId = String(item.vod_douban_id || item.douban_id || '').trim();
  if (target.doubanId && vodDoubanId && vodDoubanId !== '0') {
    if (vodDoubanId === String(target.doubanId).trim()) {
      return 100;
    }
  }

  // 分析候选采集条目的季数
  const itemClean = cleanSearchKeyword(vodName);
  // 季数冲突一票否决：找第2季返回第1季，或找第1季返回第2季
  if (target.season !== itemClean.season) {
    return 0;
  }

  const normTarget = normalizeForCompare(target.cleanTitle);
  const normCandidate = normalizeForCompare(itemClean.cleanTitle);

  let score = 0;

  // 片名完全一致
  if (normTarget === normCandidate) {
    score = 80;
  } else if (normCandidate.includes(normTarget)) {
    // 正向包含（候选标题包含目标词，如搜「庆余年」命中「庆余年 国语4K」）
    const lengthDiff = normCandidate.length - normTarget.length;
    if (lengthDiff <= 2) {
      score = 76;
    } else if (lengthDiff <= 5) {
      score = 68;
    } else {
      score = 52;
    }
  } else if (normCandidate.length >= 2 && normTarget.includes(normCandidate)) {
    // 反向包含（目标词包含较短候选词，如搜续集「唐朝诡事录之西行」遇到前作「唐朝诡事录」）：
    // 严格降权至 52 分以下（低于 60 分正片门槛），杜绝搜续集/番外却误播第一部
    const lengthDiff = normTarget.length - normCandidate.length;
    score = lengthDiff <= 2 ? 52 : 42;
  } else {
    // 完全不匹配或单字反向包含
    return 0;
  }

  // 年份校验与容错
  const itemYearStr = String(item.vod_year || item.year || '').trim();
  const itemYear = parseInt(itemYearStr, 10);
  const targetYear = target.year ? parseInt(target.year, 10) : NaN;

  if (Number.isFinite(itemYear) && Number.isFinite(targetYear)) {
    const diff = Math.abs(itemYear - targetYear);
    if (diff === 0) {
      score += 15; // 年份完全一致
    } else if (diff === 1) {
      score += 5; // 相差 1 年（跨年制作公映）
    } else if (diff >= 3) {
      score -= 30; // 年份相差 3 年以上，大概率是旧版或同名翻拍，重罚
    }
  }

  score += derivativeBonus;

  return Math.max(0, Math.min(100, score));
}

/** 解析采集项中的剧集列表（优先 m3u8） */
export function parseEpisodesFromVod(item: Record<string, unknown>): MatchedEpisode[] {
  const vodPlayUrl = String(item.vod_play_url || '');
  if (!vodPlayUrl) return [];

  // 如果有多个播放源线路用 $$$ 分隔，优先选带 m3u8 的那组
  const groups = vodPlayUrl.split('$$$');
  let selectedGroup = groups[0] || '';
  for (const g of groups) {
    if (g.includes('.m3u8')) {
      selectedGroup = g;
      break;
    }
  }

  const parts = selectedGroup.split('#');
  const episodes: MatchedEpisode[] = [];

  for (const part of parts) {
    const epParts = part.split('$');
    let epName = '正片';
    let epUrl = '';

    if (epParts.length >= 2) {
      epName = epParts[0].trim() || '正片';
      epUrl = epParts[1].trim();
    } else if (epParts.length === 1 && epParts[0].startsWith('http')) {
      epUrl = epParts[0].trim();
    }

    if (epUrl && (epUrl.startsWith('http://') || epUrl.startsWith('https://'))) {
      episodes.push({ name: epName, url: epUrl });
    }
  }

  return episodes;
}

/** 高可用、毫秒级响应的主力极速源特征匹配正则（排在第一梯队优先探测） */
const FAST_LANE_SOURCE_REGEX = /量子|非凡|红牛|极速|光速|金鹰|快车|暴风|天涯|优质|lzm3u8|ffm3u8|hnm3u8|gsm3u8|jyzy|kcm3u8/i;

export function sortSourcesByPriority(sources: SourceConfig[]): SourceConfig[] {
  return [...sources].sort((a, b) => {
    const aCanProbe = canProbeSource(a.key);
    const bCanProbe = canProbeSource(b.key);
    if (aCanProbe && !bCanProbe) return -1;
    if (!aCanProbe && bCanProbe) return 1;

    const aQos = getSourceQoSScore(a.key);
    const bQos = getSourceQoSScore(b.key);
    if (Math.abs(aQos - bQos) >= 12) {
      return bQos - aQos;
    }

    const aFast = FAST_LANE_SOURCE_REGEX.test(`${a.name || ''} ${a.url || ''}`);
    const bFast = FAST_LANE_SOURCE_REGEX.test(`${b.name || ''} ${b.url || ''}`);
    if (aFast && !bFast) return -1;
    if (!aFast && bFast) return 1;
    return bQos - aQos;
  });
}

/**
 * 流式并发匹配引擎
 */
export class StreamSourceMatcher {
  private target: TargetMediaInfo;
  private sources: SourceConfig[];
  private options: MatcherOptions;
  private abortController: AbortController;
  private matchedResults: MatchedSource[] = [];
  private completedCount = 0;
  private hasReportedFirst = false;

  constructor(target: TargetMediaInfo, sources: SourceConfig[], options: MatcherOptions = {}) {
    this.target = target;
    this.sources = sources;
    this.options = {
      concurrency: 6,
      timeoutMs: 3500,
      ...options,
    };
    this.abortController = new AbortController();

    if (options.signal) {
      if (options.signal.aborted) {
        this.abortController.abort(options.signal.reason);
      } else {
        options.signal.addEventListener('abort', () => this.abort(), { once: true });
      }
    }
  }

  /** 取消所有未完成探测请求 */
  public abort(): void {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort(new DOMException('User aborted source matching', 'AbortError'));
    }
  }

  /** 启动流式并发匹配任务 */
  public async start(): Promise<MatchedSource[]> {
    const { cleanTitle, season, derivativeTags } = cleanSearchKeyword(this.target.title);
    if (!cleanTitle) return [];

    // 目标片名自带 [电影解说] 这类衍生标记时自动放宽衍生词黑名单，
    // 无需调用方额外传参——播放页拿到的 title 本身就携带了频道语义。
    const allowDerivative = hasDerivativeTag(derivativeTags);

    const targetParsed = {
      title: this.target.title,
      cleanTitle,
      season,
      doubanId: this.target.doubanId,
      year: this.target.year,
      allowDerivative,
      derivativeTags,
    };

    const enabledSources = sortSourcesByPriority(
      this.sources.filter((s) => s.url && s.searchEnabled !== false)
    );
    const total = enabledSources.length;
    if (total === 0) return [];

    const concurrency = Math.max(1, Math.min(8, this.options.concurrency || 6));
    let nextIdx = 0;

    // 滑动窗口工作池
    const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
      while (nextIdx < enabledSources.length && !this.abortController.signal.aborted) {
        const source = enabledSources[nextIdx++];
        try {
          await this.probeSingleSource(source, targetParsed);
        } catch {
          // 容错：单个源异常绝不阻断其他源
        } finally {
          this.completedCount++;
          this.options.onProgress?.({
            completed: this.completedCount,
            total,
            matched: this.matchedResults.length,
          });
        }
      }
    });

    await Promise.all(workers);

    // 按匹配打分高低降序排序
    this.matchedResults.sort((a, b) => b.score - a.score);
    this.options.onComplete?.(this.matchedResults);

    return this.matchedResults;
  }

  /** 单源探测与解析 */
  private async probeSingleSource(
    source: SourceConfig,
    targetParsed: {
      title: string;
      cleanTitle: string;
      season: number;
      doubanId?: string;
      year?: string;
      allowDerivative?: boolean;
      derivativeTags?: string[];
    }
  ): Promise<void> {
    // 熔断防御：若该源近期连续超时/报错处于 Open 熔断期，且总源充足，直接跳过以释放并发通道
    if (this.sources.length > 3 && !canProbeSource(source.key)) {
      return;
    }

    const startMs = Date.now();
    const singleController = new AbortController();
    const timeoutMs = this.options.timeoutMs || 5000;
    const timeoutTimer = setTimeout(() => {
      singleController.abort(new DOMException('单源超时', 'TimeoutError'));
    }, timeoutMs);

    const onGlobalAbort = () => singleController.abort();
    this.abortController.signal.addEventListener('abort', onGlobalAbort, { once: true });

    try {
      // 构造请求：优先使用 ac=videolist&wd=... 请求采集站
      const cleanWd = targetParsed.cleanTitle;
      const targetQueryUrl = `${source.url.replace(/\/+$/, '')}?ac=videolist&wd=${encodeURIComponent(
        cleanWd
      )}`;

      // 通过项目自包含代理路由请求，规避客户端 CORS 与 SSRF 风险
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetQueryUrl)}`;

      const res = await fetch(proxyUrl, {
        signal: singleController.signal,
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        recordSourceFailure(source.key);
        return;
      }

      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') {
        recordSourceFailure(source.key);
        return;
      }

      // 源响应健康，记录 QoS 延迟
      recordSourceSuccess(source.key, Date.now() - startMs);

      const rawList = Array.isArray(data.list)
        ? data.list
        : Array.isArray(data.data)
        ? data.data
        : [];
      if (rawList.length === 0) return;

      // 在该源的所有候选返回中，选出得分最高且 >= 60 的最优匹配
      let bestItem: Record<string, unknown> | null = null;
      let highestScore = 0;

      for (const item of rawList) {
        if (!item || typeof item !== 'object') continue;
        const score = matchAndScoreVodItem(targetParsed, item);
        if (score >= 60 && score > highestScore) {
          highestScore = score;
          bestItem = item;
        }
      }

      if (!bestItem) return;

      // 提取剧集列表
      let episodes = parseEpisodesFromVod(bestItem);

      // 如果 videolist 模式下未附带 vod_play_url，则单源快速拉取 detail 补齐剧集
      const vodId = String(bestItem.vod_id || bestItem.id || '');
      if (episodes.length === 0 && vodId) {
        const detailQueryUrl = `${source.url.replace(/\/+$/, '')}?ac=detail&ids=${encodeURIComponent(
          vodId
        )}`;
        const detailProxyUrl = `/api/proxy?url=${encodeURIComponent(detailQueryUrl)}`;

        const detailRes = await fetch(detailProxyUrl, {
          signal: singleController.signal,
          headers: { Accept: 'application/json' },
        }).catch(() => null);

        if (detailRes && detailRes.ok) {
          const detailData = await detailRes.json().catch(() => null);
          const detailList = Array.isArray(detailData?.list) ? detailData.list : [];
          if (detailList.length > 0) {
            episodes = parseEpisodesFromVod(detailList[0]);
            bestItem = { ...bestItem, ...detailList[0] };
          }
        }
      }

      if (!bestItem || episodes.length === 0) return;

      const minEpisodes = Math.max(1, this.target.minEpisodes || 1);
      const hasEnoughEpisodes = episodes.length >= minEpisodes;
      // 集数可行性硬判定：若用户正在看第 N 集，而该源总集数不足 N 集（如预告源或断更源），
      // 予以显著降权且不抢占首源秒播（isFirst）
      const finalScore = hasEnoughEpisodes ? highestScore : Math.max(40, highestScore - 25);

      const elapsedMs = Date.now() - startMs;
      const matchedRemarks = String(bestItem.vod_remarks || bestItem.remarks || '').trim();

      const matched: MatchedSource = {
        source,
        score: finalScore,
        vodId,
        vodName: String(bestItem.vod_name || targetParsed.title),
        vodYear: String(bestItem.vod_year || ''),
        episodes,
        episodeUrls: episodes.map((e) => e.url),
        rawVodItem: bestItem,
        ms: elapsedMs,
        remarks: matchedRemarks,
      };

      this.matchedResults.push(matched);

      // 流式回调：首个集数达标的合格源立即触发 isFirst = true，通知播放页起播
      const isFirst = hasEnoughEpisodes && !this.hasReportedFirst;
      if (isFirst) {
        this.hasReportedFirst = true;
      }
      this.options.onSourceFound?.(matched, isFirst);
    } catch (err) {
      if (!this.abortController.signal.aborted) {
        recordSourceFailure(source.key);
      }
      throw err;
    } finally {
      clearTimeout(timeoutTimer);
      this.abortController.signal.removeEventListener('abort', onGlobalAbort);
    }
  }
}
