'use client';

import { cn } from '@/lib/utils';

/**
 * 卡片海报位骨架屏（固定 2:3 aspect-[2/3]，bg-chip/60 + border border-line/30 脉冲）。
 * 固定比例确保图片加载前后无布局抖动（CLS ≈ 0）。
 */
export function PosterSkeleton() {
  return (
    <div
      className={cn(
        'absolute inset-0 w-full h-full',
        'aspect-[2/3]',
        'bg-chip/60 border border-line/30 rounded-xl animate-pulse'
      )}
      aria-hidden="true"
    />
  );
}
