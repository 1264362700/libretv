'use client';

import { useEffect, type RefObject } from 'react';

/** 播放器实例上快捷键需要的最小结构 */
export interface ArtShortcutTarget {
  currentTime: number;
  duration: number;
  volume: number;
  toggle: () => void;
  fullscreen: boolean;
}

/**
 * 播放器键盘快捷键（旧版 hotkey:false + 自定义逻辑的移植）：
 * ←/→ 快退快进 5s、↑/↓ 音量、空格 播放暂停、F 全屏；
 * Alt+←/→ 由父层处理集数切换，此处仅拦截默认行为。
 * 输入框/按钮聚焦时不劫持按键，避免吞掉空格的默认激活。
 */
export function usePlayerShortcuts(
  artRef: RefObject<ArtShortcutTarget | null>,
  showHintRef: RefObject<(text: string) => void>
) {
  useEffect(() => {
    const shortcuts = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('button')) return;
      const current = artRef.current;
      if (!current) return;
      const showHint = showHintRef.current;
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); return; } // 由父层处理集数切换
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); return; }
      switch (e.key) {
        case 'ArrowLeft':
          if (current.currentTime > 5) { current.currentTime -= 5; showHint('快退 5s'); e.preventDefault(); }
          break;
        case 'ArrowRight':
          if (current.duration - current.currentTime > 5) { current.currentTime += 5; showHint('快进 5s'); e.preventDefault(); }
          break;
        case 'ArrowUp':
          if (current.volume < 1) { current.volume = Math.min(1, current.volume + 0.1); showHint(`音量 ${Math.round(current.volume * 100)}%`); e.preventDefault(); }
          break;
        case 'ArrowDown':
          if (current.volume > 0) { current.volume = Math.max(0, current.volume - 0.1); showHint(`音量 ${Math.round(current.volume * 100)}%`); e.preventDefault(); }
          break;
        case ' ':
          current.toggle(); showHint('播放/暂停'); e.preventDefault();
          break;
        case 'f': case 'F':
          current.fullscreen = !current.fullscreen; e.preventDefault();
          break;
      }
    };
    document.addEventListener('keydown', shortcuts);
    return () => document.removeEventListener('keydown', shortcuts);
  }, [artRef, showHintRef]);
}
