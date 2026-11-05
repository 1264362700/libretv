'use client';

interface SubtitleLayerProps {
  /** 当前时间点命中的字幕文本 */
  activeSubText: string;
  /** 已挂载字幕文件名（空串表示未挂载） */
  subtitleLabel: string;
  /** 时间轴偏移（秒，负数提前） */
  subtitleOffset: number;
  error: string;
  onAdjustOffset: (delta: number) => void;
  onResetOffset?: () => void;
  onClear: () => void;
}

/**
 * 外挂字幕渲染层 (REQ-P1-01):
 * 1. 底部高清双重阴影描边字幕文本（跟随播放时间点实时刷新）；
 * 2. 右上角字幕时间轴校准微胶囊（多档阶梯微调 ±0.5s/±1.0s/±2.5s + 一键重置归零 + 卸载）。
 */
export function SubtitleLayer({
  activeSubText,
  subtitleLabel,
  subtitleOffset,
  error,
  onAdjustOffset,
  onResetOffset,
  onClear,
}: SubtitleLayerProps) {
  return (
    <>
      {/* 外挂字幕高清描边渲染层 (CHK-S-06) */}
      {activeSubText && !error && (
        <div
          className="absolute inset-x-4 bottom-12 sm:bottom-16 z-20 flex flex-col items-center pointer-events-none select-none"
          aria-live="off"
        >
          <div
            className="max-w-[90%] px-3 py-1 rounded-md bg-black/60 backdrop-blur-[2px] text-white text-sm sm:text-base md:text-lg font-semibold text-center whitespace-pre-line leading-snug"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.8)' }}
          >
            {activeSubText}
          </div>
        </div>
      )}

      {/* 外挂字幕时间轴校准微胶囊 (CHK-S-01, CHK-S-02, CHK-S-03, CHK-S-05) */}
      {subtitleLabel && !error && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1 p-1 sm:px-2 sm:py-1 rounded-lg bg-black/75 backdrop-blur-md border border-white/15 text-[11px] text-white/90 pointer-events-auto shadow-lg select-none">
          <span
            className="truncate max-w-[80px] sm:max-w-[130px] text-accent font-medium px-1"
            title={subtitleLabel}
          >
            {subtitleLabel}
          </span>

          {/* 快退/提前阶梯按钮组 */}
          <button
            type="button"
            onClick={() => onAdjustOffset(-2.5)}
            className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 active:scale-95 text-[10px] font-mono cursor-pointer transition-all"
            title="字幕提前 2.5 秒"
          >
            -2.5s
          </button>
          <button
            type="button"
            onClick={() => onAdjustOffset(-1.0)}
            className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 active:scale-95 text-[10px] font-mono cursor-pointer transition-all"
            title="字幕提前 1.0 秒"
          >
            -1.0s
          </button>
          <button
            type="button"
            onClick={() => onAdjustOffset(-0.5)}
            className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 active:scale-95 text-[10px] font-mono cursor-pointer transition-all"
            title="字幕提前 0.5 秒"
          >
            -0.5s
          </button>

          {/* 当前偏移数值 */}
          <span className="font-mono text-[10px] text-white font-semibold px-0.5 min-w-[38px] text-center">
            {subtitleOffset > 0 ? `+${subtitleOffset.toFixed(1)}` : `${subtitleOffset.toFixed(1)}`}s
          </span>

          {/* 慢速/延后阶梯按钮组 */}
          <button
            type="button"
            onClick={() => onAdjustOffset(0.5)}
            className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 active:scale-95 text-[10px] font-mono cursor-pointer transition-all"
            title="字幕延后 0.5 秒"
          >
            +0.5s
          </button>
          <button
            type="button"
            onClick={() => onAdjustOffset(1.0)}
            className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 active:scale-95 text-[10px] font-mono cursor-pointer transition-all"
            title="字幕延后 1.0 秒"
          >
            +1.0s
          </button>
          <button
            type="button"
            onClick={() => onAdjustOffset(2.5)}
            className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 active:scale-95 text-[10px] font-mono cursor-pointer transition-all"
            title="字幕延后 2.5 秒"
          >
            +2.5s
          </button>

          {/* 一键归零重置 (CHK-S-03) */}
          {subtitleOffset !== 0 && onResetOffset && (
            <button
              type="button"
              onClick={onResetOffset}
              className="ml-0.5 px-1.5 py-0.5 rounded text-[10px] text-accent/90 hover:text-accent hover:bg-accent/15 cursor-pointer font-medium transition-colors"
              title="一键归零恢复原始时间轴"
            >
              ↺ 重置
            </button>
          )}

          {/* 卸载字幕 (CHK-S-05) */}
          <button
            type="button"
            onClick={onClear}
            className="ml-0.5 px-1 text-white/50 hover:text-rose-400 hover:bg-white/10 rounded cursor-pointer transition-colors"
            title="卸载外挂字幕"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
