'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * 页面路由过渡：使用 W3C View Transitions API 实现全局路由切换动画。
 * 当前页面淡出+缩小，新页面淡入+放大。
 * 仅在支持 View Transitions API 的浏览器中生效（Chrome 111+ / Edge 111+ / Safari 18+）。
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // 不支持 View Transitions API 时跳过
    if (typeof document === 'undefined' || !document.startViewTransition) return;

    let isFirstRender = true;

    const handleTransition = () => {
      if (isFirstRender) {
        isFirstRender = false;
        return;
      }

      const vt = document.startViewTransition(() => {
        // Next.js 路由变化已在 usePathname 中触发
      });

      vt.ready.then(() => {
        document.documentElement.animate(
          {
            opacity: [1, 0],
            transform: ['scale(1)', 'scale(0.98)'],
          },
          {
            duration: 200,
            easing: 'ease-in',
            fill: 'forwards',
          }
        );
      });

      vt.finished.then(() => {
        document.documentElement.animate(
          {
            opacity: [0, 1],
            transform: ['scale(0.98)', 'scale(1)'],
          },
          {
            duration: 250,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards',
          }
        );
      });
    };

    // 监听路由变化
    handleTransition();
  }, [pathname]);

  return <div className={cn('min-h-screen')}>{children}</div>;
}
