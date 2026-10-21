'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
// 播放器（artplayer + hls.js）按需加载：拆出独立 chunk，不占首屏 First Load JS
const PlayerShell = dynamic(() => import('@/components/player-shell').then((m) => m.PlayerShell), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  ),
});
import { EmptyState, Spinner } from '@/components/states';
import { SwitchSourceModal } from '@/components/switch-source';
import { enqueueDownload } from '@/components/download-manager';
import { Icon } from '@/components/icon';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/toast';
import type { PlayerShellHandle } from '@/components/player-shell';
import { resolveSource, useAppStore } from '@/lib/store';
import type { SourceConfig, SearchResultItem } from '@/lib/types';
import {
  clearProgress,
  progressKeyOf,
  saveProgress,
  updateHistoryProgress,
  upsertHistory,
  db,
} from '@/lib/db';
import { buildWatchUrl, cn } from '@/lib/utils';
import { DoubanCard } from '@/components/video-card';
import { StreamSourceMatcher, type MatchedSource } from '@/lib/stream-source-matcher';
import { fetchDoubanDetail } from '@/lib/douban-api';
import type { CandidateItem } from '@/features/watch/watch-types';
import { parseNames, sanitizeDesc } from '@/features/watch/watch-utils';
import { SpeedSuggestionDialog } from '@/features/watch/watch-dialogs';
import { BackButton, HomeButton } from '@/features/watch/watch-buttons';
import { WatchSidebar } from '@/features/watch/watch-sidebar';

export default function WatchPage() {
  return (
    <Suspense>
      <WatchContent />
    </Suspense>
  );
}

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const store = useAppStore();
  const { verified, checked } = useAuth();
  const { toast } = useToast();

  // 播放前强制登录校验：未登录直接拦截重定向至 /login
  useEffect(() => {
    if (checked && !verified) {
      if (typeof window !== 'undefined') {
        const currentUrl = window.location.pathname + window.location.search;
        router.replace(`/login?redirect=${encodeURIComponent(currentUrl)}`);
      }
    }
  }, [checked, verified, router]);

  const sourceKey = searchParams.get('source') || '';
  const vodId = searchParams.get('id') || '';
  const directUrl = searchParams.get('url') || '';
  const titleParam = searchParams.get('title') || '';
  const doubanIdParam = searchParams.get('douban_id') || '';
  const yearParam = searchParams.get('year') || '';
  const indexParam = parseInt(searchParams.get('index') || '0', 10) || 0;

  const [reversed, setReversed] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);

  // 豆瓣官方详情（门面层元数据）：获取权威长简介、评分、演职员名单与高清封面
  const doubanQuery = useQuery({
    queryKey: ['douban-detail-watch', doubanIdParam],
    queryFn: ({ signal }) => fetchDoubanDetail(doubanIdParam, signal),
    enabled: Boolean(doubanIdParam),
    staleTime: 24 * 3600_000,
  });

  // 流式并发匹配状态
  const [streamProgress, setStreamProgress] = useState<{ completed: number; total: number; matched: number } | null>(null);
  const [streamMatchedList, setStreamMatchedList] = useState<MatchedSource[]>([]);
  const [matchingDone, setMatchingDone] = useState(false);
  const [isMatching, setIsMatching] = useState(false);

  // —— 后台测速与最优线路提示 ——
  // 匹配全部结束后，对各候选线路并发测速；若存在明显快于当前线路者则询问是否切换。
  // 弹框期间暂停播放，用户取消则恢复播放（原先是否在播放由 pausedByPrompt 记录）。
  const [speedSuggestion, setSpeedSuggestion] = useState<CandidateItem | null>(null);
  const [speedTesting, setSpeedTesting] = useState(false);
  const playerRef = useRef<PlayerShellHandle | null>(null);
  const pausedByPromptRef = useRef(false);
  // 本次会话已就当前线路询问过，避免换集/换源后反复弹同一个框
  const speedPromptedKeyRef = useRef<string>('');

  /** 快于当前线路多少才值得打扰用户（相对节省比例） */
  const SPEED_GAIN_THRESHOLD = 0.3;

  // 记录当前播放秒数，供换源时无缝保留时间戳
  const currentPosRef = useRef(0);

  // 记录播放受阻/失败的源，避免自动换源陷入无限循环
  const failedSourcesRef = useRef<Set<string>>(new Set());
  const [failedSources, setFailedSources] = useState<Set<string>>(new Set());

  // 记录当前正在流式匹配的影片唯一特征，避免因首源秒播更新 URL 导致匹配器被重复打断重启
  const matcherKeyRef = useRef<string>('');

  const source = resolveSource(store, sourceKey, {
    url: searchParams.get('sourceUrl') || undefined,
    detail: searchParams.get('detail') || undefined,
  });

  /**
   * URL 带来的点播源是否已失效。
   *
   * 除「完全没带 source」外，还有一类更隐蔽的死链：切换 DEFAULT_SOURCES / 内置源 /
   * 订阅源后，用户观看历史或收藏里的 `source=` 旧 key（如 `env`）已不存在于新配置中，
   * 但 resolveSource 仍返回 undefined。这类 URL 过去直接落到「点播源不存在」报错页，
   * 没有任何自愈路径——片明明还在，匹配器也明明能命中。
   *
   * 判定：URL 声称带了一个 sourceKey，但解析不出来 → 视为失效，可退回按片名重新匹配。
   */
  const hasStaleSource = Boolean(sourceKey && !source);

  // 详情查询：无 id（纯直连链接分享）时跳过
  const detailQuery = useQuery({
    queryKey: ['detail', sourceKey, vodId, source?.url],
    queryFn: ({ signal }) => api.detail(vodId, source!, signal),
    enabled: Boolean(source && vodId && verified),
    staleTime: 5 * 60_000,
  });

  const episodes = useMemo(() => detailQuery.data?.episodes ?? [], [detailQuery.data]);
  const videoTitle = titleParam || detailQuery.data?.videoInfo?.title || '未知视频';

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

  // 背景检索：在所有可用源中探测同名/前缀匹配资源，供播放页就地选源与自动换源
  const candidatesQuery = useQuery({
    queryKey: ['watch-sources', videoTitle, allCandidateSources.map((s) => s.key).join(',')],
    queryFn: async (): Promise<CandidateItem[]> => {
      if (!videoTitle || videoTitle === '未知视频' || allCandidateSources.length === 0) return [];
      const matched: CandidateItem[] = [];
      const seenKeys = new Set<string>();

      // 0. 优先从聚合搜索暂存中瞬时秒级载入已知匹配线路
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

      // 保证当前正在播放的源始终存在于候选列表中（其余备选源由 StreamSourceMatcher 流式轻量异步补齐）
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
        });
      }
    }

    if (source && vodId && !list.some((c) => c.source.key === source.key)) {
      list.unshift({ source, result: { sourceKey: source.key, vodId, name: videoTitle } as SearchResultItem });
    }
    return list;
  }, [candidatesQuery.data, streamMatchedList, source, vodId, videoTitle]);

  /**
   * 后台测速 → 最优线路提示。
   *
   * 触发时机：流式匹配全部完成（matchingDone）后，对除当前线路外的候选并发测速，
   * 若存在快出阈值以上的线路则弹框询问。选「后台匹配完成后」而非「达到条数阈值」，
   * 是为了确保参与比较的是全集命中，速度排名才有意义。
   *
   * 弹框期间暂停播放；用户选择切换走 switchToCandidate（保留进度），
   * 选择保持则恢复播放，避免"问一句就打断一次"。
   */
  useEffect(() => {
    if (!matchingDone || !verified || speedSuggestion || speedTesting) return;
    if (!source || !vodId) return;

    // 候选不足 2 条时无从比较
    const others = candidates.filter((c) => c.source.key !== source.key && c.result.vodId);
    if (others.length === 0) return;

    // 同一线路同一集只询问一次。indexParam 定义在本 effect 之前，
    // 而 currentIndex 是 indexParam 经 episodes 边界收敛后的结果，两者对
    // 「当前是第几集」的判定在此处等价——这里用 indexParam 以避免引用后声明的变量。
    const promptKey = `${source.key}:${vodId}:${indexParam}`;
    if (speedPromptedKeyRef.current === promptKey) return;
    speedPromptedKeyRef.current = promptKey;

    let cancelled = false;
    const controller = new AbortController();
    setSpeedTesting(true);

    (async () => {
      try {
        // 先测当前线路作为基准（播放器已在播，但此处重测一次取可比口径）
        const currentSample = await api.detailSpeed(vodId, source, controller.signal);
        if (cancelled) return;
        const baseline = currentSample.ok ? currentSample.ms : null;
        if (baseline === null || baseline <= 0) return;

        // 并发测速其余候选
        const results = await Promise.all(
          others.map(async (c) => {
            const r = await api.detailSpeed(c.result.vodId, c.source, controller.signal);
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

        // 弹框前先暂停；记录原先是否在播，取消时按原状态恢复
        const handle = playerRef.current;
        if (handle) {
          if (handle.isPlaying()) {
            pausedByPromptRef.current = true;
            handle.pause();
          } else {
            pausedByPromptRef.current = false;
          }
        }
        setSpeedSuggestion({
          ...best.cand,
          ms: best.ms,
          // 附带基准耗时与提速幅度，供弹框展示（当前源耗时 → 推荐源耗时）
          baselineMs: baseline,
          gainPercent: saved,
        } as CandidateItem);
      } catch {
        // 测速失败（用户已离开页面 / 网络中断）静默忽略，不打扰用户
      } finally {
        if (!cancelled) setSpeedTesting(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // candidates 变化频繁（含 ms 字段），此处刻意只依赖匹配完成的信号与当前线路，
    // 避免候选数组引用变化导致反复测速。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchingDone, verified, source, vodId, indexParam, speedSuggestion, speedTesting]);

  // 影片元数据提取（豆瓣官方门面优先，采集源详情与候选兜底）
  const doubanMeta = doubanQuery.data;
  const videoInfo = detailQuery.data?.videoInfo;
  const coverUrl = doubanMeta?.cover || videoInfo?.cover || candidates.find((c) => c.result.pic)?.result.pic;
  const yearText = doubanMeta?.year || videoInfo?.year || candidates.find((c) => c.result.year)?.result.year;
  const typeText =
    doubanMeta?.genres && doubanMeta.genres.length > 0
      ? doubanMeta.genres.join(' / ')
      : videoInfo?.typeName || candidates.find((c) => c.result.typeName)?.result.typeName;
  const areaText =
    doubanMeta?.countries && doubanMeta.countries.length > 0
      ? doubanMeta.countries.join(' / ')
      : videoInfo?.area || candidates.find((c) => c.result.area)?.result.area;
  const remarksText =
    doubanMeta?.rate && doubanMeta.rate !== '暂无评分'
      ? `豆瓣评分 ★${doubanMeta.rate}`
      : videoInfo?.remarks || candidates.find((c) => c.result.remarks)?.result.remarks;

  const actorList = useMemo(() => {
    if (doubanMeta?.actors && doubanMeta.actors.length > 0) return doubanMeta.actors;
    return parseNames(videoInfo?.actor);
  }, [doubanMeta?.actors, videoInfo?.actor]);

  const directorList = useMemo(() => {
    if (doubanMeta?.directors && doubanMeta.directors.length > 0) return doubanMeta.directors;
    return parseNames(videoInfo?.director);
  }, [doubanMeta?.directors, videoInfo?.director]);

  const cleanDesc = useMemo(() => {
    if (doubanMeta?.intro) return doubanMeta.intro;
    return sanitizeDesc(videoInfo?.desc);
  }, [doubanMeta?.intro, videoInfo?.desc]);

  const [descExpanded, setDescExpanded] = useState(false);
  useEffect(() => {
    setDescExpanded(false);
  }, [vodId, titleParam]);

  // 跨源候选提供的备选剧照/封面图列表（展示多图）
  const [selectedPoster, setSelectedPoster] = useState<string | undefined>(undefined);
  useEffect(() => {
    setSelectedPoster(undefined);
  }, [vodId, titleParam]);

  const extraPics = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    if (coverUrl) {
      list.push(coverUrl);
      seen.add(coverUrl);
    }
    for (const c of candidates) {
      if (c.result.pic && !seen.has(c.result.pic)) {
        list.push(c.result.pic);
        seen.add(c.result.pic);
      }
    }
    return list;
  }, [coverUrl, candidates]);

  const activePoster = selectedPoster || coverUrl;

  // 猜你喜欢：推荐类别智能推导（剧集/电影/动漫/综艺/纪录片）
  const recommendCategory = useMemo(() => {
    const combined = `${typeText || ''} ${videoTitle || ''}`.toLowerCase();
    if (combined.includes('漫') || combined.includes('动画') || combined.includes('番剧')) return 'anime';
    if (combined.includes('综艺')) return 'variety';
    if (combined.includes('纪录') || combined.includes('记录')) return 'documentary';
    if (
      combined.includes('剧') ||
      combined.includes('电视') ||
      combined.includes('连续剧') ||
      combined.includes('国产') ||
      combined.includes('美剧') ||
      combined.includes('韩剧')
    ) {
      return 'tv';
    }
    return 'movie';
  }, [typeText, videoTitle]);

  // 判断是否为剧集或动漫，以决定是否呈现当前单集介绍
  const isTvOrAnime = useMemo(() => {
    return recommendCategory === 'tv' || recommendCategory === 'anime' || episodes.length > 1;
  }, [recommendCategory, episodes.length]);

  const [recPage, setRecPage] = useState(0);
  const [recRefreshing, setRecRefreshing] = useState(false);
  useEffect(() => {
    setRecPage(0);
  }, [videoTitle]);

  const recommendQuery = useQuery({
    queryKey: ['watch-recommendations', recommendCategory, recPage, videoTitle],
    queryFn: async ({ signal }) => {
      // 1. 优先调用豆瓣同类题材推荐
      try {
        const res = await api.douban(recommendCategory, '热门', recPage * 12, 12, signal);
        if (res.items && res.items.length > 0) {
          const filtered = res.items.filter(
            (item) => item.title && !videoTitle.includes(item.title) && !item.title.includes(videoTitle)
          );
          if (filtered.length > 0) return filtered;
        }
      } catch {
        // 豆瓣源失败，尝试降级
      }

      // 2. 降级备用榜单（百度热播剧榜 / 豆瓣周榜）
      try {
        const hotKey = recommendCategory === 'tv' ? 'baidu_teleplay' : 'douban_weekly';
        const res = await api.hotList(hotKey, signal);
        if (res.items && res.items.length > 0) {
          return res.items.filter(
            (item) => item.title && !videoTitle.includes(item.title) && !item.title.includes(videoTitle)
          );
        }
      } catch {
        // 降级失败
      }
      return [];
    },
    staleTime: 5 * 60_000,
  });

  const handleRefreshRecommend = () => {
    setRecRefreshing(true);
    setRecPage((p) => (p + 1) % 5);
    setTimeout(() => setRecRefreshing(false), 500);
  };

  // 当前播放地址：优先取剧集列表中的当前集，其次直连 URL 参数
  const currentUrl = useMemo(() => {
    if (episodes.length > 0) {
      const idx = Math.min(Math.max(indexParam, 0), episodes.length - 1);
      return episodes[idx] || directUrl;
    }
    return directUrl;
  }, [episodes, indexParam, directUrl]);

  const currentIndex = useMemo(() => {
    if (episodes.length > 0) return Math.min(Math.max(indexParam, 0), episodes.length - 1);
    return indexParam;
  }, [episodes, indexParam]);

  const [epDescExpanded, setEpDescExpanded] = useState(false);
  useEffect(() => {
    setEpDescExpanded(false);
  }, [currentIndex, videoTitle]);

  // 当前分集剧情看点数据拉取（Bangumi / 上游分集剧情）
  const episodeIntroQuery = useQuery({
    queryKey: ['episode-intro', videoTitle, currentIndex + 1, recommendCategory],
    queryFn: async ({ signal }) => {
      if (!videoTitle || videoTitle === '未知视频') return null;
      const res = await fetch(
        `/api/media/episode-intro?title=${encodeURIComponent(videoTitle)}&episode=${currentIndex + 1}&type=${recommendCategory}`,
        { signal }
      );
      if (!res.ok) return null;
      return (await res.json()) as {
        ok: boolean;
        episode: number;
        title?: string;
        desc?: string;
        airdate?: string;
        duration?: string;
        source?: string;
      };
    },
    enabled: isTvOrAnime && Boolean(videoTitle && videoTitle !== '未知视频'),
    staleTime: 60 * 60_000,
  });

  const goEpisode = useCallback(
    (index: number) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set('index', String(index));
      sp.set('url', episodes[index] || directUrl);
      sp.delete('position');
      router.replace(`/watch?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams, episodes, directUrl]
  );

  // 进度恢复优先级：URL position 参数 > IndexedDB 记录
  const getRestorePosition = useCallback(async () => {
    const urlPos = parseInt(searchParams.get('position') || '0', 10) || 0;
    if (urlPos > 0) return urlPos;
    if (!vodId) return 0;
    const entry = await db.progress.get(progressKeyOf(sourceKey, vodId, currentIndex));
    return entry?.position ?? 0;
  }, [searchParams, sourceKey, vodId, currentIndex]);

  // 写入观看历史（进入页面即记录，进度后续增量更新）
  useEffect(() => {
    if (!verified || !sourceKey || !currentUrl) return;
    const timer = setTimeout(() => {
      upsertHistory({
        sourceKey,
        sourceUrl: source?.url,
        vodId: vodId || currentUrl,
        title: videoTitle,
        pic: detailQuery.data?.videoInfo?.cover,
        episodeIndex: currentIndex,
        totalEpisodes: episodes.length,
        playbackPosition: 0,
        duration: 0,
        timestamp: Date.now(),
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, sourceKey, vodId, currentIndex, videoTitle, currentUrl]);

  // 播放中与暂停时的进度落盘逻辑一致，共用同一回调
  const handleProgress = useCallback(
    (position: number, duration: number) => {
      currentPosRef.current = Math.round(position);
      if (vodId) {
        saveProgress(sourceKey, vodId, currentIndex, position, duration).catch(() => {});
        updateHistoryProgress(sourceKey, vodId || currentUrl, position, duration).catch(() => {});
      }
    },
    [sourceKey, vodId, currentIndex, currentUrl]
  );

  // 自动连播的 800ms 延迟切集要在卸载时取消，避免离开页面后跳转
  const autoNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
  }, []);

  const handleEnded = useCallback(() => {
    if (vodId) clearProgress(sourceKey, vodId, currentIndex).catch(() => {});
    if (store.autoplayNext && currentIndex < episodes.length - 1) {
      autoNextTimer.current = setTimeout(() => goEpisode(currentIndex + 1), 800);
    }
  }, [store.autoplayNext, currentIndex, episodes.length, goEpisode, sourceKey, vodId]);

  // 切换线路（保留当前集数与播放时间戳）
  const switchToCandidate = useCallback(
    (cand: CandidateItem, userInitiated = true) => {
      if (cand.source.key === sourceKey) return;
      if (userInitiated) {
        // 用户主动点击测试或换源，将其从失败受阻记录中解除
        failedSourcesRef.current.delete(cand.source.key);
        setFailedSources(new Set(failedSourcesRef.current));
      }
      const pos = currentPosRef.current;
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
    [sourceKey, currentIndex, videoTitle, router]
  );

  /** 关闭最优线路提示：不切换线路，若此前因弹框暂停则恢复播放 */
  const dismissSpeedSuggestion = useCallback(() => {
    setSpeedSuggestion(null);
    if (pausedByPromptRef.current) {
      pausedByPromptRef.current = false;
      playerRef.current?.play();
    }
  }, []);

  /** 确认切换到推荐线路：走既有换源逻辑，保留集数与播放进度 */
  const acceptSpeedSuggestion = useCallback(() => {
    const target = speedSuggestion;
    setSpeedSuggestion(null);
    pausedByPromptRef.current = false;
    if (target) switchToCandidate(target, true);
  }, [speedSuggestion, switchToCandidate]);

  // 全自动故障换源逻辑
  const autoFailoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleAutoFailover = useCallback(
    (reason: string) => {
      if (!sourceKey) return;
      failedSourcesRef.current.add(sourceKey);
      setFailedSources(new Set(failedSourcesRef.current));

      const viable = candidates.filter(
        (c) => c.source.key !== sourceKey && !failedSourcesRef.current.has(c.source.key)
      );

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
    [sourceKey, source?.name, candidates, toast, switchToCandidate]
  );

  useEffect(() => {
    return () => {
      if (autoFailoverTimerRef.current) clearTimeout(autoFailoverTimerRef.current);
    };
  }, []);

  // 详情接口加载失败时（源接口404/500/跨域失败等），自动切换至备用线路
  useEffect(() => {
    if (detailQuery.isError && sourceKey && !failedSourcesRef.current.has(sourceKey)) {
      const timer = setTimeout(() => {
        handleAutoFailover('数据源详情接口请求异常');
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [detailQuery.isError, sourceKey, handleAutoFailover]);

  // Alt+←/→ 集数切换快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        goEpisode(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < episodes.length - 1) {
        e.preventDefault();
        goEpisode(currentIndex + 1);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentIndex, episodes.length, goEpisode]);

  const orderedEpisodes = reversed ? [...episodes].map((_, i) => episodes.length - 1 - i) : episodes.map((_, i) => i);

  // 壳肉分离内核：启动 StreamSourceMatcher 流式并发秒播与备选线路流式补齐
  useEffect(() => {
    const targetTitle = titleParam || videoTitle;
    if (!targetTitle || targetTitle === '未知视频' || !verified || allCandidateSources.length === 0) return;

    const targetKey = `${targetTitle}:${doubanIdParam || ''}:${yearParam || ''}`;
    if (matcherKeyRef.current === targetKey) return;
    matcherKeyRef.current = targetKey;

    setIsMatching(true);
    setMatchingDone(false);
    setStreamMatchedList([]);

    // 以「能否解析出真实源」而非「URL 是否带 source 参数」为准：
    // sourceKey 存在但已失效（如切换源配置后遗留的 env 旧 key）时同样按无源处理，
    // 这样首次命中即可替换成合法 URL，避免直接落到「点播源不存在」死页。
    const hasInitialSource = Boolean(source && vodId);

    const matcher = new StreamSourceMatcher(
      {
        title: targetTitle,
        doubanId: doubanIdParam || undefined,
        year: yearParam || undefined,
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
          // 触发首源秒播替换路由：无有效源时（未带 source，或带的 source 已失效）
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
    // 依赖里带 source / hasStaleSource：切换源配置后旧的 sourceKey 从「有效」变为
    // 「失效」时，source 的引用会变化，需要重新启动匹配器走一遍自愈流程。
  }, [sourceKey, source, hasStaleSource, vodId, titleParam, videoTitle, doubanIdParam, yearParam, verified, allCandidateSources, router, indexParam]);

  if (!verified) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Spinner size="md" />
        <p className="text-faint text-xs">正在跳转至登录校验...</p>
      </div>
    );
  }

  if (!source) {
    // 失效源（如历史记录里的 env 旧 key）与「根本没带源」同路处理：
    // 先按片名重新匹配，匹配器会在首次命中时把 URL 换成合法源。
    if (titleParam && !matchingDone) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4">
          <Spinner size="lg" />
          <p className="text-sm text-content font-medium">
            {hasStaleSource
              ? `原播放源已失效，正在为「${titleParam}」重新匹配可用线路...`
              : `正在流式并发匹配「${titleParam}」播放源并秒开...`}
          </p>
          <p className="text-xs text-faint">
            {streamProgress
              ? `已检测 ${streamProgress.completed}/${streamProgress.total} 个源，命中 ${streamProgress.matched} 条线路`
              : `已连接 ${allCandidateSources.length} 个启用数据源并发池`}
          </p>
        </div>
      );
    }

    if (titleParam && matchingDone && streamMatchedList.length === 0) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <h1 className="text-content font-semibold text-lg mb-2">未找到该片源</h1>
            <p className="text-sm text-muted mb-5 leading-relaxed">
              {hasStaleSource
                ? `原播放源「${sourceKey}」已不存在，且当前启用的点播源中未匹配到「${titleParam}」。可在设置中重新添加该源，或返回首页重新选择。`
                : `当前启用的点播源中暂未匹配到「${titleParam}」。建议在右上角「设置」中开启更多点播源，或返回片库选择其他精彩影片。`}
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/catalog" className="btn-primary">进入片库大厅</Link>
              <Link href="/" className="btn-ghost">返回首页</Link>
            </div>
          </div>
        </div>
      );
    }

    // 走到这里说明既无可用源、也没有片名可供重新匹配（纯死链）。
    // 多为观看历史/收藏里的旧链接，已失去按片名自愈的条件。
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-content font-medium mb-2">点播源不存在</h1>
          <p className="text-sm text-muted mb-4">
            该视频来自点播源「{sourceKey || '未知'}」，但它可能已被删除。请在设置中重新添加后重试。
          </p>
          <p className="text-xs text-faint mb-5">
            若这是从观看历史或收藏打开的旧链接，源配置变更后已无法自动恢复，建议删除该条记录或返回首页重新选择。
          </p>
          <Link href="/" className="btn-primary">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* 顶部自适应导航：杜绝移动端换行挤压、按键溢出 */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-3">
          <BackButton />
          <HomeButton />
          <div className="min-w-0 flex-1 px-1 sm:px-2">
            <h1 className="text-sm font-semibold text-content truncate leading-tight">{videoTitle}</h1>
            <p className="text-[11px] text-faint truncate mt-0.5">
              <span className="text-accent font-medium">{source.name}</span>
              {episodes.length > 0 && ` · 第 ${currentIndex + 1}/${episodes.length} 集`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              className="btn-ghost btn-sm hidden sm:inline-flex"
              onClick={() => {
                if (!currentUrl) return;
                enqueueDownload({
                  url: currentUrl,
                  title: `${videoTitle}${episodes.length > 1 ? ` 第${currentIndex + 1}集` : ''}`,
                  format: 'MP4',
                });
              }}
            >
              <Icon name="download" className="w-3.5 h-3.5 mr-1" />
              下载本集
            </button>
            <button
              className="btn-ghost btn-sm flex items-center gap-1 shrink-0"
              onClick={() => setSwitchOpen(true)}
              title="完整测速与换源面板"
            >
              <Icon name="bolt" className="w-3.5 h-3.5 text-accent" />
              <span className="hidden sm:inline">测速换源</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-2 sm:px-4 py-3 sm:py-5 overflow-x-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px] gap-4 sm:gap-5 items-start">
          {/* 左侧主视区：播放器 + 视频信息 + 就地选源面板 */}
          <div className="min-w-0 w-full space-y-3.5">
            <div className="relative aspect-video max-h-[72vh] w-full bg-black rounded-xl overflow-hidden shadow-2xl border border-line/40">
              {currentUrl ? (
                <PlayerShell
                  ref={playerRef}
                  url={currentUrl}
                  title={videoTitle}
                  adFilter={store.adFilter}
                  autoplayNext={store.autoplayNext}
                  episodeKey={`${sourceKey}:${vodId}:${currentIndex}`}
                  nextUrl={currentIndex + 1 < episodes.length ? episodes[currentIndex + 1] : undefined}
                  nextEpisodeKey={currentIndex + 1 < episodes.length ? `${sourceKey}:${vodId}:${currentIndex + 1}` : undefined}
                  getRestorePosition={getRestorePosition}
                  onTimeUpdate={handleProgress}
                  onPause={handleProgress}
                  onEnded={handleEnded}
                  onRequestSwitchSource={handleAutoFailover}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-3 bg-black/90">
                  {detailQuery.isLoading ? (
                    <Spinner size="lg" />
                  ) : (
                    <>
                      <p className="text-danger text-sm text-center">
                        {detailQuery.isError ? '视频详情获取失败，当前线路暂不可用' : '当前线路暂无可用播放地址'}
                      </p>
                      {candidates.filter((c) => c.source.key !== sourceKey).length > 0 && (
                        <button
                          type="button"
                          className="btn-primary text-xs px-3.5 py-1.5"
                          onClick={() => handleAutoFailover('当前线路无法播放')}
                        >
                          立即切换至备用线路
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 视频信息与快捷控制栏 */}
            <div className="mt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-content truncate leading-snug">{videoTitle}</h2>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                  <span className="tag bg-accent/15 text-accent font-medium">{source.name}</span>
                  {episodes.length > 0 && (
                    <span>
                      正在播放 第 {currentIndex + 1} 集（共 {episodes.length} 集
                      {videoInfo?.remarks ? ` · ${videoInfo.remarks}` : ''}）
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="btn btn-sm btn-ghost px-2.5"
                  disabled={currentIndex <= 0}
                  onClick={() => goEpisode(currentIndex - 1)}
                  title="上一集 (Alt+←)"
                >
                  上一集
                </button>
                <button
                  className="btn btn-sm btn-ghost px-2.5"
                  disabled={episodes.length === 0 || currentIndex >= episodes.length - 1}
                  onClick={() => goEpisode(currentIndex + 1)}
                  title="下一集 (Alt+→)"
                >
                  下一集
                </button>
                <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none px-2 py-1 rounded-md bg-chip/40 hover:bg-chip transition-colors">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[#2563eb]"
                    checked={store.autoplayNext}
                    onChange={(e) => store.updateSettings({ autoplayNext: e.target.checked })}
                  />
                  自动连播
                </label>
              </div>
            </div>

            {/* 播放线路 / 来源切换栏（横向滚动 Pill 药丸设计） */}
            <div className="p-3 sm:p-3.5 bg-surface-raised rounded-xl border border-line shadow-sm min-w-0 max-w-full overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-content flex items-center gap-1.5">
                    <Icon name="bolt" className="w-3.5 h-3.5 text-accent" />
                    播放线路
                  </span>
                  <span className="text-[11px] text-faint">
                    {isMatching || candidatesQuery.isLoading
                      ? streamProgress
                        ? `正在流式并发探测可用线路... 已检测 ${streamProgress.completed}/${streamProgress.total}，命中 ${streamProgress.matched} 条`
                        : '正在流式并发探测可用线路...'
                      : speedTesting
                        ? '线路匹配完成，正在测速比优...'
                        : `共 ${candidates.length} 条高速线路`}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  onClick={() => setSwitchOpen(true)}
                  title="打开测速弹窗查看详细延迟与各源集数"
                >
                  <span>测速面板</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* 线路水平滚动按钮栏 */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar scroll-smooth w-full min-w-0">
                {candidates.map((c) => {
                  const isCurrent = c.source.key === sourceKey;
                  const isFailed = failedSources.has(c.source.key);
                  return (
                    <button
                      key={c.source.key}
                      type="button"
                      onClick={() => switchToCandidate(c, true)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 border shrink-0 touch-manipulation',
                        isCurrent
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : isFailed
                            ? 'bg-surface text-danger/80 border-danger/30 hover:border-danger/60'
                            : 'bg-surface hover:bg-hover text-muted hover:text-content border-line'
                      )}
                      title={isFailed ? '该线路刚刚发生播放故障，点击可重新尝试' : c.source.name}
                    >
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          isCurrent ? 'bg-white animate-pulse' : isFailed ? 'bg-danger' : 'bg-emerald-500'
                        )}
                      />
                      <span>{c.source.name}</span>
                      {c.result.remarks && (
                        <span className="text-[10px] opacity-80 font-mono">
                          ({c.result.remarks})
                        </span>
                      )}
                      {c.ms ? (
                        <span className="text-[10px] text-emerald-400 font-mono">
                          · {c.ms}ms
                        </span>
                      ) : null}
                      {isCurrent && <span className="text-[10px] opacity-80 font-normal">（当前）</span>}
                      {isFailed && !isCurrent && <span className="text-[10px] text-danger">（受阻）</span>}
                    </button>
                  );
                })}
                {candidatesQuery.isLoading && (
                  <span className="text-xs text-faint flex items-center gap-1.5 px-2 py-1 shrink-0">
                    <Spinner size="sm" /> 正在搜寻其他线路...
                  </span>
                )}
                {!candidatesQuery.isLoading && candidates.length === 0 && (
                  <span className="text-xs text-faint px-1 shrink-0">未找到其他同名播放线路</span>
                )}
              </div>
            </div>
          </div>

          {/* 右侧侧栏（Web 模式下：剧集选集 + 影片海报/演职员/概述；移动端顺位在播放器下方） */}
          <WatchSidebar
            episodes={episodes}
            orderedEpisodes={orderedEpisodes}
            currentIndex={currentIndex}
            goEpisode={goEpisode}
            reversed={reversed}
            setReversed={setReversed}
            detailQuery={detailQuery}
            isTvOrAnime={isTvOrAnime}
            episodeIntroQuery={episodeIntroQuery}
            epDescExpanded={epDescExpanded}
            setEpDescExpanded={setEpDescExpanded}
            descExpanded={descExpanded}
            setDescExpanded={setDescExpanded}
            videoTitle={videoTitle}
            yearText={yearText}
            typeText={typeText}
            areaText={areaText}
            remarksText={remarksText}
            actorList={actorList}
            directorList={directorList}
            cleanDesc={cleanDesc}
            extraPics={extraPics}
            activePoster={activePoster}
            setSelectedPoster={setSelectedPoster}
            store={store}
            router={router}
          />
        </div>

        {/* 猜你喜欢（全宽智能推荐流，iPad & Mobile 自适应多列网格） */}
        <section className="mt-8 pt-6 border-t border-line/60 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-5 rounded-full bg-accent shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-content">猜你喜欢</h2>
              <span className="text-xs text-faint hidden sm:inline">
                {recommendCategory === 'tv'
                  ? '根据当前剧集精选热门电视剧'
                  : recommendCategory === 'anime'
                    ? '精选热门动漫番剧'
                    : recommendCategory === 'variety'
                      ? '精选热门综艺节目'
                      : '精选高分热门电影'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleRefreshRecommend}
              disabled={recommendQuery.isLoading || recRefreshing}
              className="text-xs text-accent hover:text-accent/80 font-medium flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface hover:bg-hover border border-line transition-colors cursor-pointer disabled:opacity-50"
              title="换一批推荐"
            >
              <Icon
                name="refresh"
                className={cn('w-3.5 h-3.5', (recommendQuery.isLoading || recRefreshing) && 'animate-spin')}
              />
              <span>换一批</span>
            </button>
          </div>

          {recommendQuery.isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] rounded-xl bg-chip/40 animate-pulse border border-line/40" />
              ))}
            </div>
          ) : (recommendQuery.data?.length ?? 0) === 0 ? (
            <EmptyState variant="plain" title="暂无相关推荐" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
              {recommendQuery.data!.slice(0, 12).map((item) => (
                <DoubanCard
                  key={item.id || item.title}
                  item={item}
                  onClick={() => router.push(buildWatchUrl({ title: item.title }))}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {switchOpen && (
        <SwitchSourceModal
          currentTitle={videoTitle}
          currentSourceKey={sourceKey}
          currentVodId={vodId}
          currentIndex={currentIndex}
          currentPosition={currentPosRef.current}
          onClose={() => setSwitchOpen(false)}
        />
      )}

      {speedSuggestion && (
        <SpeedSuggestionDialog
          currentSourceName={source?.name || sourceKey}
          target={speedSuggestion}
          onAccept={acceptSpeedSuggestion}
          onDismiss={dismissSpeedSuggestion}
        />
      )}
    </div>
  );
}

/**
 * 最优线路提示弹框。
 *
 * 展示时机：后台匹配与测速完成后，发现有线路明显快于当前线路时。
 * 弹出期间播放已在父组件中暂停（仅当原本处于播放态才暂停），
 * 选择「保持当前线路」会恢复播放，避免问一句就打断一次观看。
 * 点击遮罩或按 Esc 均视为「保持当前」，与直觉一致。
 */
