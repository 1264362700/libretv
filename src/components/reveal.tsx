'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** 延迟系数：index * delay 作为 animation-delay */
  delay?: number;
  /** 动画类型 */
  variant?: 'up' | 'left' | 'right' | 'fade';
  /** 阈值：0-1，元素进入视口多少比例时触发 */
  threshold?: number;
}

const VARIANT_CLASS: Record<NonNullable<RevealProps['variant']>, string> = {
  up: 'animate-stagger-up',
  left: 'animate-slide-in-left',
  right: 'animate-slide-in-right',
  fade: 'animate-fade-in',
};

/**
 * 滚动触发浮现包装器：基于 IntersectionObserver，元素进入视口时触发入场动画。
 * 支持错峰延迟，适用于列表项、卡片、面板等。
 */
export function Reveal({
  children,
  className,
  delay = 0,
  variant = 'up',
  threshold = 0.15,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 若 IntersectionObserver 不可用，直接显示
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  const animClass = VARIANT_CLASS[variant];

  return (
    <div
      ref={ref}
      className={cn(
        visible ? animClass : 'opacity-0',
        className
      )}
      style={{
        animationDelay: visible && delay > 0 ? `${delay}ms` : undefined,
      }}
    >
      {children}
    </div>
  );
}
