import type { RefObject } from 'react';
import { setGlobalAutoJump, saveShowPreciseSkip, type PreciseSkipConfig } from '@/lib/precise-skip';
import { formatTime } from '@/lib/utils';

export interface ArtPlayerSettingsItem {
  html: string;
  tooltip?: string;
  switch?: boolean;
  onSwitch?: (item: { switch?: boolean; tooltip?: string }) => boolean;
  onClick?: () => void;
}

interface BuildSkipSettingsOptions {
  skipConfigRef: RefObject<PreciseSkipConfig>;
  showKeyRef: RefObject<string>;
  /** 获取当前播放秒数（设置面板打开时读取实时值） */
  getCurrentTime: () => number;
  /** 获取当前时长（用于计算片尾剩余秒数） */
  getDuration: () => number;
  /** 关闭设置面板（标记打点后立即收起） */
  closeSettings: () => void;
  /** 开关自动跳过时同步外壳状态 */
  onToggleAutoJump: (next: boolean) => void;
  /** 打点成功后同步外壳 skipConfig 状态 */
  onConfigUpdate: (partial: Partial<PreciseSkipConfig>) => void;
  showHint: (text: string) => void;
}

/**
 * 「自动跳过片头片尾」设置面板（ArtPlayer settings 数组）：
 * 三个设置项——开关自动跳过、标记片头结束点、标记片尾倒数点。
 * 打点结果经 saveShowPreciseSkip 按剧记忆，跨集自动同步。
 */
export function buildSkipSettings({
  skipConfigRef,
  showKeyRef,
  getCurrentTime,
  getDuration,
  closeSettings,
  onToggleAutoJump,
  onConfigUpdate,
  showHint,
}: BuildSkipSettingsOptions): ArtPlayerSettingsItem[] {
  return [
    {
      html: '自动跳过片头片尾',
      tooltip: skipConfigRef.current.autoJump ? '已开启' : '已关闭',
      switch: skipConfigRef.current.autoJump,
      onSwitch: (item: { switch?: boolean; tooltip?: string }) => {
        const next = !item.switch;
        item.tooltip = next ? '已开启' : '已关闭';
        setGlobalAutoJump(next);
        onToggleAutoJump(next);
        showHint(next ? '已开启自动跳过片头片尾' : '已关闭自动跳过片头片尾');
        return next;
      },
    },
    {
      html: '标记此处为本剧片头',
      tooltip: `${Math.round(skipConfigRef.current.headEnd)}s`,
      onClick: () => {
        const cur = Math.round(getCurrentTime());
        saveShowPreciseSkip(showKeyRef.current, { headEnd: cur });
        onConfigUpdate({ headEnd: cur, isCustomMarked: true });
        showHint(`已精准标记本剧片头：${formatTime(cur)}`);
        closeSettings();
      },
    },
    {
      html: '标记此处为本剧片尾',
      tooltip: `${Math.round(skipConfigRef.current.tailOffset)}s`,
      onClick: () => {
        const offset = Math.round(Math.max(10, getDuration() - getCurrentTime()));
        saveShowPreciseSkip(showKeyRef.current, { tailOffset: offset });
        onConfigUpdate({ tailOffset: offset, isCustomMarked: true });
        showHint(`已精准标记本剧片尾：倒数 ${formatTime(offset)}`);
        closeSettings();
      },
    },
  ];
}
