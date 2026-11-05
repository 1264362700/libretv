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

/** HLS 画质档位定义 */
export interface HlsQualityLevel {
  index: number;
  height: number;
  width: number;
  bitrate: number;
  name: string;
  label: string;
}

/** HLS 内置音频轨道定义 */
export interface HlsAudioTrackItem {
  id: number;
  name: string;
  lang?: string;
  groupId?: string;
  default?: boolean;
}

export function formatQualityLabel(
  level: { height?: number; width?: number; bitrate?: number; name?: string },
  index: number
): string {
  if (level.name && level.name.trim() && !/^\d+$/.test(level.name.trim())) {
    return level.name.trim();
  }
  const h = level.height || 0;
  if (h >= 2160) return '4K 2160P';
  if (h >= 1440) return '2K 1440P';
  if (h >= 1080) return '1080P 高清';
  if (h >= 720) return '720P 高清';
  if (h >= 480) return '480P 标清';
  if (h >= 360) return '360P 流畅';
  if (h > 0) return `${h}P`;
  if (level.bitrate && level.bitrate > 0) {
    return `${Math.round(level.bitrate / 1000)} kbps`;
  }
  return `档位 ${index + 1}`;
}

export const QUALITY_STORAGE_KEY = 'libretv:quality_preference';

export function getStoredQualityPreference(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(QUALITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveQualityPreference(pref: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, pref);
  } catch {
    // ignore
  }
}

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
  onLevelsUpdated?: (levels: HlsQualityLevel[], currentLevel: number) => void;
  onAudioTracksUpdated?: (tracks: HlsAudioTrackItem[], currentTrack: number) => void;
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
  onLevelsUpdated,
  onAudioTracksUpdated,
}: UseHlsPipelineOptions) {
  // showHint 以 ref 持有，保证事件处理器（挂载时注册一次）始终读到最新闭包
  const showHintRef = useRef(showHint);
  showHintRef.current = showHint;
  const refreshSubtitleRef = useRef(refreshSubtitle);
  refreshSubtitleRef.current = refreshSubtitle;
  const onLevelsUpdatedRef = useRef(onLevelsUpdated);
  onLevelsUpdatedRef.current = onLevelsUpdated;
  const onAudioTracksUpdatedRef = useRef(onAudioTracksUpdated);
  onAudioTracksUpdatedRef.current = onAudioTracksUpdated;

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

  // 画质与音轨状态维护 (REQ-P0-01, REQ-P0-02)
  const levelsRef = useRef<HlsQualityLevel[]>([]);
  const currentLevelRef = useRef<number>(-1);
  const audioTracksRef = useRef<HlsAudioTrackItem[]>([]);
  const currentAudioTrackRef = useRef<number>(0);
  const manualStallsCountRef = useRef<number>(0);

  /** 切换画质档位（-1 为 Auto 自动，>= 0 为特定清晰度） */
  const switchLevel = useCallback((index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    currentLevelRef.current = index;
    manualStallsCountRef.current = 0;
    hls.currentLevel = index;
    if (index === -1) {
      saveQualityPreference('auto');
      showHintRef.current('已切回自适应画质 (Auto)');
    } else {
      const lvl = levelsRef.current[index];
      if (lvl) {
        saveQualityPreference(String(lvl.height || lvl.label));
        showHintRef.current(`正在切换画质至 ${lvl.label}...`);
      }
    }
    onLevelsUpdatedRef.current?.(levelsRef.current, index);
  }, []);

  /** 切换内置音频轨道（无缝平滑热切） */
  const setAudioTrack = useCallback((trackId: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    currentAudioTrackRef.current = trackId;
    hls.audioTrack = trackId;
    const track = audioTracksRef.current[trackId];
    showHintRef.current(track ? `正在无缝切换音轨至 ${track.name}...` : '正在无缝切换音轨...');
    onAudioTracksUpdatedRef.current?.(audioTracksRef.current, trackId);
  }, []);

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

        // 提取画质档位 (REQ-P0-01)
        const rawLevels = hls.levels || [];
        const parsedLevels: HlsQualityLevel[] = rawLevels.map((lvl, idx) => ({
          index: idx,
          height: lvl.height || 0,
          width: lvl.width || 0,
          bitrate: lvl.bitrate || 0,
          name: lvl.name || '',
          label: formatQualityLabel(lvl, idx),
        }));
        levelsRef.current = parsedLevels;

        // 恢复偏好画质（若存在且有多个清晰度档位）
        let targetLevel = -1;
        const savedPref = getStoredQualityPreference();
        if (savedPref && savedPref !== 'auto' && parsedLevels.length > 1) {
          const match = parsedLevels.find(
            (l) => String(l.height) === savedPref || l.label.includes(savedPref)
          );
          if (match) {
            targetLevel = match.index;
          }
        }
        currentLevelRef.current = targetLevel;
        hls.currentLevel = targetLevel;
        onLevelsUpdatedRef.current?.(parsedLevels, targetLevel);

        // 提取音频轨道 (REQ-P0-02)
        const rawTracks = hls.audioTracks || [];
        const parsedTracks: HlsAudioTrackItem[] = rawTracks.map((t, idx) => ({
          id: idx,
          name: t.name || t.lang || `音轨 ${idx + 1}`,
          lang: t.lang,
          groupId: t.groupId,
          default: t.default,
        }));
        audioTracksRef.current = parsedTracks;
        currentAudioTrackRef.current = hls.audioTrack ?? 0;
        onAudioTracksUpdatedRef.current?.(parsedTracks, currentAudioTrackRef.current);

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

      // 画质与音轨事件监听
      hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
        const activeLevel = data.level;
        if (currentLevelRef.current !== -1 && activeLevel === currentLevelRef.current) {
          const lvl = levelsRef.current[activeLevel];
          if (lvl) {
            showHintRef.current(`已切换至 ${lvl.label}`);
          }
        }
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_evt, data) => {
        const tracks = (data.audioTracks || hls.audioTracks || []).map((t, idx) => ({
          id: idx,
          name: t.name || t.lang || `音轨 ${idx + 1}`,
          lang: t.lang,
          groupId: t.groupId,
          default: t.default,
        }));
        audioTracksRef.current = tracks;
        currentAudioTrackRef.current = hls.audioTrack ?? 0;
        onAudioTracksUpdatedRef.current?.(tracks, currentAudioTrackRef.current);
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_evt, data) => {
        currentAudioTrackRef.current = data.id;
        onAudioTracksUpdatedRef.current?.(audioTracksRef.current, data.id);
      });

      // 播放链路恢复（FRAG_LOADED / MANIFEST_PARSED）：静默窗外清零连续失败计数
      hls.on(Hls.Events.FRAG_LOADED, () => recoveryRef.current?.markHealthy());
      // 分片真正进入 MSE buffer 才算媒体恢复：此时视频轨可渲染，错误态可解除
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        mediaHealthyRef.current = true;
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        // 弱网自适应降级保护 (CHK-Q-05)：手动锁定画质下遭遇严重卡顿重试 >= 3 次，自动降级回退至 Auto
        if (data.details === 'bufferStalledError' || data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (currentLevelRef.current !== -1) {
            manualStallsCountRef.current += 1;
            if (manualStallsCountRef.current >= 3) {
              manualStallsCountRef.current = 0;
              currentLevelRef.current = -1;
              hls.currentLevel = -1;
              showHintRef.current('当前网络环境不稳定，已为您临时切回自适应画质');
              onLevelsUpdatedRef.current?.(levelsRef.current, -1);
            }
          }
        }

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

      // 换集重置画质与音轨列表，防止上一集残留 (CHK-A-05)
      levelsRef.current = [];
      audioTracksRef.current = [];
      manualStallsCountRef.current = 0;
      onLevelsUpdatedRef.current?.([], -1);
      onAudioTracksUpdatedRef.current?.([], 0);

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
    manualStallsCountRef.current = 0;
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
    switchLevel,
    setAudioTrack,
    getLevels: () => levelsRef.current,
    getAudioTracks: () => audioTracksRef.current,
    getCurrentLevel: () => currentLevelRef.current,
    getCurrentAudioTrack: () => currentAudioTrackRef.current,
  };
}
