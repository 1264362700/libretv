'use client';

import { cn } from '@/lib/utils';

interface HeroImageSkeletonProps {
  /** 是否已加载完成；true 时骨架屏 opacity-0 淡出，配合真实图片平滑切入 */
  isLoaded?: boolean;
}

/**
 * Hero 轮播位骨架屏（固定 16:9 aspect-video，bg-chip/60 脉冲）。
 * 随 isLoaded 平滑淡出，与真实图片 `opacity-0 → opacity-100` 无缝衔接，无空白闪烁。
 */
export function HeroImageSkeleton({ isLoaded = false }: HeroImageSkeletonProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 w-full h-full bg-chip/60 animate-pulse',
        isLoaded ? 'opacity-0 transition-opacity duration-300 ease-out' : 'opacity-100'
      )}
      aria-hidden="true"
    />
  );
}
