/**
 * 流式并发匹配引擎 (StreamSourceMatcher)
 * 壳肉分离架构内核：拿着标准片名/豆瓣ID并发探测几十个播放源，精准清洗防串片，并流式首源秒播
 */

import type { SourceConfig } from './types';

export interface TargetMediaInfo {
  title: string;
  doubanId?: string;
  year?: string;
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
 * 1. 关键词清洗预处理
 * 去掉季数（记录 season 供后续防串片强校验），剥离特殊符号与副标题
 */
export function cleanSearchKeyword(rawTitle: string): { cleanTitle: string; season: number } {
  if (!rawTitle) return { cleanTitle: '', season: 1 };

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
  title = title.replace(/[（(][^）)]*[）)]/g, ' ');
  title = title.replace(/[【\[][^】\]]*[】\]]/g, ' ');

  // 4. 去除特殊干扰标点符号
  title = title.replace(/[·・“”"'`《》]/g, ' ');

  // 5. 收敛多余空格
  const cleanTitle = title.replace(/\s+/g, ' ').trim();

  return {
    cleanTitle: cleanTitle || rawTitle.trim(),
    season: Math.max(1, season),
  };
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
 * 淘汰规则：解说、花絮、预告、彩蛋直接 0 分；季数不合直接 0 分
 */
export function matchAndScoreVodItem(
  target: { title: string; cleanTitle: string; season: number; doubanId?: string; year?: string },
  item: Record<string, unknown>
): number {
  const vodName = String(item.vod_name || item.name || item.title || '').trim();
  if (!vodName) return 0;

  // 淘汰规则 1：标题包含剧透解说/花絮等非正片
  const blackKeywords = [
    '解说',
    '花絮',
    '预告',
    '彩蛋',
    '混剪',
    '特辑',
    '幕后',
    '纯享',
    '片花',
    '看点',
    '盘点',
    '二创',
  ];
  for (const kw of blackKeywords) {
    if (vodName.includes(kw)) return 0;
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
  } else if (normCandidate.includes(normTarget) || normTarget.includes(normCandidate)) {
    // 包含关系（允许轻微字尾差异）
    const lengthDiff = Math.abs(normTarget.length - normCandidate.length);
    if (lengthDiff <= 2) {
      score = 75;
    } else if (lengthDiff <= 5) {
      score = 65;
    } else {
      score = 50;
    }
  } else {
    // 完全不匹配
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
      timeoutMs: 5000,
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
    const { cleanTitle, season } = cleanSearchKeyword(this.target.title);
    if (!cleanTitle) return [];

    const targetParsed = {
      title: this.target.title,
      cleanTitle,
      season,
      doubanId: this.target.doubanId,
      year: this.target.year,
    };

    const enabledSources = this.sources.filter((s) => s.url && s.searchEnabled !== false);
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
    }
  ): Promise<void> {
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

      if (!res.ok) return;

      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') return;

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

      const elapsedMs = Date.now() - startMs;
      const matchedRemarks = String(bestItem.vod_remarks || bestItem.remarks || '').trim();

      const matched: MatchedSource = {
        source,
        score: highestScore,
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

      // 流式回调：首个合格源立即触发 isFirst = true，通知播放页起播
      const isFirst = !this.hasReportedFirst;
      if (isFirst) {
        this.hasReportedFirst = true;
      }
      this.options.onSourceFound?.(matched, isFirst);
    } finally {
      clearTimeout(timeoutTimer);
      this.abortController.signal.removeEventListener('abort', onGlobalAbort);
    }
  }
}
