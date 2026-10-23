'use client';

import { useEffect, useState } from 'react';
import { buildImageCandidates, cn } from '@/lib/utils';

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
 * 带降级链与平滑淡入过渡的封面图组件：direct 模式按 buildImageCandidates 的顺序加载，
 * onError 逐级回退（豆瓣图：直连 → 公共镜像 → 内置代理）；
 * 加载完成时执行 opacity-0 → opacity-100 电影感平滑淡入；
 * 全部失败后触发 onExhausted 并停止渲染，由调用方展示占位图。
 * referrerPolicy=no-referrer：不向图床暴露来源页，规避部分站点的 Referer 校验。
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
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // 地址或加载方式变化时重置降级进度与加载过渡态
  useEffect(() => {
    setIdx(0);
    setLoaded(false);
  }, [url, mode, customProxy]);

  useEffect(() => {
    if (idx >= candidates.length) onExhausted?.();
    // 候选数组随 url/mode 变化，length 是充分的稳定信号
  }, [idx, candidates.length, onExhausted]);

  const src = candidates[idx];
  if (!src) return null;
  return (
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
  );
}
