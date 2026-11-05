'use client';

import { cn } from '@/lib/utils';

interface PosterPlaceholderProps {
  /** 用于 aria-label 说明失败原因的图片 alt 文本 */
  alt: string;
}

/**
 * 加载失败兜底占位（bg-card + border border-line + animate-shake-warn 抖动）。
 * 中心显示 ⚠️ 图标与「封面加载失败」文字，不影响卡片点击进入播放页。
 * 全部走语义化 Token，禁止硬编码色值。
 */
export function PosterPlaceholder({ alt }: PosterPlaceholderProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center',
        'bg-card border border-line rounded-xl',
        'animate-shake-warn'
      )}
      aria-label={`封面加载失败: ${alt}`}
      role="img"
    >
      <span className="text-faint text-[14px] mb-1.5">⚠️</span>
      <span className="text-xs text-muted text-center px-2">
        封面「{alt || '图片'}」加载失败，可点击卡片进入播放页
      </span>
    </div>
  );
}
