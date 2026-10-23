'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  clearProgress,
  db,
  progressKeyOf,
  saveProgress,
  updateHistoryProgress,
  upsertHistory,
} from '@/lib/db';

export interface UseWatchProgressParams {
  verified: boolean;
  sourceKey: string;
  sourceUrl?: string;
  vodId: string;
  videoTitle: string;
  coverPic?: string;
  currentIndex: number;
  totalEpisodes: number;
  currentUrl: string;
  positionParam: number;
  autoplayNext: boolean;
  goEpisode: (index: number) => void;
}

/**
 * 播放页进度恢复、历史落盘、自动连播与快捷键（Alt+←/→）状态管理 Hook
 */
export function useWatchProgress({
  verified,
  sourceKey,
  sourceUrl,
  vodId,
  videoTitle,
  coverPic,
  currentIndex,
  totalEpisodes,
  currentUrl,
  positionParam,
  autoplayNext,
  goEpisode,
}: UseWatchProgressParams) {
  const currentPosRef = useRef(0);

  const getCurrentPosition = useCallback(() => currentPosRef.current, []);

  // 进度恢复优先级：URL position 参数 > IndexedDB 记录
  const getRestorePosition = useCallback(async () => {
    if (positionParam > 0) return positionParam;
    if (!vodId) return 0;
    const entry = await db.progress.get(progressKeyOf(sourceKey, vodId, currentIndex));
    return entry?.position ?? 0;
  }, [positionParam, sourceKey, vodId, currentIndex]);

  // 写入观看历史（进入页面即记录，进度后续增量更新）
  useEffect(() => {
    if (!verified || !sourceKey || !currentUrl) return;
    const timer = setTimeout(() => {
      upsertHistory({
        sourceKey,
        sourceUrl,
        vodId: vodId || currentUrl,
        title: videoTitle,
        pic: coverPic,
        episodeIndex: currentIndex,
        totalEpisodes,
        playbackPosition: 0,
        duration: 0,
        timestamp: Date.now(),
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, sourceKey, vodId, currentIndex, videoTitle, currentUrl]);

  // 播放中与暂停时的进度落盘逻辑
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

  // 自动连播的 800ms 延迟切集在卸载时取消，避免离开页面后跳转
  const autoNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
  }, []);

  const handleEnded = useCallback(() => {
    if (vodId) clearProgress(sourceKey, vodId, currentIndex).catch(() => {});
    if (autoplayNext && currentIndex < totalEpisodes - 1) {
      autoNextTimer.current = setTimeout(() => goEpisode(currentIndex + 1), 800);
    }
  }, [autoplayNext, currentIndex, totalEpisodes, goEpisode, sourceKey, vodId]);

  // Alt+←/→ 集数切换快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        goEpisode(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < totalEpisodes - 1) {
        e.preventDefault();
        goEpisode(currentIndex + 1);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentIndex, totalEpisodes, goEpisode]);

  return {
    getCurrentPosition,
    getRestorePosition,
    handleProgress,
    handleEnded,
  };
}
