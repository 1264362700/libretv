'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { findActiveSubtitleText, parseSubtitles, type SubtitleCue } from '@/lib/subtitle-parser';

export function getSubtitleOffsetStorageKey(showKey: string): string {
  return `libretv:sub_offset:${showKey}`;
}

export function getStoredSubtitleOffset(showKey?: string): number {
  if (!showKey || typeof window === 'undefined') return 0;
  try {
    const val = localStorage.getItem(getSubtitleOffsetStorageKey(showKey));
    if (val === null) return 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  } catch {
    return 0;
  }
}

export function saveStoredSubtitleOffset(showKey: string, offset: number): void {
  if (!showKey || typeof window === 'undefined') return;
  try {
    localStorage.setItem(getSubtitleOffsetStorageKey(showKey), String(offset));
  } catch {
    // ignore
  }
}

export function removeStoredSubtitleOffset(showKey: string): void {
  if (!showKey || typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getSubtitleOffsetStorageKey(showKey));
  } catch {
    // ignore
  }
}

/**
 * 外挂字幕状态机 (REQ-P1-01):
 * - 解析 SRT/VTT 文本为字幕条；
 * - 按播放时间点实时刷新当前对白（timeupdate 驱动）；
 * - 多档阶梯微调（±0.5s, ±1.0s, ±2.5s）与一键归零；
 * - 基于剧集唯一标识（showKey）在 localStorage 进行本地持久化记忆；
 * - 挂载/卸载生命周期管理。
 */
export function useSubtitleTrack(
  showKey?: string,
  onRestoredOffset?: (offset: number) => void
) {
  const cuesRef = useRef<SubtitleCue[]>([]);
  const offsetRef = useRef(0);
  const [label, setLabel] = useState('');
  const [offset, setOffset] = useState(0);
  const [activeText, setActiveText] = useState('');

  const showKeyRef = useRef(showKey);
  showKeyRef.current = showKey;

  // 剧集唯一标识变化时，自动尝试从本地恢复该剧已记忆的外挂字幕偏移 (CHK-S-04)
  useEffect(() => {
    if (!showKey) return;
    const saved = getStoredSubtitleOffset(showKey);
    if (saved !== 0 && cuesRef.current.length > 0) {
      offsetRef.current = saved;
      setOffset(saved);
      onRestoredOffset?.(saved);
    }
  }, [showKey, onRestoredOffset]);

  /** 解析并挂载字幕，返回解析出的字幕条数（0 表示格式无效） */
  const loadSubtitle = useCallback(
    (content: string, subLabel = '外挂字幕') => {
      const cues = parseSubtitles(content);
      cuesRef.current = cues;

      // 挂载时优先从 localStorage 读取本剧历史偏移
      const saved = getStoredSubtitleOffset(showKeyRef.current);
      offsetRef.current = saved;
      setOffset(saved);
      setLabel(cues.length > 0 ? subLabel : '');
      setActiveText('');
      if (saved !== 0 && cues.length > 0) {
        onRestoredOffset?.(saved);
      }
      return cues.length;
    },
    [onRestoredOffset]
  );

  /** 阶梯微调字幕时间轴（如 ±0.5s, ±1.0s, ±2.5s），返回新的偏移秒数并持久化 (CHK-S-02) */
  const adjustOffset = useCallback((delta: number) => {
    const next = Math.round((offsetRef.current + delta) * 10) / 10;
    offsetRef.current = next;
    setOffset(next);
    if (showKeyRef.current) {
      saveStoredSubtitleOffset(showKeyRef.current, next);
    }
    return next;
  }, []);

  /** 一键归零重置 (CHK-S-03) */
  const resetOffset = useCallback(() => {
    offsetRef.current = 0;
    setOffset(0);
    if (showKeyRef.current) {
      removeStoredSubtitleOffset(showKeyRef.current);
    }
    return 0;
  }, []);

  /** 卸载清空外挂字幕 (CHK-S-05) */
  const clearSubtitle = useCallback(() => {
    cuesRef.current = [];
    offsetRef.current = 0;
    setOffset(0);
    setLabel('');
    setActiveText('');
  }, []);

  /** timeupdate 时刷新当前对白（文本未变化时不触发重渲染） */
  const refresh = useCallback((curTime: number) => {
    if (cuesRef.current.length === 0) return;
    const text = findActiveSubtitleText(cuesRef.current, curTime, offsetRef.current);
    setActiveText((prev) => (prev === text ? prev : text));
  }, []);

  return {
    cuesRef,
    offsetRef,
    label,
    offset,
    activeText,
    loadSubtitle,
    adjustOffset,
    resetOffset,
    clearSubtitle,
    refresh,
  };
}
