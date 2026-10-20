'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * 全局即时响应顶部加载条（0ms 响应，告别卡顿感）：
 * 1. 监听全局点击事件：只要用户点击内部链接或按钮，立即在 0ms 启动顶部微光进度条；
 * 2. 路由或参数变化完成后自动平滑推至 100% 并淡出；
 * 3. 彻底消除 Next.js 在路由切换时等待数据造成的“卡顿了才出动画”的负面体验。
 */
export function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // 路由或参数变更完成：立即完成并渐隐
  useEffect(() => {
    if (loading) {
      setProgress(100);
      const timer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams, loading]);

  // 全局拦截内部链接与切换点击：0 毫秒给出交互反馈
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('a');
      if (!target) return;
      const href = target.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('http://') || href.startsWith('https://')) {
        return;
      }
      if (target.target === '_blank') return;

      // 内部跳转：立即激活加载条
      setLoading(true);
      setProgress(25);
      const t1 = setTimeout(() => setProgress(65), 120);
      const t2 = setTimeout(() => setProgress(85), 350);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    };

    window.addEventListener('click', handleClick, { capture: true });
    return () => window.removeEventListener('click', handleClick, { capture: true });
  }, []);

  // 监听编程式触发（triggerTopProgress）
  useEffect(() => {
    const handleStart = () => {
      setLoading(true);
      setProgress(30);
      const t1 = setTimeout(() => setProgress(70), 120);
      const t2 = setTimeout(() => setProgress(88), 350);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    };

    const handleDone = () => {
      setProgress(100);
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 250);
    };

    window.addEventListener('cl:route-start', handleStart);
    window.addEventListener('cl:route-done', handleDone);
    return () => {
      window.removeEventListener('cl:route-start', handleStart);
      window.removeEventListener('cl:route-done', handleDone);
    };
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none h-[2.5px] bg-transparent"
      aria-hidden="true"
    >
      <div
        className="h-full bg-gradient-to-r from-accent via-cyan-400 to-purple-400 shadow-[0_0_10px_rgba(56,189,248,0.7)] transition-all ease-out duration-200"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          transitionProperty: 'width, opacity',
        }}
      />
    </div>
  );
}

/** 手动触发进度条（用于编程式跳转 router.push 或异步操作开始） */
export function triggerTopProgress() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cl:route-start'));
  }
}

/** 手动完成进度条 */
export function completeTopProgress() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cl:route-done'));
  }
}
