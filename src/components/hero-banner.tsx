'use client';

import { useEffect, useState } from 'react';
import type { DoubanItem } from '@/lib/types';
import { SmartImage } from './smart-image';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

interface HeroBannerProps {
  items: DoubanItem[];
  onPick: (title: string) => void;
}

export function HeroBanner({ items, onPick }: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);

  // 只取前 6 部精品影片作为大屏轮播
  const banners = items.slice(0, 6);

  useEffect(() => {
    if (banners.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [banners.length, isPaused]);

  if (banners.length === 0) return null;
  const current = banners[currentIndex] || banners[0];

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl mb-8 group select-none shadow-2xl border border-line/40 bg-surface-raised"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{ minHeight: '380px', height: 'clamp(380px, 46vw, 540px)' }}
    >
      {/* 背景海报（超宽微模糊发光，营造 9zhoukj 沉浸式影院氛围） */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {banners.map((item, idx) => (
          <div
            key={item.id}
            className={cn(
              'absolute inset-0 transition-opacity duration-700 ease-in-out',
              idx === currentIndex ? 'opacity-100 scale-105' : 'opacity-0 scale-100',
              'transition-transform duration-1000'
            )}
          >
            <SmartImage
              url={item.cover}
              mode={imageProxyMode}
              customProxy={customImageProxy}
              alt={item.title}
              className="w-full h-full object-cover filter blur-[2px] brightness-[0.7] dark:brightness-[0.45]"
            />
          </div>
        ))}
        {/* 多层光影与边缘渐变暗角 */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/70 to-transparent w-full md:w-3/4" />
      </div>

      {/* 轮播内容主体 */}
      <div className="relative h-full flex flex-col justify-end p-6 sm:p-10 md:p-14 max-w-3xl z-10">
        <div className="space-y-3 sm:space-y-4 animate-fade-in" key={current.id}>
          {/* 标签栏：评分与类型 */}
          <div className="flex items-center gap-2.5">
            {current.rating && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/90 text-slate-950 font-bold text-xs sm:text-sm shadow-md">
                <span>★</span>
                <span>{current.rating}</span>
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full bg-white/20 dark:bg-white/10 text-content backdrop-blur-md text-xs font-medium border border-white/10">
              今日重磅
            </span>
            <span className="px-2.5 py-1 rounded-full bg-accent/20 text-accent backdrop-blur-md text-xs font-semibold border border-accent/30">
              4K 蓝光极速
            </span>
          </div>

          {/* 影片大标题 */}
          <h2
            className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-content tracking-tight line-clamp-1 drop-shadow-md cursor-pointer hover:text-accent transition-colors"
            onClick={() => onPick(current.title)}
          >
            {current.title}
          </h2>

          {/* 简介或副标题 */}
          <p className="text-muted text-xs sm:text-sm md:text-base line-clamp-2 max-w-2xl leading-relaxed drop-shadow-xs">
            豆瓣高分力荐佳作，全网多源聚合超清播放，支持自动跳过片头片尾与原画极速连播。
          </p>

          {/* 9zhoukj 同款胶囊操作大按钮 */}
          <div className="flex items-center gap-3 pt-2">
            <button
              className="flex items-center gap-2 px-6 sm:px-8 py-2.5 sm:py-3.5 rounded-full bg-accent hover:bg-accent/90 text-on-accent font-semibold text-sm sm:text-base shadow-lg shadow-accent/30 active:scale-95 transition-all touch-manipulation"
              onClick={() => onPick(current.title)}
            >
              <svg className="w-4 sm:w-5 h-4 sm:h-5 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>立即播放</span>
            </button>
            <button
              className="flex items-center gap-1.5 px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-full bg-white/15 hover:bg-white/25 dark:bg-white/10 dark:hover:bg-white/20 text-content backdrop-blur-md font-medium text-xs sm:text-sm border border-white/15 active:scale-95 transition-all"
              onClick={() => onPick(current.title)}
            >
              <span>查看详情</span>
            </button>
          </div>
        </div>
      </div>

      {/* 9zhoukj 底部胶囊指示灯 */}
      <div className="absolute bottom-4 right-6 sm:bottom-6 sm:right-10 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
        {banners.map((item, idx) => (
          <button
            key={item.id}
            aria-label={`切换到第 ${idx + 1} 项`}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              idx === currentIndex ? 'w-6 bg-accent' : 'w-1.5 bg-white/40 hover:bg-white/70'
            )}
            onClick={() => setCurrentIndex(idx)}
          />
        ))}
      </div>

      {/* 左右翻页微控制钮 */}
      <button
        type="button"
        aria-label="上一项"
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white/70 hover:text-white flex items-center justify-center backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transition-all active:scale-90"
        onClick={() => setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)}
      >
        <svg className="w-5 h-5 -translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="下一项"
        className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white/70 hover:text-white flex items-center justify-center backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transition-all active:scale-90"
        onClick={() => setCurrentIndex((prev) => (prev + 1) % banners.length)}
      >
        <svg className="w-5 h-5 translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
