'use client';

import { cn } from '@/lib/utils';

interface CardGridSkeletonProps {
  /** 骨架卡片数量，与真实首屏卡片数一致，避免 CLS */
  count?: number;
  /** 卡片比例，默认 2/3 */
  aspect?: '2/3' | 'video' | 'square';
}

/**
 * 首屏卡片网格骨架屏：
 * - 响应式列数：移动端 2 列 → 平板 3 列 → 桌面 4 列 → 大桌面 6 列（grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6）
 * - 每张卡片海报位固定 aspect-[2/3]，加载前后不抖动
 * - 顶部角标与底部标题/副标题骨架，与真实卡片结构对齐
 */
export function CardGridSkeleton({
  count = 6,
  aspect = '2/3',
}: CardGridSkeletonProps) {
  const aspectClass =
    aspect === 'video' ? 'aspect-video' : aspect === 'square' ? 'aspect-square' : 'aspect-[2/3]';

  return (
    <section className="py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            'grid gap-4',
            'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
          )}
        >
          {[...Array(count)].map((_, i) => (
            <div key={i} className="group relative flex flex-col rounded-xl overflow-hidden cursor-pointer">
              {/* 海报位骨架：固定 aspect-ratio，加载前后不抖动 */}
              <div className={cn('relative w-full', aspectClass, 'bg-surface animate-pulse')} />
              {/* 顶部角标骨架 */}
              <div className="absolute top-2 left-2 w-16 h-6 bg-surface rounded-md animate-pulse" />
              {/* 底部标题与副标题骨架 */}
              <div className="p-2.5 flex flex-col gap-1.5">
                <div className="h-5 bg-surface rounded animate-pulse w-3/4" />
                <div className="h-4 bg-surface rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
