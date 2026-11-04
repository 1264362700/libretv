'use client';

import { useEffect, useRef, useState } from 'react';
import { buildImageCandidates, cn } from '@/lib/utils';
import { HeroImageSkeleton } from './hero-image-skeleton';
import { PosterSkeleton } from './poster-skeleton';
import { PosterPlaceholder } from './poster-placeholder';

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
  /** 海报比例：'2/3'（电影海报）| 'video'（16:9）| 'square'，默认 2/3 */
  aspect?: '2/3' | 'video' | 'square';
  /** 骨架屏变体：'hero'（Hero 轮播位，固定 16:9）| 'poster'（卡片海报位，固定 2:3），默认 'poster' */
  variant?: 'hero' | 'poster';
}

/**
 * 带视口延迟、降级链与平滑淡入过渡的封面图组件。
 * lazy 图片进入视口附近 200px 才设置 src，避免浏览器原生 lazy-load
 * 在长首页提前并发下载大量首屏外海报；eager 图片（如 Hero 当前背景）立即加载。
 * 骨架屏与失败兜底全部走语义化 Token，固定 aspect-ratio 确保 CLS ≈ 0。
 *
 * 三状态切换：
 * 1. 未加载（!loaded）：渲染骨架屏（HeroImageSkeleton / PosterSkeleton），固定比例不留空白
 * 2. 加载中（shouldLoad && !loaded）：骨架屏保持显示，img 预渲染 opacity-0 准备淡入
 * 3. 加载完成（loaded）：隐藏骨架屏，img opacity-0 → opacity-100 平滑淡入
 * 4. 全部失败（allFailed）：渲染 PosterPlaceholder，调用 onExhausted
 */
export function SmartImage({
  url,
  mode,
  customProxy = '',
  alt,
  className,
  loading = 'lazy',
  onExhausted,
  aspect = '2/3',
  variant = 'poster',
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

  // lazy 图片进入视口附近 200px 才设置 src，避免首屏外并发下载抢占带宽
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
    if (shouldLoad && idx >= candidates.length && !allFailed) {
      setAllFailed(true);
      onExhausted?.();
    }
  }, [shouldLoad, idx, candidates.length, allFailed, onExhausted]);

  const src = candidates[idx];

  // 固定 aspect-ratio，图片加载前后布局不抖动（CLS ≈ 0）
  const aspectClass =
    aspect === 'video' ? 'aspect-video' : aspect === 'square' ? 'aspect-square' : 'aspect-[2/3]';

  return (
    <div ref={containerRef} className={cn('relative overflow-hidden', aspectClass, className)}>
      {/* 未加载完成前：渲染骨架屏，固定比例，不留空白 */}
      {!loaded && !allFailed && (
        variant === 'hero' ? (
          <HeroImageSkeleton isLoaded={loaded} />
        ) : (
          <PosterSkeleton />
        )
      )}

      {/* 全部候选链耗尽：失败兜底，抖动提示，不影响卡片点击 */}
      {allFailed && (
        <PosterPlaceholder alt={alt} />
      )}

      {/* 真实图片：未加载完成时 opacity-0，加载完成后 opacity-100 平滑淡入 */}
      {!allFailed && src && (
        <img
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0 && !loaded) {
              setLoaded(true);
            }
          }}
          src={src}
          alt={alt}
          className={cn(
            'absolute inset-0 w-full h-full object-cover',
            'transition-opacity duration-300 ease-out',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
          loading={shouldLoad ? loading : 'lazy'}
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
