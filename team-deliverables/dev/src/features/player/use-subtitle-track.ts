'use client';

import { useCallback, useRef, useState } from 'react';
import { findActiveSubtitleText, parseSubtitles, type SubtitleCue } from '@/lib/subtitle-parser';

/**
 * 外挂字幕状态机（从 player-shell 拆出）：
 * - 解析 SRT/VTT 文本为字幕条；
 * - 按播放时间点实时刷新当前对白（timeupdate 驱动）；
 * - ±0.5s 时间轴微调（offset 存 ref + state 双写）；
 * - 挂载/卸载生命周期。
 */
export function useSubtitleTrack() {
  const cuesRef = useRef<SubtitleCue[]>([]);
  const offsetRef = useRef(0);
  const [label, setLabel] = useState('');
  const [offset, setOffset] = useState(0);
  const [activeText, setActiveText] = useState('');

  /** 解析并挂载字幕，返回解析出的字幕条数（0 表示格式无效） */
  const loadSubtitle = useCallback((content: string, label = '外挂字幕') => {
    const cues = parseSubtitles(content);
    cuesRef.current = cues;
    offsetRef.current = 0;
    setOffset(0);
    setLabel(cues.length > 0 ? label : '');
    setActiveText('');
    return cues.length;
  }, []);

  /** ±0.5s 微调字幕时间轴，返回新的偏移秒数 */
  const adjustOffset = useCallback((delta: number) => {
    const next = Math.round((offsetRef.current + delta) * 10) / 10;
    offsetRef.current = next;
    setOffset(next);
    return next;
  }, []);

  const clearSubtitle = useCallback(() => {
    cuesRef.current = [];
    offsetRef.current = 0;
    setLabel('');
    setActiveText('');
  }, []);

  /** timeupdate 时刷新当前对白（文本未变化时不触发重渲染） */
  const refresh = useCallback(
    (curTime: number) => {
      if (cuesRef.current.length === 0) return;
      const text = findActiveSubtitleText(cuesRef.current, curTime, offsetRef.current);
      setActiveText((prev) => (prev === text ? prev : text));
    },
    []
  );

  return {
    cuesRef,
    offsetRef,
    label,
    offset,
    activeText,
    loadSubtitle,
    adjustOffset,
    clearSubtitle,
    refresh,
  };
}
