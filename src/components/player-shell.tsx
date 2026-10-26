'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Artplayer from 'artplayer';

import { formatTime } from '@/lib/utils';
import { getShowPreciseSkip, saveShowPreciseSkip, type PreciseSkipConfig } from '@/lib/precise-skip';

import { useHlsPipeline, type PipelineProps } from '@/features/player/use-hls-pipeline';
import { useSubtitleTrack } from '@/features/player/use-subtitle-track';
import { usePlayerShortcuts } from '@/features/player/use-player-shortcuts';
import { useTouchSpeedBoost } from '@/features/player/use-touch-speed';
import { buildSkipSettings } from '@/features/player/skip-settings';
import { SubtitleLayer } from '@/features/player/subtitle-layer';
import { SkipPills } from '@/features/player/skip-pills';
import { EpisodeDrawer } from '@/features/player/episode-drawer';

interface PlayerShellProps {
  url: string;
  title: string;
  adFilter: boolean;
  autoplayNext: boolean;
  /** 剧集标识 `${source}:${vodId}:${episodeIndex}`（片段缓存按集淘汰的分组键） */
  episodeKey?: string;
  /** 下一集 m3u8 地址：当前集预取完成后预热下一集前 7 分钟 */
  nextUrl?: string;
  nextEpisodeKey?: string;
  /** 进度恢复：优先 URL position，其次查询该回调（返回 0 表示无记录） */
  getRestorePosition?: () => number | Promise<number>;
  onTimeUpdate?: (position: number, duration: number) => void;
  onEnded?: () => void;
  onPause?: (position: number, duration: number) => void;
  /** 恢复策略判源不可用（重试耗尽/格式硬失败）时回调：父级弹出换源面板 */
  onRequestSwitchSource?: (reason: string) => void;
  /** 剧集名称列表（多集时启用播放器右侧贴边感应「悬浮选集抽屉」，全屏下无需退出即可秒切集数） */
  episodes?: string[];
  /** 当前正在播放的集数索引（0-based） */
  currentEpisodeIndex?: number;
  /** 播放器内悬浮选集抽屉切集回调 */
  onSelectEpisode?: (index: number) => void;
}

/**
 * 播放器外壳：ArtPlayer + hls.js（旧版 player.js 的 React 化）。
 * 保留：广告分片过滤、自动连播回调、进度回调、快捷键、移动端长按倍速、错误恢复。
 * 移除：DOM 手工操作、watch.html 跳转链、localStorage 状态总线。
 *
 * 关键设计：ArtPlayer 实例只在挂载时创建一次，换集（url 变化）只「切换 HLS 源」
 * 而不销毁重建。否则在「网页全屏（页面全屏）」下整实例重建会丢失全屏上下文、
 * 重建 <video> 元素，触发「黑屏有声」的渲染竞态。
 *
 * 媒体生命周期（HLS 挂载/换源、错误恢复、预取调度、字幕刷新、跳过判定）
 * 全部委托给 useHlsPipeline；字幕状态在 useSubtitleTrack；
 * 快捷键/长按倍速在 usePlayerShortcuts/useTouchSpeedBoost；
 * UI 浮层（字幕层/跳过药丸/选集抽屉）为独立组件。
 */
export interface PlayerShellHandle {
  /** 暂停播放；返回是否成功 */
  pause: () => boolean;
  /** 恢复播放；wasPlaying 为 true 时表示此前处于播放态 */
  play: () => void;
  /** 当前是否处于播放中 */
  isPlaying: () => boolean;
  /** 当前播放秒数 */
  getCurrentTime: () => number;
  /** 挂载本地外挂字幕（SRT / WebVTT 文本），返回成功解析的字幕条数 */
  loadSubtitle: (content: string, label?: string) => number;
  /** 将当前播放秒数设为本剧片头结束点，返回标记的秒数 */
  markCurrentAsIntroEnd: () => number;
  /** 切换画中画（Picture-in-Picture）悬浮小窗模式 */
  togglePip: () => Promise<boolean>;
}

export const PlayerShell = forwardRef<PlayerShellHandle, PlayerShellProps>((props, ref) => {
  const {
    url,
    title,
    adFilter,
    autoplayNext,
    episodeKey,
    nextUrl,
    nextEpisodeKey,
    getRestorePosition,
    onTimeUpdate,
    onEnded,
    onPause,
    onRequestSwitchSource,
    episodes = [],
    currentEpisodeIndex = 0,
    onSelectEpisode,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const artRef = useRef<any>(null);

  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [showPoster, setShowPoster] = useState(true);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 全屏/播放器内右侧贴边感应「悬浮选集抽屉」挂载点
  // （需挂在容器内以脱离父级 overflow:hidden 限制，兼容普通态/网页全屏/系统全屏）
  const [epPortalHost, setEpPortalHost] = useState<HTMLDivElement | null>(null);

  // 精准跳过片头片尾状态（9zhoukj 机制：每剧独立记忆 + 毫秒级打点）
  const showKey = episodeKey ? episodeKey.split(':').slice(0, 2).join(':') : (title || '').split(' ')[0] || 'default';
  const showKeyRef = useRef(showKey);
  showKeyRef.current = showKey;
  const [skipConfig, setSkipConfig] = useState<PreciseSkipConfig>(() => getShowPreciseSkip(showKey));
  const skipConfigRef = useRef(skipConfig);
  skipConfigRef.current = skipConfig;

  // 跳过浮层状态（由管线的事件处理驱动）
  const [showSkipOpening, setShowSkipOpening] = useState(false);
  const [showSkipEnding, setShowSkipEnding] = useState(false);
  const [undoIntro, setUndoIntro] = useState(false);
  const hasSkippedOpeningRef = useRef(false);
  const hasJumpedEndingRef = useRef(false);
  const endedRef = useRef(false);

  // 外挂字幕状态机
  const subtitle = useSubtitleTrack();

  const showHint = useCallback((text: string) => {
    setHint(text);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHint(''), 2500);
  }, []);
  const showHintRef = useRef(showHint);
  showHintRef.current = showHint;

  // 始终持有最新 props/回调，避免重建播放器
  const propsRef = useRef<PipelineProps>({
    url,
    title,
    adFilter,
    autoplayNext,
    episodeKey,
    nextUrl,
    nextEpisodeKey,
    getRestorePosition,
    onTimeUpdate,
    onEnded,
    onPause,
    onRequestSwitchSource,
  });
  propsRef.current = {
    url,
    title,
    adFilter,
    autoplayNext,
    episodeKey,
    nextUrl,
    nextEpisodeKey,
    getRestorePosition,
    onTimeUpdate,
    onEnded,
    onPause,
    onRequestSwitchSource,
  };

  const skipRefs = useMemo(
    () => ({ config: skipConfigRef, hasSkippedOpening: hasSkippedOpeningRef, hasJumpedEnding: hasJumpedEndingRef, ended: endedRef }),
    [skipConfigRef, hasSkippedOpeningRef, hasJumpedEndingRef, endedRef]
  );

  // HLS 播放管线（换源/错误恢复/预取/字幕刷新/跳过判定/事件处理）
  const {
    setupHls,
    loadEpisode,
    flushProgress,
    destroy: destroyPipeline,
    handleTimeUpdate,
    handleSeeked,
    handlePause,
    handleWaiting,
    handlePlaying,
    handleEnded,
    handleVideoError,
    handleLoadedMetadata,
    getCurrentMediaUrl,
  } = useHlsPipeline({
    artRef,
    propsRef,
    showHint,
    setError,
    setShowPoster,
    refreshSubtitle: subtitle.refresh,
    skipRefs,
    setShowSkipOpening,
    setShowSkipEnding,
    setUndoIntro,
  });

  // 键盘快捷键 + 移动端长按 3 倍速
  usePlayerShortcuts(artRef, showHintRef);
  useTouchSpeedBoost(containerRef, artRef, showHintRef);

  // —— 创建播放器（仅一次，挂载即创建） ——
  useEffect(() => {
    if (!containerRef.current || !propsRef.current.url) return;
    const initialUrl = propsRef.current.url;

    const art = new Artplayer({
      container: containerRef.current,
      url: initialUrl,
      type: 'm3u8',
      volume: 0.8,
      autoplay: true,
      pip: true,
      autoMini: false,
      screenshot: true,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      miniProgressBar: true,
      mutex: true,
      backdrop: true,
      playsInline: true,
      airplay: true,
      hotkey: false,
      theme: '#2563eb',
      lang: navigator.language.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en',
      moreVideoAttr: { crossOrigin: 'anonymous', playsInline: true },
      // 「自动跳过片头片尾」设置面板（打点按剧记忆）
      settings: buildSkipSettings({
        skipConfigRef,
        showKeyRef,
        getCurrentTime: () => artRef.current?.currentTime || 0,
        getDuration: () => artRef.current?.duration || 0,
        closeSettings: () => {
          const art = artRef.current;
          if (art) art.setting.show = false;
        },
        onToggleAutoJump: (next) => setSkipConfig((prev) => ({ ...prev, autoJump: next })),
        onConfigUpdate: (partial) => setSkipConfig((prev) => ({ ...prev, ...partial })),
        showHint,
      }),
      customType: {
        m3u8: (video: HTMLVideoElement, mediaUrl: string) => {
          setupHls(video, mediaUrl, true);
        },
      },
    });
    artRef.current = art;
    const epHost = document.createElement('div');
    epHost.className = 'libretv-ep-portal-host';
    containerRef.current.appendChild(epHost);
    setEpPortalHost(epHost);

    // 事件处理全部委托给管线（处理器均为稳定回调）
    art.on('video:loadedmetadata', () => handleLoadedMetadata());
    art.on('video:playing', () => handlePlaying());
    art.on('video:error', () => handleVideoError());
    art.on('video:timeupdate', () => {
      handleTimeUpdate(art.currentTime, art.duration, Date.now());
    });
    art.on('video:seeked', () => handleSeeked());
    art.on('video:pause', () => handlePause());
    art.on('video:waiting', () => handleWaiting());
    art.on('video:ended', () => handleEnded());

    // 卸载与页面隐藏时保存进度
    const saveOnHide = () => {
      if (document.visibilityState === 'hidden') {
        propsRef.current.onPause?.(art.currentTime, art.duration);
      }
    };
    document.addEventListener('visibilitychange', saveOnHide);

    return () => {
      document.removeEventListener('visibilitychange', saveOnHide);
      // 卸载前刷一次最终进度，避免丢失最后几秒。
      // 已自然播完的集数不回写，避免覆盖 onEnded 里清除的「已看完」记录
      flushProgress();
      destroyPipeline();
      epHost.remove();
      setEpPortalHost(null);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      art.destroy();
      artRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // —— 换集：仅切换 HLS 源，不重建播放器（保留网页全屏等状态） ——
  const firstUrlRef = useRef(true);
  useEffect(() => {
    // 挂载时的首次由创建 effect 的 customType 触发，跳过避免重复加载
    if (firstUrlRef.current) {
      firstUrlRef.current = false;
      return;
    }
    loadEpisode(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // —— 广告过滤开关变化：重建 HLS loader（无需重建整个播放器） ——
  const firstAdFilterRef = useRef(true);
  useEffect(() => {
    if (firstAdFilterRef.current) {
      firstAdFilterRef.current = false;
      return;
    }
    if (getCurrentMediaUrl()) {
      // 用当前实际媒体地址：代理回退生效时切广告过滤不应跳回直连形式
      loadEpisode(getCurrentMediaUrl() || propsRef.current.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adFilter]);

  // 供上层调用的稳定字幕挂载逻辑（命令面板复用）
  const loadSubtitle = useCallback(
    (content: string, label?: string) => {
      const count = subtitle.loadSubtitle(content, label);
      showHint(count > 0 ? `已挂载字幕「${label || '外挂字幕'}」(${count} 条)` : '字幕解析为空，请检查格式');
      return count;
    },
    [subtitle, showHint]
  );

  // 对外暴露播放控制与字幕/片头快捷操作
  useImperativeHandle(
    ref,
    () => ({
      pause: () => {
        const art = artRef.current;
        if (!art || typeof art.pause !== 'function') return false;
        art.pause();
        return true;
      },
      play: () => {
        const art = artRef.current;
        if (!art || typeof art.play !== 'function') return;
        art.play();
      },
      isPlaying: () => Boolean(artRef.current?.playing),
      getCurrentTime: () => Number(artRef.current?.currentTime || 0),
      loadSubtitle,
      markCurrentAsIntroEnd: () => {
        const cur = Math.round(Number(artRef.current?.currentTime || 0));
        if (cur > 0) {
          saveShowPreciseSkip(showKeyRef.current, { headEnd: cur });
          setSkipConfig((prev) => ({ ...prev, headEnd: cur, isCustomMarked: true }));
          showHint(`已记忆本剧片头结束点：${formatTime(cur)}`);
        }
        return cur;
      },
      togglePip: async () => {
        const art = artRef.current;
        if (!art) return false;
        try {
          // 优先走标准 Picture-in-Picture API（需用户手势触发，能直接用点击上下文）
          const video = art.video as HTMLVideoElement | undefined;
          if (typeof document !== 'undefined' && document.pictureInPictureElement) {
            await document.exitPictureInPicture();
            showHint('已退出画中画小窗');
            return false;
          }
          if (video && typeof video.requestPictureInPicture === 'function') {
            await video.requestPictureInPicture();
            showHint('已开启画中画悬浮小窗');
            return true;
          }
          // 兜底：普通视频元素不支持时降级使用 art.pip 自身状态
          art.pip = !art.pip;
          return Boolean(art.pip);
        } catch {
          showHint('当前浏览器或视频暂不支持画中画小窗');
          return false;
        }
      },
    }),
    [showHint, loadSubtitle]
  );

  // 字幕时间轴微调（胶囊按钮点击时给出偏移提示）
  const adjustSubOffset = (delta: number) => {
    const next = subtitle.adjustOffset(delta);
    showHint(`字幕时间轴偏移：${next >= 0 ? `+${next}` : next}s`);
  };

  return (
    <div
      className="relative w-full h-full"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        if (!/\.(srt|vtt|ass)$/i.test(file.name)) {
          showHint('请拖入 .srt 或 .vtt 字幕文件');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result || '');
          loadSubtitle(text, file.name);
        };
        reader.readAsText(file, 'utf-8');
      }}
    >
      <div ref={containerRef} className="w-full h-full" style={{ WebkitTouchCallout: 'none' }} />

      {/* 外挂字幕渲染层 + 时间轴校准胶囊 */}
      <SubtitleLayer
        activeSubText={subtitle.activeText}
        subtitleLabel={subtitle.label}
        subtitleOffset={subtitle.offset}
        error={error}
        onAdjustOffset={adjustSubOffset}
        onClear={() => {
          subtitle.clearSubtitle();
          showHint('已卸载外挂字幕');
        }}
      />

      {/* 静音海报层 */}
      {showPoster && !error && (
        <div
          className="absolute inset-0 bg-black pointer-events-none"
          style={{
            backgroundImage: 'url(/player-poster.png)',
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      )}

      {/* 错误状态 */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-4 z-30 animate-fade-in">
          <p className="text-danger text-sm font-medium text-center">{error}</p>
          <div className="flex items-center gap-2">
            {propsRef.current.onRequestSwitchSource && (
              <button
                type="button"
                className="btn-primary text-xs px-3 py-1.5"
                onClick={() => propsRef.current.onRequestSwitchSource?.('用户手动换源')}
              >
                自动切换至备用线路
              </button>
            )}
            <button
              type="button"
              className="btn-ghost text-xs px-3 py-1.5"
              onClick={() => location.reload()}
            >
              重新加载
            </button>
          </div>
        </div>
      )}

      {/* 操作提示 */}
      {hint && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-3 py-1.5 rounded-full pointer-events-none animate-fade-in">
          {hint}
        </div>
      )}

      {/* 自动连播徽标 */}
      {autoplayNext && !error && (
        <div className="absolute bottom-16 right-3 text-[10px] text-muted bg-black/50 px-2 py-0.5 rounded pointer-events-none">
          自动连播已开启
        </div>
      )}

      {/* 精准跳过片头片尾浮层药丸 */}
      <SkipPills
        showSkipOpening={showSkipOpening}
        showSkipEnding={showSkipEnding}
        undoIntro={undoIntro}
        skipConfig={skipConfig}
        error={error}
        onSkipOpening={() => {
          const art = artRef.current;
          if (art) {
            art.currentTime = skipConfig.headEnd;
            hasSkippedOpeningRef.current = true;
            setShowSkipOpening(false);
            showHint(`已跳过片头 (${formatTime(skipConfig.headEnd)})`);
          }
        }}
        onMarkHead={() => {
          const art = artRef.current;
          if (!art) return;
          const cur = Math.round(art.currentTime);
          if (cur > 3) {
            saveShowPreciseSkip(showKeyRef.current, { headEnd: cur });
            setSkipConfig((prev) => ({ ...prev, headEnd: cur, isCustomMarked: true }));
            showHint(`已记住本剧片头结束点：${formatTime(cur)}`);
          } else {
            showHint('请拖动或播放至片头结束处再点击标记');
          }
        }}
        onSkipEnding={() => {
          const art = artRef.current;
          if (!art) return;
          hasJumpedEndingRef.current = true;
          setShowSkipEnding(false);
          endedRef.current = true;
          propsRef.current.onEnded?.();
          showHint('已跳过片尾，播放下一集');
        }}
        onUndoIntro={() => {
          const art = artRef.current;
          if (art) {
            art.currentTime = 0;
            setUndoIntro(false);
            showHint('已返回视频开头');
          }
        }}
      />

      {/* 全屏/沉浸态右侧贴边感应「悬浮选集抽屉」（挂载于 ArtPlayer 容器内，全屏下无需退出即可秒切集数） */}
      {episodes.length > 1 && onSelectEpisode && !error && epPortalHost && (
        <EpisodeDrawer
          episodes={episodes}
          currentEpisodeIndex={currentEpisodeIndex}
          onSelectEpisode={onSelectEpisode}
          host={epPortalHost}
          onHint={showHint}
          subtitleLabel={subtitle.label}
        />
      )}
    </div>
  );
});

PlayerShell.displayName = 'PlayerShell';
