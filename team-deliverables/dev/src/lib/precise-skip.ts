'use client';

/**
 * 精准跳过片头片尾引擎（9zhoukj 同款精准时间戳 + 每部剧集自适应记忆）
 * 支持：
 * 1. 剧集单集毫秒级精准打点标记（标记一次，整部剧后续所有集数 100% 精确同步跳过）
 * 2. 9zhoukj 同款浮层跳过药丸按钮（SkipPlayOpening / SkipPlayEnding）
 * 3. 自动跳过（开启后起播自动越过片头、接近片尾自动无缝连播下集）
 * 4. 本地持久化与兜底时间自适应
 */

export interface PreciseSkipConfig {
  headEnd: number;      // 片头结束时间戳（秒）
  tailOffset: number;   // 片尾离视频结束的剩余秒数（秒）
  autoJump: boolean;    // 是否开启自动跳过
  isCustomMarked: boolean; // 是否是用户精准手动标记的
}

const GLOBAL_STORAGE_KEY = 'libretv-auto-jump-opening-ending';
const SHOW_PREFIX = 'libretv-precise-markers:';

export const DEFAULT_HEAD_END = 90;
export const DEFAULT_TAIL_OFFSET = 90;

export function getGlobalAutoJump(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem(GLOBAL_STORAGE_KEY);
    return val === null ? true : val === '1' || val === 'true';
  } catch {
    return true;
  }
}

export function setGlobalAutoJump(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GLOBAL_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // 忽略存储异常
  }
}

export function getShowPreciseSkip(showKey: string): PreciseSkipConfig {
  const autoJump = getGlobalAutoJump();
  if (typeof window === 'undefined' || !showKey) {
    return { headEnd: DEFAULT_HEAD_END, tailOffset: DEFAULT_TAIL_OFFSET, autoJump, isCustomMarked: false };
  }

  try {
    const raw = localStorage.getItem(`${SHOW_PREFIX}${showKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        headEnd: typeof parsed.headEnd === 'number' ? parsed.headEnd : DEFAULT_HEAD_END,
        tailOffset: typeof parsed.tailOffset === 'number' ? parsed.tailOffset : DEFAULT_TAIL_OFFSET,
        autoJump,
        isCustomMarked: Boolean(parsed.isCustomMarked),
      };
    }
  } catch {
    // 容错降级
  }

  return { headEnd: DEFAULT_HEAD_END, tailOffset: DEFAULT_TAIL_OFFSET, autoJump, isCustomMarked: false };
}

export function saveShowPreciseSkip(
  showKey: string,
  data: { headEnd?: number; tailOffset?: number; isCustomMarked?: boolean }
): void {
  if (typeof window === 'undefined' || !showKey) return;
  try {
    const current = getShowPreciseSkip(showKey);
    const updated = {
      headEnd: data.headEnd !== undefined ? Math.max(0, data.headEnd) : current.headEnd,
      tailOffset: data.tailOffset !== undefined ? Math.max(0, data.tailOffset) : current.tailOffset,
      isCustomMarked: data.isCustomMarked !== undefined ? data.isCustomMarked : true,
    };
    localStorage.setItem(`${SHOW_PREFIX}${showKey}`, JSON.stringify(updated));
  } catch {
    // 忽略
  }
}
