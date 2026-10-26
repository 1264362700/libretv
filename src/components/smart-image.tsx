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
  /** 候选链耗尽后回调，调用方切换占位图等兜底 UI */
  onExhausted?: () => void;
}

/**
 * 带视口延迟、降级链与平滑淡入过渡的封面图组件。
 * lazy 图片进入视口附近 200px 才设置 src，避免浏览器原生 lazy-load
 * 在长首页提前并发下载大量首屏外海报；eager 图片（如 Hero 当前背景）立即加载。
 */
export function SmartImage({
  url,
  mode,
  customProxy = '',
  alt,
  className,
  loading = 'lazy',
  onExhausted,
}: SmartImageProps) {
  const candidates = buildImageCandidates(url, mode, customProxy);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(loading === 'eager');
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [allFailed, setAllFailed] = useState(false);

  // 地址或加载方式变化时重置降级进度与加载过渡态
  useEffect(() => {
    setIdx(0);
    setLoaded(false);
    setAllFailed(false);
    setShouldLoad(loading === 'eager');
  }, [url, mode, customProxy, loading]);

  // 明确控制 lazy 图片的启动距离，避免仅依赖浏览器实现各异的原生 lazy 阈值。
  useEffect(() => {
    if (loading === 'eager') {
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
  }, [loading, url, mode, customProxy]);

  useEffect(() => {
    if (shouldLoad && idx >= candidates.length) {
      setAllFailed(true);
      onExhausted?.();
    }
  }, [shouldLoad, idx, candidates.length, onExhausted]);

  const src = candidates[idx];

  return (
    <div ref={containerRef} className="w-full h-full">
      {!shouldLoad || !src ? (
        <div className={cn('w-full h-full bg-slate-800/20', className)} aria-hidden="true" />
      ) : allFailed ? (
        <div
          className={cn(
            'w-full h-full flex items-center justify-center bg-slate-800/70',
            FAILED_SHAKE_CLASS,
            className
          )}
          aria-label={`封面加载失败: ${alt}`}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0 && !loaded) {
              setLoaded(true);
            }
          }}
          src={src}
          alt={alt}
          className={cn(
            'transition-opacity duration-300 ease-out',
            loaded ? 'opacity-100' : 'opacity-0',
            className
          )}
          loading={loading}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setIdx((i) => i + 1);
          }}
        />
      )}
    </div>
  );
}
