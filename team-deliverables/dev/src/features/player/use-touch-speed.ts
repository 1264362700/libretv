'use client';

import { useEffect, type RefObject } from 'react';

interface ArtTouchTarget {
  video: HTMLVideoElement;
}

/**
 * 移动端长按 3 倍速：
 * - 按住播放画面 500ms 后切到 3 倍速，松手恢复原倍速；
 * - 控制栏/设置面板/悬浮选集抽屉上的长按不触发（避免按住进度条拖动、长按选集按钮误触）；
 * - 抑制长按呼出的系统原生菜单（移动端构造函数跳过 ArtPlayer contextmenu 组件）。
 */
export function useTouchSpeedBoost(
  containerRef: RefObject<HTMLDivElement | null>,
  artRef: RefObject<ArtTouchTarget | null>,
  showHintRef: RefObject<(text: string) => void>
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let isLongPress = false;
    let originalRate = 1.0;

    const onTouchStart = (e: TouchEvent) => {
      const art = artRef.current;
      if (!art?.video || art.video.paused) return;
      // 已有触控在处理时忽略新手指：否则第二指会把 originalRate 捕获成 3.0，
      // 松手后倍速永久卡在 3x；旧定时器句柄也会被覆盖成无法清除的幽灵触发
      if (isLongPress || longPressTimer) return;
      // 控制栏 / 设置面板 / 悬浮选集抽屉上的长按不触发倍速
      if ((e.target as HTMLElement).closest?.('.art-controls, .art-settings, .libretv-ep-portal-host')) return;
      originalRate = art.video.playbackRate;
      longPressTimer = setTimeout(() => {
        if (art.video?.paused) return;
        art.video.playbackRate = 3.0;
        isLongPress = true;
        showHintRef.current('3 倍速');
      }, 500);
    };
    const onTouchEnd = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      const art = artRef.current;
      if (isLongPress && art?.video) {
        art.video.playbackRate = originalRate;
        isLongPress = false;
        showHintRef.current(`${originalRate} 倍速`);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isLongPress) e.preventDefault();
    };
    // ArtPlayer 的 contextmenu 组件只在桌面端初始化（移动端构造函数里跳过 init），
    // 长按倍速因而会连带呼出系统原生菜单/气泡。播放器表面没有可用的原生菜单，统一抑制
    const onContextMenu = (e: Event) => e.preventDefault();

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [containerRef, artRef, showHintRef]);
}
