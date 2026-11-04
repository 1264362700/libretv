import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import {
  aggregateAndDedupeSearchItems,
  cmsRequestHeaders,
  parseSearchList,
  sanitizeSearchQuery,
} from '@/lib/cms-parser';
import { fetchUpstream, getCache, setCache } from '@/lib/fetch-utils';
import { checkUpstreamAllowed } from '@/lib/ssrf';
import type { SearchResponse, SearchStreamEvent, SourceConfig, SourceSearchOutcome } from '@/lib/types';

export const runtime = 'nodejs';

interface SearchBody {
  wd: string;
  sources: SourceConfig[];
  filterAdult?: boolean;
  page?: number;
}

/** 搜索结果短缓存：同一关键词 + 同一组源 + 同页在 TTL 内直接返回 */
const SEARCH_CACHE_TTL = 90 * 1000;

/** 默认并发请求数限制：避免同时请求几十个资源站把服务器带宽与连接池打爆 */
const SEARCH_CONCURRENCY_LIMIT = 5;

/**
 * 单源默认超时（毫秒）：6000ms（可由源配置 source.timeoutMs 覆盖）
 */
const DEFAULT_SOURCE_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.SEARCH_SOURCE_TIMEOUT_MS || '6000', 10);
  if (!Number.isFinite(n)) return 6000;
  return Math.min(30000, Math.max(2000, n));
})();

/** 缓存键：wd + page + 成人过滤 + 排序后的源地址集合 */
function searchCacheKey(wd: string, sources: SourceConfig[], filterAdult: boolean, page: number = 1): string {
  const urls = sources.map((s) => s.url.replace(/\/+$/, '')).sort().join('|');
  return `search:${wd}\n${filterAdult ? 1 : 0}\np${page}\n${urls}`;
}

/** AbortSignal.timeout / 源级死线中断均以 TimeoutError 语义呈现（直接抛出或挂在 cause 上） */
function isTimeoutError(err: unknown): boolean {
  const candidates: unknown[] = [err, err instanceof Error ? err.cause : undefined];
  return candidates.some((e) => e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'));
}

/**
 * 带有并发限制的并发执行器（防止瞬间高并发网络风暴）
 */
async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIdx < items.length) {
      const current = nextIdx++;
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 服务端聚合搜索单个点播源：
 * 1. 使用标准 URL 与 URLSearchParams 编码；
 * 2. 独立超时控制（默认 6000ms 或源自定义 timeoutMs）；
 * 3. 严格校验 JSON 格式，过滤 HTML 错误页；
 * 4. 容错回退机制；
 * 5. 一个源失败严格隔离，不中断整体。
 */
async function searchSource(source: SourceConfig, wd: string, targetPage: number = 1): Promise<SourceSearchOutcome> {
  const start = Date.now();
  const finish = (outcome: Omit<SourceSearchOutcome, 'ms'>): SourceSearchOutcome => ({
    ...outcome,
    ms: Date.now() - start,
  });

  if (!/^https?:\/\//.test(source.url || '')) {
    return finish({ sourceKey: source.key, ok: false, list: [], error: '无效的源地址' });
  }
  // 用户可控地址发起服务端请求，必须先过 SSRF 校验（协议白名单 + 内网/保留地址）
  const verdict = await checkUpstreamAllowed(source.url);
  if (!verdict.ok) {
    return finish({ sourceKey: source.key, ok: false, list: [], error: verdict.reason });
  }

  const timeoutMs = Math.max(2000, Math.min(20000, source.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS));
  const controller = new AbortController();
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<SourceSearchOutcome>((resolve) => {
    deadlineTimer = setTimeout(() => {
      controller.abort(new DOMException('源搜索超时', 'TimeoutError'));
      resolve(
        finish({
          sourceKey: source.key,
          ok: false,
          list: [],
          error: `请求超时（>${Math.round(timeoutMs / 1000)}s）`,
          timedOut: true,
        })
      );
    }, timeoutMs);
  });

  const base = source.url.replace(/\/+$/, '');
  const cleanWd = sanitizeSearchQuery(wd);

  const fetchPage = async (page: number, queryWd: string = wd) => {
    let apiUrl: string;
    try {
      const u = new URL(base);
      u.searchParams.set('ac', 'videolist');
      u.searchParams.set('wd', queryWd);
      u.searchParams.set('pg', String(page));
      apiUrl = u.toString();
    } catch {
      const sep = base.includes('?') ? '&' : '?';
      const sp = new URLSearchParams({ ac: 'videolist', wd: queryWd, pg: String(page) });
      apiUrl = `${base}${sep}${sp.toString()}`;
    }

    const res = await fetchUpstream(apiUrl, {
      timeoutMs,
      headers: cmsRequestHeaders(),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // 只解析 JSON 响应，防止部分资源站返回 HTML 报错页或反爬验证页
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('源站返回了 HTML 页面而非 JSON（可能存在站点宕机或防护）');
      }
    }
    return res.json();
  };

  const run = async (): Promise<SourceSearchOutcome> => {
    let activeWd = wd;
    let first = await fetchPage(targetPage, activeWd);
    let list = parseSearchList(first, source);

    // 智能容错降级：若原词未命中且清洗后的核心词不同，自动使用核心词重试
    if (list.length === 0 && cleanWd && cleanWd !== wd) {
      try {
        const retryFirst = await fetchPage(targetPage, cleanWd);
        const retryList = parseSearchList(retryFirst, source);
        if (retryList.length > 0) {
          first = retryFirst;
          list = retryList;
          activeWd = cleanWd;
        }
      } catch {
        // 忽略降级失败
      }
    }

    // 默认请求第 1 页时，若该源支持分页且有多页，额外并行预取第 2 页保证结果丰满
    if (targetPage === 1) {
      const rawPageCount = parseInt(String((first as { pagecount?: unknown }).pagecount ?? '1'), 10);
      if (Number.isFinite(rawPageCount) && rawPageCount > 1) {
        try {
          const second = await fetchPage(2, activeWd);
          const secondList = parseSearchList(second, source);
          list.push(...secondList);
        } catch {
          // 容错忽略额外页失败
        }
      }
    }

    return { sourceKey: source.key, ok: true, list };
  };

  try {
    const runPromise = run()
      .then(finish)
      .catch((err: unknown): SourceSearchOutcome =>
        finish({
          sourceKey: source.key,
          ok: false,
          list: [],
          error: err instanceof Error ? err.message : '请求失败',
          timedOut: isTimeoutError(err),
        })
      );
    return await Promise.race([runPromise, deadline]);
  } catch (err) {
    return finish({
      sourceKey: source.key,
      ok: false,
      list: [],
      error: err instanceof Error ? err.message : '请求失败',
      timedOut: isTimeoutError(err),
    });
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
}

/** 合并 + 去重 + 过滤 + 排序，stream 与非 stream 两种模式共用 */
function aggregateOutcomes(outcomes: SourceSearchOutcome[], wd: string, filterAdult: boolean): SearchResponse {
  const allItems = outcomes.flatMap((o) => o.list);
  const list = aggregateAndDedupeSearchItems(allItems, wd, filterAdult);

  const failures = outcomes
    .filter((o) => !o.ok)
    .map((o) => ({ sourceKey: o.sourceKey, error: o.error || '请求失败', timedOut: o.timedOut }));

  return { list, failures };
}

/**
 * 服务端聚合搜索：
 * - 默认返回完整 JSON（换源或直接请求使用）；
 * - `?stream=1` 以 NDJSON 逐源推送（完成一个推一条，健康源结果无需等坏源超时），
 *   最终推送聚合后的 done 事件并写入短缓存。
 */
export async function POST(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  let body: SearchBody;
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const wd = (body.wd || '').trim();
  if (!wd || wd.length > 100) {
    return NextResponse.json({ error: '搜索关键词无效' }, { status: 400 });
  }
  if (!Array.isArray(body.sources) || body.sources.length === 0) {
    return NextResponse.json({ error: '请至少选择一个点播源' }, { status: 400 });
  }

  // 过滤出启用了搜索的源（searchEnabled !== false）
  const activeSources = body.sources
    .filter((s) => s.searchEnabled !== false)
    .slice(0, 50);

  if (activeSources.length === 0) {
    return NextResponse.json({ error: '没有启用的搜索源' }, { status: 400 });
  }

  const page = Math.max(1, body.page || 1);
  const filterAdult = body.filterAdult !== false;

  const cacheKey = searchCacheKey(wd, activeSources, filterAdult, page);
  const cached = getCache<SearchResponse>(cacheKey);
  if (cached) {
    if (new URL(req.url).searchParams.get('stream') === '1') {
      const event: SearchStreamEvent = { type: 'done', list: cached.list, failures: cached.failures };
      return new Response(JSON.stringify(event) + '\n', {
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    return NextResponse.json(cached);
  }

  const isStream = new URL(req.url).searchParams.get('stream') === '1';
  if (!isStream) {
    const outcomes = await runWithConcurrencyLimit(activeSources, SEARCH_CONCURRENCY_LIMIT, (source) =>
      searchSource(source, wd, page)
    );
    const payload = aggregateOutcomes(outcomes, wd, filterAdult);
    setCache(cacheKey, payload, SEARCH_CACHE_TTL);
    return NextResponse.json(payload);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: SearchStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          closed = true;
        }
      };

      const outcomes: SourceSearchOutcome[] = new Array(activeSources.length);
      await runWithConcurrencyLimit(activeSources, SEARCH_CONCURRENCY_LIMIT, async (source, i) => {
        const outcome = await searchSource(source, wd, page);
        outcomes[i] = outcome;
        send({ type: 'source', ...outcome });
      });

      const payload = aggregateOutcomes(outcomes, wd, filterAdult);
      setCache(cacheKey, payload, SEARCH_CACHE_TTL);
      send({ type: 'done', list: payload.list, failures: payload.failures });
      closed = true;
      try {
        controller.close();
      } catch {
        /* 已断开 */
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
