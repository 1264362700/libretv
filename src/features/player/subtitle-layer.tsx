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
  onClear: () => void;
}

/**
 * 外挂字幕渲染层：
 * 1. 底部高清描边字幕文本（跟随时间点实时刷新）；
 * 2. 右上角字幕时间轴校准微胶囊（±0.5s 微调 + 卸载）。
 */
export function SubtitleLayer({
  activeSubText,
  subtitleLabel,
  subtitleOffset,
  error,
  onAdjustOffset,
  onClear,
}: SubtitleLayerProps) {
  return (
    <>
      {/* 外挂字幕高清描边渲染层 */}
      {activeSubText && !error && (
        <div
          className="absolute inset-x-4 bottom-12 sm:bottom-16 z-20 flex flex-col items-center pointer-events-none select-none"
          aria-live="off"
        >
          <div
            className="max-w-[90%] px-3 py-1 rounded-md bg-black/55 backdrop-blur-[1px] text-white text-sm sm:text-base md:text-lg font-semibold text-center whitespace-pre-line leading-snug"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.8)' }}
          >
            {activeSubText}
          </div>
        </div>
      )}

      {/* 外挂字幕时间轴校准微胶囊 */}
      {subtitleLabel && !error && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 backdrop-blur border border-white/15 text-[11px] text-white/90 pointer-events-auto">
          <span className="truncate max-w-[100px] text-accent font-medium" title={subtitleLabel}>
            字幕: {subtitleLabel}
          </span>
          <button
            type="button"
            onClick={() => onAdjustOffset(-0.5)}
            className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-mono cursor-pointer"
            title="字幕提前 0.5 秒"
          >
            -0.5s
          </button>
          <span className="font-mono text-[10px] text-white/70 px-0.5">
            {subtitleOffset >= 0 ? `+${subtitleOffset}` : subtitleOffset}s
          </span>
          <button
            type="button"
            onClick={() => onAdjustOffset(0.5)}
            className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-mono cursor-pointer"
            title="字幕延后 0.5 秒"
          >
            +0.5s
          </button>
          <button
            type="button"
            onClick={onClear}
            className="ml-0.5 px-1 text-white/60 hover:text-rose-400 cursor-pointer"
            title="卸载外挂字幕"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
