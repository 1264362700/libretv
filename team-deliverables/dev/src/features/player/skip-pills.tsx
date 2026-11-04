'use client';

import type { PreciseSkipConfig } from '@/lib/precise-skip';
import { formatTime } from '@/lib/utils';

interface SkipPillsProps {
  showSkipOpening: boolean;
  showSkipEnding: boolean;
  undoIntro: boolean;
  skipConfig: PreciseSkipConfig;
  error: string;
  /** 手动跳过片头 */
  onSkipOpening: () => void;
  /** 将当前播放秒数设为本剧片头结束点 */
  onMarkHead: () => void;
  /** 跳过片尾并触发连播下一集 */
  onSkipEnding: () => void;
  /** 撤销自动跳过的片头（回到视频开头） */
  onUndoIntro: () => void;
}

/**
 * 精准跳过片头片尾的浮层药丸：
 * - 片头：播放进入片头区间时浮出「跳过片头 + 设当前秒为片头」双按钮；
 * - 片尾：接近片尾时浮出「跳过片尾 · 连播下集」；
 * - 撤销条：自动跳过片头后 5s 内可一键回到开头。
 */
export function SkipPills({
  showSkipOpening,
  showSkipEnding,
  undoIntro,
  skipConfig,
  error,
  onSkipOpening,
  onMarkHead,
  onSkipEnding,
  onUndoIntro,
}: SkipPillsProps) {
  return (
    <>
      {/* 片头跳过与一键打点记忆浮层药丸 */}
      {showSkipOpening && !error && (
        <div className="absolute bottom-12 left-3 sm:bottom-14 sm:left-4 z-20 flex items-center gap-1.5 animate-slide-in-right pointer-events-auto">
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 hover:bg-black/95 text-white border border-white/20 text-xs sm:text-sm font-medium backdrop-blur shadow-lg transition-all active:scale-95 cursor-pointer"
            onClick={onSkipOpening}
          >
            <span>⏩ 跳过片头</span>
            <span className="text-accent text-xs font-mono">{formatTime(skipConfig.headEnd)}</span>
          </button>
          <button
            type="button"
            className="px-2.5 py-1.5 rounded-full bg-black/75 hover:bg-accent/90 text-white/85 hover:text-white border border-white/15 text-[11px] font-medium backdrop-blur shadow-md transition-all cursor-pointer"
            title="将当前播放秒数设为本剧片头结束点，后续剧集自动同步"
            onClick={onMarkHead}
          >
            📌 设当前秒为片头
          </button>
        </div>
      )}

      {/* 片尾跳过浮层药丸 */}
      {showSkipEnding && !error && (
        <div className="absolute bottom-12 left-3 sm:bottom-14 sm:left-4 z-20 flex items-center animate-slide-in-right pointer-events-auto">
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 hover:bg-black/95 text-white border border-white/20 text-xs sm:text-sm font-medium backdrop-blur shadow-lg transition-all active:scale-95"
            onClick={onSkipEnding}
          >
            <span>⏩ 跳过片尾</span>
            <span className="text-accent text-xs font-medium">连播下集</span>
          </button>
        </div>
      )}

      {/* 自动跳过片头后的撤销条 */}
      {undoIntro && !error && (
        <div className="absolute bottom-12 left-3 sm:bottom-14 sm:left-4 z-20 flex items-center gap-2 bg-black/85 text-white text-xs px-3 py-1.5 rounded-full border border-white/20 backdrop-blur shadow-md animate-slide-in-right pointer-events-auto">
          <span>已跳过片头 ({formatTime(skipConfig.headEnd)})</span>
          <button
            type="button"
            className="text-accent hover:underline font-medium ml-1"
            onClick={onUndoIntro}
          >
            撤销
          </button>
        </div>
      )}
    </>
  );
}
