'use client';

import { useCallback, useRef, type RefObject } from 'react';
import Hls, { type HlsConfig } from 'hls.js';
import { PlaybackRecovery, describeHlsError } from '@/lib/playback-recovery';
import { createHlsLoader } from '@/lib/hls-loader';
import { getVideoPrefetcher, getNextEpisodePrefetcher } from '@/lib/video-prefetcher';
import { loadCacheSettings } from '@/lib/video-cache';
import { buildObfuscatedProxyUrl } from '@/lib/url-obfuscator';
import { formatTime } from '@/lib/utils';
import type { PreciseSkipConfig } from '@/lib/precise-skip';

/** ArtPlayer 实例上管线需要的最小结构（只读/写 currentTime/duration/video） */
export interface ArtPlayerLike {
  video: HTMLVideoElement;
  currentTime: number;
  duration: number;
}

/** 播放器外壳传入的运行期属性（由 propsRef 持有，随时可读最新值） */
export interface PipelineProps {
  url: string;
  title: string;
  adFilter: boolean;
  autoplayNext: boolean;
  episodeKey?: string;
  nextUrl?: string;
  nextEpisodeKey?: string;
  getRestorePosition?: () => number | Promise<number>;
  onTimeUpdate?: (position: number, duration: number) => void;
  onEnded?: () => void;
  onPause?: (position: number, duration: number) => void;
  onRequestSwitchSource?: (reason: string) => void;
}

interface SkipRefs {
  config: RefObject<PreciseSkipConfig>;
  hasSkippedOpening: RefObject<boolean>;
  hasJumpedEnding: RefObject<boolean>;
  ended: RefObject<boolean>;
}

interface UseHlsPipelineOptions {
  artRef: RefObject<ArtPlayerLike | null>;
  propsRef: RefObject<PipelineProps>;
  showHint: (text: string) => void;
  setError: (msg: string) => void;
  setShowPoster: (v: boolean) => void;
  /** timeupdate 时刷新外挂字幕对白（由 useSubtitleTrack 提供） */
  refreshSubtitle: (curTime: number) => void;
  skipRefs: SkipRefs;
  setShowSkipOpening: (v: boolean) => void;
  setShowSkipEnding: (v: boolean) => void;
  setUndoIntro: (v: boolean) => void;
}

/**
 * HLS 播放管线：负责 ArtPlayer 之下的全部媒体生命周期——
 * 实例创建后的 HLS 挂载/换源、错误恢复（直连失败代理回退）、进度恢复、
 * 片段预取调度，以及 timeupdate/seeked/pause/waiting/ended/error 事件处理。
 *
 * 关键设计（从 player-shell 迁入，行为不变）：
 * - 换集只重建 HLS 不销毁 ArtPlayer（保留网页全屏上下文）；
 * - 进度恢复每集一次，预取锚点取恢复目标避免白等纠错重建；
 * - 进度落盘 5s 节流；预取 30s 续跑 + 暂停黄金窗口；
 * - 代理回退用 currentMediaUrlRef 记录实际地址，预取 key 与之保持一致。
 */
export function useHlsPipeline({
  artRef,
  propsRef,
  showHint,
  setError,
  setShowPoster,
  refreshSubtitle,
  skipRefs,
  setShowSkipOpening,
  setShowSkipEnding,
  setUndoIntro,
}: UseHlsPipelineOptions) {
  // showHint 以 ref 持有，保证事件处理器（挂载时注册一次）始终读到最新闭包
  const showHintRef = useRef(showHint);
  showHintRef.current = showHint;
  const refreshSubtitleRef = useRef(refreshSubtitle);
  refreshSubtitleRef.current = refreshSubtitle;

  const hlsRef = useRef<Hls | null>(null);
  const currentMediaUrlRef = useRef('');
  const recoveryRef = useRef<PlaybackRecovery | null>(null);
  const mediaHealthyRef = useRef(true);
  const playbackStartedRef = useRef(false);
  const videoErrorRetryUsedRef = useRef(false);
  const restoredRef = useRef(false);
  const lastPrefetchEnsureRef = useRef(0);
  const endedRef = useRef(false);
  const lastSaveRef = useRef(0);

  // —— HLS 配置与预取 ——

  // 片段缓存开启时调大 hls.js 自身缓冲，缓冲之外的空窗由预取器补齐
  const buildHlsConfig = useCallback((): Partial<HlsConfig> => {
    const p = propsRef.current;
    const cacheSettings = loadCacheSettings();
    const cacheEnabled = cacheSettings.enabled && !!p.episodeKey;
    return {
      debug: false,
      enableWorker: true,
      backBufferLength: 90,
      maxBufferLength: cacheEnabled ? 120 : 30,
      maxMaxBufferLength: cacheEnabled ? 600 : 60,
      maxBufferSize: (cacheEnabled ? 90 : 30) * 1000 * 1000,
      maxBufferHole: 0.5,
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 1000,
      manifestLoadingMaxRetry: 3,
      manifestLoadingRetryDelay: 1000,
      startLevel: -1,
      abrEwmaDefaultEstimate: 500_000,
      appendErrorMaxRetry: 5,
      // 组合 loader：广告过滤（blockAd 随设置）+ 片段缓存命中（cacheEnabled）
      loader: createHlsLoader(Hls, { blockAd: p.adFilter }) as unknown as HlsConfig['loader'],
    };
  }, [propsRef]);

  // 当前集预取（episodeKey 缺省 = 关闭，见 ensure 内部 settings.enabled 判断）
  const ensurePrefetch = useCallback(
    (mediaUrl: string, currentTime: number, horizonSeconds?: number) => {
      const p = propsRef.current;
      if (!p.episodeKey) return;
      getVideoPrefetcher().ensure({
        m3u8Url: mediaUrl,
        currentTime,
        episodeKey: p.episodeKey,
        horizonSeconds,
        onProgress: (stats) => {
          // 当前集预取完成且存在下一集：用独立预取器预热下一集前 7 分钟
          if (stats.state === 'done' && p.nextUrl && p.nextEpisodeKey) {
            getNextEpisodePrefetcher().ensure({
              m3u8Url: p.nextUrl,
              currentTime: 0,
              episodeKey: p.nextEpisodeKey,
              horizonSeconds: 420,
            });
          }
        },
      });
    },
    [propsRef]
  );

  /**
   * 初始化/切换 HLS。allowProxyFallback：直连致命网络错误（CORS/防盗链/分片被拒）时，
   * 自动改走同源 cookie 鉴权的 /api/proxy 重试一次。
   * 注意：不销毁 ArtPlayer，只销毁并重建 hls，从而保留网页全屏等播放器状态。
   */
  const setupHls = useCallback(
    (video: HTMLVideoElement, mediaUrl: string, allowProxyFallback: boolean) => {
      hlsRef.current?.destroy();
      currentMediaUrlRef.current = mediaUrl;
      const hls = new Hls(buildHlsConfig());
      hlsRef.current = hls;

      hls.loadSource(mediaUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, async () => {
        recoveryRef.current?.markHealthy();
        // 预取锚点：恢复进度时直接取恢复目标。赋值后 video.currentTime 未必立刻反映
        // （Safari 系），而 ensure 是以「锚点未变」为前提复用 parsing 中的运行的——
        // 这里读到旧值会把窗口建在片头，且白等一次纠错重建。
        let prefetchAnchor = video.currentTime;
        // 进度恢复（每集一次）：优先 URL position，其次 IndexedDB 记录
        if (!restoredRef.current) {
          restoredRef.current = true;
          try {
            const saved = (await propsRef.current.getRestorePosition?.()) ?? 0;
            const duration = artRef.current?.duration || 0;
            if (saved > 10 && duration > 0 && saved < duration - 2) {
              const art = artRef.current;
              if (art) art.currentTime = saved;
              prefetchAnchor = saved;
              showHintRef.current(`已从 ${formatTime(saved)} 继续播放`);
            }
          } catch { /* 忽略恢复失败 */ }
        }
        // 新集立即预取（否则要等 timeupdate 的 30s 节流，起播初期无缓存）
        ensurePrefetch(mediaUrl, prefetchAnchor);
        video.play().catch(() => {});
      });
      // 播放链路恢复（FRAG_LOADED / MANIFEST_PARSED）：静默窗外清零连续失败计数
      hls.on(Hls.Events.FRAG_LOADED, () => recoveryRef.current?.markHealthy());
      // 分片真正进入 MSE buffer 才算媒体恢复：此时视频轨可渲染，错误态可解除
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        mediaHealthyRef.current = true;
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        const recovery = recoveryRef.current;
        if (!recovery) return;
        const decision = recovery.onFatal(data.type, data.details);
        switch (decision.action) {
          case 'ignore':
            break;
          case 'retry': {
            // 前两次重试保留直连；达到退避阈值或清单级错误时升级为代理形式
            // （同源 cookie 鉴权，规避 CORS/防盗链/分片被拒）
            if (
              allowProxyFallback &&
              !mediaUrl.startsWith('/api/proxy') &&
              (decision.attempt >= 2 || data.details === 'manifestLoadError')
            ) {
              showHintRef.current('直连失败，改用代理重试...');
              setupHls(video, buildObfuscatedProxyUrl(mediaUrl), false);
              return;
            }
            showHintRef.current(`${decision.reason}（第 ${decision.attempt} 次）...`);
            recovery.schedule(decision.delayMs, () => hls.startLoad());
            break;
          }
          case 'recover-media': {
            showHintRef.current(`${decision.reason}（第 ${decision.attempt} 次）...`);
            if (decision.swapAudio) hls.swapAudioCodec?.();
            hls.recoverMediaError();
            break;
          }
          case 'switch-source': {
            // 无论起播前或播放中，通知父级尝试自动切至可用备用线路
            const message = `${describeHlsError(data.type, data.details)}：${decision.reason}`;
            if (playbackStartedRef.current) {
              showHintRef.current(message);
            } else {
              setError(`视频加载失败，${message}，请尝试其他视频源`);
            }
            propsRef.current.onRequestSwitchSource?.(decision.reason);
            break;
          }
        }
      });
    },
    [artRef, propsRef, ensurePrefetch, setError, buildHlsConfig]
  );

  /** 换集：重置每集状态并切换到新 HLS 源（不重建 ArtPlayer）。 */
  const loadEpisode = useCallback(
    (targetUrl: string) => {
      if (!targetUrl) return;
      mediaHealthyRef.current = true;
      playbackStartedRef.current = false;
      videoErrorRetryUsedRef.current = false;
      restoredRef.current = false;
      lastPrefetchEnsureRef.current = 0;
      recoveryRef.current = new PlaybackRecovery();
      // 换集时清掉上一集的预取窗口，避免带宽被旧集占用
      getVideoPrefetcher().stop();
      skipRefs.hasSkippedOpening.current = false;
      skipRefs.hasJumpedEnding.current = false;
      setShowSkipOpening(false);
      setShowSkipEnding(false);
      setUndoIntro(false);
      setError('');
      setShowPoster(true);
      const art = artRef.current;
      if (!art) return;
      setupHls(art.video, targetUrl, true);
    },
    [artRef, setError, setShowPoster, setShowSkipOpening, setShowSkipEnding, setUndoIntro, skipRefs, setupHls]
  );

  // —— 事件处理器（挂载时由 player-shell 的 mount effect 注册一次，均为稳定回调） ——

  const handleTimeUpdate = useCallback(
    (curTime: number, dur: number, now: number) => {
      const cfg = skipRefs.config.current;

      // 实时刷新外挂字幕对白（由 useSubtitleTrack 内部做无变化跳过）
      refreshSubtitleRef.current(curTime);

      // 9zhoukj 片头精准跳过判定
      if (curTime < cfg.headEnd && curTime >= 0) {
        if (cfg.autoJump && !skipRefs.hasSkippedOpening.current && curTime < 5) {
          skipRefs.hasSkippedOpening.current = true;
          const art = artRef.current;
          if (art) art.currentTime = cfg.headEnd;
          setUndoIntro(true);
          setShowSkipOpening(false);
          setTimeout(() => setUndoIntro(false), 5000);
        } else if (!skipRefs.hasSkippedOpening.current) {
          setShowSkipOpening(true);
        }
      } else {
        setShowSkipOpening(false);
      }

      // 9zhoukj 片尾精准跳过与连播判定
      if (dur > 30 && cfg.tailOffset > 0 && curTime >= dur - cfg.tailOffset) {
        if (cfg.autoJump && !skipRefs.hasJumpedEnding.current) {
          skipRefs.hasJumpedEnding.current = true;
          skipRefs.ended.current = true;
          propsRef.current.onEnded?.();
          showHintRef.current('已为您跳过片尾，播放下一集');
        } else if (!skipRefs.hasJumpedEnding.current) {
          setShowSkipEnding(true);
        }
      } else {
        setShowSkipEnding(false);
      }

      if (now - lastSaveRef.current > 5000) {
        lastSaveRef.current = now;
        propsRef.current.onTimeUpdate?.(curTime, dur);
      }
      // 每 30s 续跑一次前向预取窗口（ensure 幂等，窗口未覆盖足够余量才会重建）
      if (now - lastPrefetchEnsureRef.current > 30_000) {
        lastPrefetchEnsureRef.current = now;
        // 用 currentMediaUrlRef（代理回退后的实际地址）：否则预取的 key 与
        // loader 读取的 key 不一致，缓存永不命中且直连 fetch 白耗流量
        ensurePrefetch(currentMediaUrlRef.current, curTime);
      }
    },
    [artRef, propsRef, skipRefs, setUndoIntro, setShowSkipOpening, setShowSkipEnding, ensurePrefetch]
  );

  const handleSeeked = useCallback(() => {
    const art = artRef.current;
    if (!art) return;
    ensurePrefetch(currentMediaUrlRef.current, art.currentTime);
  }, [artRef, ensurePrefetch]);

  const handlePause = useCallback(() => {
    const art = artRef.current;
    if (!art) return;
    propsRef.current.onPause?.(art.currentTime, art.duration);
    // 暂停 = 预取黄金窗口：解除限速并无限铺满整集（用户主动行为，带宽占用可接受）
    // waiting 触发的限速在此解除，否则黄金窗口会被 500ms 轮询冻结
    getVideoPrefetcher().setThrottled(false);
    ensurePrefetch(currentMediaUrlRef.current, art.currentTime, 0);
  }, [artRef, propsRef, ensurePrefetch]);

  const handleWaiting = useCallback(() => {
    // 卡顿：预取临时让出带宽给播放
    getVideoPrefetcher().setThrottled(true);
  }, []);

  const handlePlaying = useCallback(() => {
    playbackStartedRef.current = true;
    setShowPoster(false);
    // 仅在媒体真正恢复（有分片进入 buffer）后清错误遮罩：
    // 否则「视频轨挂了、音频轨先播出来」时会清掉遮罩，留下黑屏假死态
    if (mediaHealthyRef.current) setError('');
    // 播放恢复：解除预取限速
    getVideoPrefetcher().setThrottled(false);
  }, [setShowPoster, setError]);

  const handleEnded = useCallback(() => {
    skipRefs.ended.current = true;
    propsRef.current.onEnded?.();
  }, [propsRef, skipRefs]);

  const handleVideoError = useCallback(() => {
    mediaHealthyRef.current = false;
    // 起播阶段的 video 元素级错误（MSE/解码偶发失败）：重建一次播放链路自愈，
    // 而不是直接钉死错误遮罩——重建后视频轨重新 append，黑屏有声即可解除
    if (!playbackStartedRef.current && !videoErrorRetryUsedRef.current) {
      videoErrorRetryUsedRef.current = true;
      showHintRef.current('播放异常，正在重试...');
      const art = artRef.current;
      if (art) setupHls(art.video, currentMediaUrlRef.current, true);
      return;
    }
    setError('视频播放失败，请尝试其他视频源');
    propsRef.current.onRequestSwitchSource?.('播放器底层解码或加载异常');
  }, [artRef, propsRef, setError, setupHls]);

  const handleLoadedMetadata = useCallback(() => {
    const art = artRef.current as { title?: string } | null;
    if (art) art.title = propsRef.current.title;
  }, [artRef, propsRef]);

  /** 卸载清理：销毁 HLS、恢复策略与预取器 */
  const destroy = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
    recoveryRef.current?.dispose();
    getVideoPrefetcher().stop();
  }, []);

  /** 卸载前刷一次最终进度，避免丢失最后几秒；已自然播完的集数不回写 */
  const flushProgress = useCallback(() => {
    if (endedRef.current) return;
    const art = artRef.current;
    if (!art) return;
    try {
      propsRef.current.onPause?.(art.currentTime, art.duration);
    } catch { /* 忽略 */ }
  }, [artRef, propsRef]);

  const getCurrentMediaUrl = useCallback(() => currentMediaUrlRef.current, []);

  return {
    hlsRef,
    setupHls,
    loadEpisode,
    ensurePrefetch,
    handleTimeUpdate,
    handleSeeked,
    handlePause,
    handleWaiting,
    handlePlaying,
    handleEnded,
    handleVideoError,
    handleLoadedMetadata,
    destroy,
    flushProgress,
    getCurrentMediaUrl,
  };
}
