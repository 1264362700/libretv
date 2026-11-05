'use client';

import { useEffect, useRef, useState } from 'react';
import { buildImageCandidates, cn } from '@/lib/utils';

/** 所有候选地址均失败时的抖动状态 */
const FAILED_SHAKE_CLASS = 'animate-shake-warn';

interface SmartImageProps {
  /** 原始图片地址（未经代理加工，降级链由本组件按加载方式生成） */
  url?: string;
  mode: 'direct' | 'proxy' | 'custom';
  customProxy?: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** 是否首屏高优先级加载（立即启动请求 + fetchPriority=high + 规避首屏二次渲染延迟） */
  priority?: boolean;
  /** 候选链耗尽后回调，调用方切换占位图等兜底 UI */
  onExhausted?: () => void;
}

/**
 * 带视口延迟、降级链、平滑骨架屏与渐进淡入过渡的封面图组件。
 * lazy 图片进入视口附近 200px 才设置 src，避免长首页提前并发下载大量首屏外海报；
 * eager/priority 图片（如 Hero 轮播与首屏关键大卡）立即发起网络加载并赋予高优先级。
 */
export function SmartImage({
  url,
  mode,
  customProxy = '',
  alt,
  className,
  loading = 'lazy',
  priority = false,
  onExhausted,
}: SmartImageProps) {
  const isEager = priority || loading === 'eager';
  const effectiveLoading = isEager ? 'eager' : 'lazy';
  const candidates = buildImageCandidates(url, mode, customProxy);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(isEager);
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [allFailed, setAllFailed] = useState(false);

  // 地址或加载方式变化时重置降级进度与加载过渡态
  useEffect(() => {
    setIdx(0);
    setLoaded(false);
    setAllFailed(false);
    setShouldLoad(isEager);
  }, [url, mode, customProxy, isEager]);

  // 明确控制 lazy 图片的启动距离，避免仅依赖浏览器实现各异的原生 lazy 阈值。
  useEffect(() => {
    if (isEager) {
      setShouldLoad(true);
      return;
    }

    const target = containerRef.current;
    if (!target) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isEager, url, mode, customProxy]);

  useEffect(() => {
    if (shouldLoad && idx >= candidates.length && !allFailed) {
      setAllFailed(true);
      onExhausted?.();
    }
  }, [shouldLoad, idx, candidates.length, allFailed, onExhausted]);

  const src = candidates[idx];

  return (
    <div ref={containerRef} className={cn('relative overflow-hidden w-full h-full', className)}>
      {!shouldLoad ? (
        <div className={cn('w-full h-full bg-slate-800/20 animate-pulse', className)} aria-hidden="true" />
      ) : allFailed ? (
        <div
          className={cn(
            'w-full h-full flex items-center justify-center bg-slate-800/70',
            FAILED_SHAKE_CLASS,
            className
          )}
          aria-label={`封面加载失败: ${alt}`}
        />
      ) : !src ? null : (
        <>
          {!loaded && (
            <div
              className={cn('w-full h-full bg-slate-800/20 animate-pulse absolute inset-0', className)}
              aria-hidden="true"
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0 && !loaded) {
                setLoaded(true);
              }
            }}
            src={src}
            alt={alt}
            className={cn(
              'w-full h-full object-cover transition-opacity duration-300 ease-out',
              loaded ? 'opacity-100' : 'opacity-0',
              className
            )}
            loading={effectiveLoading}
            // @ts-expect-error fetchpriority 为现代浏览器标准属性
            fetchpriority={isEager ? 'high' : 'auto'}
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => {
              setLoaded(false);
              setIdx((i) => i + 1);
            }}
          />
        </>
      )}
    </div>
  );
}
