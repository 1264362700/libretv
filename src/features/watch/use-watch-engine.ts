'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { resolveSource } from '@/lib/store';
import type { SourceConfig, SearchResultItem } from '@/lib/types';
import { StreamSourceMatcher, type MatchedSource } from '@/lib/stream-source-matcher';
import { buildWatchUrl } from '@/lib/utils';
import { recordSourceFailure, recordSourceSuccess } from '@/lib/source-circuit-breaker';
import type { CandidateItem } from './watch-types';

/** 快于当前线路多少才值得提示用户（相对节省比例 30%） */
const SPEED_GAIN_THRESHOLD = 0.3;

export interface UseWatchEngineParams {
  store: {
    selectedKeys: string[];
    customAPIs: SourceConfig[];
    envSources: SourceConfig[];
  };
  verified: boolean;
  sourceKey: string;
  source: SourceConfig | undefined;
  hasStaleSource: boolean;
  vodId: string;
  titleParam: string;
  videoTitle: string;
  doubanIdParam: string;
  yearParam: string;
  indexParam: number;
  currentIndex: number;
  detailIsError: boolean;
  getCurrentPosition: () => number;
  router: {
    push: (href: string) => void;
    replace: (href: string, options?: { scroll?: boolean }) => void;
  };
  toast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export function useWatchEngine({
  store,
  verified,
  sourceKey,
  source,
  hasStaleSource,
  vodId,
  titleParam,
  videoTitle,
  doubanIdParam,
  yearParam,
  indexParam,
  currentIndex,
  detailIsError,
  getCurrentPosition,
  router,
  toast,
}: UseWatchEngineParams) {
  // 流式并发匹配状态
  const [streamProgress, setStreamProgress] = useState<{
    completed: number;
    total: number;
    matched: number;
  } | null>(null);
  const [streamMatchedList, setStreamMatchedList] = useState<MatchedSource[]>([]);
  const [matchingDone, setMatchingDone] = useState(false);
  const [isMatching, setIsMatching] = useState(false);

  // 后台测速与非侵入式最优线路胶囊提示
  const [speedSuggestion, setSpeedSuggestion] = useState<CandidateItem | null>(null);
  const [speedTesting, setSpeedTesting] = useState(false);
  const speedPromptedKeyRef = useRef<string>('');

  // 记录播放受阻/失败的源，避免自动换源陷入无限循环
  const failedSourcesRef = useRef<Set<string>>(new Set());
  const [failedSources, setFailedSources] = useState<Set<string>>(new Set());
  const matcherKeyRef = useRef<string>('');

  // 收集当前系统所有已启用的点播源（含当前源兜底）
  const allCandidateSources = useMemo(() => {
    const seen = new Set<string>();
    const list = store.selectedKeys
      .map((key) => resolveSource(store, key))
      .filter((s): s is SourceConfig => {
        if (!s || seen.has(s.key)) return false;
        seen.add(s.key);
        return true;
      });
    if (source && !seen.has(source.key)) {
      list.unshift(source);
    }
    return list;
  }, [store, source]);

  // 背景检索：优先从聚合搜索暂存中瞬时载入已知匹配线路
  const candidatesQuery = useQuery({
    queryKey: ['watch-sources', videoTitle, allCandidateSources.map((s) => s.key).join(',')],
    queryFn: async (): Promise<CandidateItem[]> => {
      if (!videoTitle || videoTitle === '未知视频' || allCandidateSources.length === 0) return [];
      const matched: CandidateItem[] = [];
      const seenKeys = new Set<string>();

      if (typeof window !== 'undefined' && sourceKey && vodId) {
        try {
          const cachedJson = sessionStorage.getItem(`libretv:matched:${sourceKey}:${vodId}`);
          if (cachedJson) {
            const preMatched = JSON.parse(cachedJson) as Array<{
              sourceKey: string;
              sourceName: string;
              sourceVodId: string;
              sourceUrl?: string;
              remarks?: string;
            }>;
            for (const m of preMatched) {
              const src = allCandidateSources.find((s) => s.key === m.sourceKey);
              if (src && !seenKeys.has(src.key)) {
                seenKeys.add(src.key);
                matched.push({
                  source: src,
                  result: {
                    sourceKey: src.key,
                    sourceName: src.name,
                    vodId: m.sourceVodId,
                    name: videoTitle,
                    sourceUrl: src.url,
                    remarks: m.remarks,
                  },
                });
              }
            }
          }
        } catch {}
      }

      if (source && vodId && !seenKeys.has(source.key)) {
        matched.unshift({
          source,
          result: {
            sourceKey: source.key,
            vodId,
            name: videoTitle,
          } as SearchResultItem,
        });
      }
      return matched;
    },
    enabled: Boolean(videoTitle && videoTitle !== '未知视频' && verified && allCandidateSources.length > 0),
    staleTime: 10 * 60_000,
  });

  const candidates = useMemo(() => {
    const list = [...(candidatesQuery.data ?? [])];
    const seen = new Set(list.map((c) => c.source.key));

    for (const sm of streamMatchedList) {
      if (!seen.has(sm.source.key)) {
        seen.add(sm.source.key);
        list.push({
          source: sm.source,
          result: {
            sourceKey: sm.source.key,
            sourceName: sm.source.name,
            vodId: sm.vodId,
            name: sm.vodName || videoTitle,
            sourceUrl: sm.source.url,
            remarks: sm.remarks || (sm.vodYear ? `${sm.vodYear}` : undefined),
          } as SearchResultItem,
          ms: sm.ms,
          episodeCount: sm.episodeUrls.length,
        });
      }
    }

    if (source && vodId && !list.some((c) => c.source.key === source.key)) {
      list.unshift({ source, result: { sourceKey: source.key, vodId, name: videoTitle } as SearchResultItem });
    }
    return list;
  }, [candidatesQuery.data, streamMatchedList, source, vodId, videoTitle]);

  // 后台测速 → 非侵入式最优线路浮动胶囊提示（不再强行暂停播放器）
  useEffect(() => {
    if (!matchingDone || !verified || speedSuggestion || speedTesting) return;
    if (!source || !vodId) return;

    const others = candidates.filter((c) => c.source.key !== source.key && c.result.vodId);
    if (others.length === 0) return;

    const promptKey = `${source.key}:${vodId}:${indexParam}`;
    if (speedPromptedKeyRef.current === promptKey) return;
    speedPromptedKeyRef.current = promptKey;

    let cancelled = false;
    const controller = new AbortController();
    setSpeedTesting(true);

    (async () => {
      try {
        const currentSample = await api.detailSpeed(vodId, source, controller.signal);
        if (cancelled) return;
        const baseline = currentSample.ok ? currentSample.ms : null;
        if (baseline === null || baseline <= 0) return;
        recordSourceSuccess(source.key, baseline);

        const results = await Promise.all(
          others.map(async (c) => {
            const r = await api.detailSpeed(c.result.vodId, c.source, controller.signal);
            if (r.ok && r.ms) {
              recordSourceSuccess(c.source.key, r.ms);
            }
            return { cand: c, ok: r.ok, ms: r.ms };
          })
        );
        if (cancelled) return;

        const faster = results
          .filter((r) => r.ok && r.ms !== undefined)
          .filter((r) => (r.ms as number) < baseline * (1 - SPEED_GAIN_THRESHOLD))
          .sort((a, b) => (a.ms as number) - (b.ms as number));

        if (faster.length === 0) return;

        const best = faster[0];
        const saved = Math.round((1 - (best.ms as number) / baseline) * 100);

        setSpeedSuggestion({
          ...best.cand,
          ms: best.ms,
          baselineMs: baseline,
          gainPercent: saved,
        } as CandidateItem);
      } catch {
        // 测速取消或中断静默忽略
      } finally {
        if (!cancelled) setSpeedTesting(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchingDone, verified, source, vodId, indexParam, speedSuggestion, speedTesting]);

  // 切换线路（保留当前集数与播放时间戳）
  const switchToCandidate = useCallback(
    (cand: CandidateItem, userInitiated = true) => {
      if (cand.source.key === sourceKey) return;
      if (userInitiated) {
        failedSourcesRef.current.delete(cand.source.key);
        setFailedSources(new Set(failedSourcesRef.current));
      }
      const pos = getCurrentPosition();
      router.push(
        buildWatchUrl({
          sourceKey: cand.source.key,
          vodId: cand.result.vodId,
          index: currentIndex,
          title: cand.result.name || videoTitle,
          sourceUrl: cand.source.url,
          detail: cand.source.detail,
          position: pos > 0 ? pos : undefined,
        })
      );
    },
    [sourceKey, currentIndex, videoTitle, router, getCurrentPosition]
  );

  const dismissSpeedSuggestion = useCallback(() => {
    setSpeedSuggestion(null);
  }, []);

  const acceptSpeedSuggestion = useCallback(() => {
    const target = speedSuggestion;
    setSpeedSuggestion(null);
    if (target) switchToCandidate(target, true);
  }, [speedSuggestion, switchToCandidate]);

  // 全自动故障换源逻辑
  const autoFailoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleAutoFailover = useCallback(
    (reason: string) => {
      if (!sourceKey) return;
      recordSourceFailure(sourceKey);
      failedSourcesRef.current.add(sourceKey);
      setFailedSources(new Set(failedSourcesRef.current));

      const viable = candidates
        .filter((c) => c.source.key !== sourceKey && !failedSourcesRef.current.has(c.source.key))
        .sort((a, b) => {
          // 优先选择集数能够覆盖当前正在观看集数（currentIndex + 1）的备用源
          const reqEp = currentIndex + 1;
          const aEnough = a.episodeCount === undefined || a.episodeCount >= reqEp ? 1 : 0;
          const bEnough = b.episodeCount === undefined || b.episodeCount >= reqEp ? 1 : 0;
          return bEnough - aEnough;
        });

      if (viable.length === 0) {
        if (candidates.length > 1) {
          toast('所有已探测的播放线路均已尝试且受阻，请检查网络或稍后重试', 'error');
        } else {
          toast('未找到其他可用的备用线路，可在设置中添加更多视频源', 'warning');
        }
        return;
      }

      const nextTarget = viable[0];
      toast(
        `当前线路「${source?.name || sourceKey}」播放受阻${reason ? `（${reason}）` : ''}，正在自动切换至「${nextTarget.source.name}」...`,
        'info'
      );

      if (autoFailoverTimerRef.current) clearTimeout(autoFailoverTimerRef.current);
      autoFailoverTimerRef.current = setTimeout(() => {
        switchToCandidate(nextTarget, false);
      }, 500);
    },
    [sourceKey, source?.name, candidates, currentIndex, toast, switchToCandidate]
  );

  useEffect(() => {
    return () => {
      if (autoFailoverTimerRef.current) clearTimeout(autoFailoverTimerRef.current);
    };
  }, []);

  // 详情接口加载失败时自动切换至备用线路
  useEffect(() => {
    if (detailIsError && sourceKey && !failedSourcesRef.current.has(sourceKey)) {
      const timer = setTimeout(() => {
        handleAutoFailover('数据源详情接口请求异常');
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [detailIsError, sourceKey, handleAutoFailover]);

  // 启动 StreamSourceMatcher 流式并发秒播与备选线路流式补齐
  useEffect(() => {
    const targetTitle = titleParam || videoTitle;
    if (!targetTitle || targetTitle === '未知视频' || !verified || allCandidateSources.length === 0) return;

    const targetKey = `${targetTitle}:${doubanIdParam || ''}:${yearParam || ''}`;
    if (matcherKeyRef.current === targetKey) return;
    matcherKeyRef.current = targetKey;

    setIsMatching(true);
    setMatchingDone(false);
    setStreamMatchedList([]);

    const hasInitialSource = Boolean(source && vodId);

    const matcher = new StreamSourceMatcher(
      {
        title: targetTitle,
        doubanId: doubanIdParam || undefined,
        year: yearParam || undefined,
        minEpisodes: Math.max(1, currentIndex + 1),
      },
      allCandidateSources,
      {
        concurrency: hasInitialSource ? 4 : 6,
        timeoutMs: 3500,
        onSourceFound: (matched, isFirst) => {
          setStreamMatchedList((prev) => {
            if (prev.some((m) => m.source.key === matched.source.key)) return prev;
            return [...prev, matched];
          });
          if (isFirst && !hasInitialSource) {
            router.replace(
              buildWatchUrl({
                sourceKey: matched.source.key,
                vodId: matched.vodId,
                index: indexParam,
                title: targetTitle,
                doubanId: doubanIdParam || undefined,
                year: yearParam || undefined,
                sourceUrl: matched.source.url,
                detail: matched.source.detail,
              })
            );
          }
        },
        onProgress: (p) => {
          setStreamProgress(p);
        },
        onComplete: () => {
          setIsMatching(false);
          setMatchingDone(true);
        },
      }
    );

    matcher.start();
    return () => {
      matcher.abort();
    };
  }, [
    sourceKey,
    source,
    hasStaleSource,
    vodId,
    titleParam,
    videoTitle,
    doubanIdParam,
    yearParam,
    verified,
    allCandidateSources,
    router,
    indexParam,
    currentIndex,
  ]);

  return {
    allCandidateSources,
    candidates,
    candidatesLoading: candidatesQuery.isLoading,
    streamProgress,
    streamMatchedList,
    matchingDone,
    isMatching,
    speedSuggestion,
    speedTesting,
    failedSources,
    switchToCandidate,
    dismissSpeedSuggestion,
    acceptSpeedSuggestion,
    handleAutoFailover,
  };
}
