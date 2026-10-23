'use client';

import { useEffect, useState } from 'react';
import type { MediaItem } from '@/lib/media-library-service';
import { resolveEpisodeBadge } from '@/lib/media-library-service';
import { cn } from '@/lib/utils';

export interface HeroBillboardBannerProps {
  items: MediaItem[];
  cmsRemarksMap?: Map<string, string>;
  onPlay: (item: MediaItem) => void;
  onDetail?: (item: MediaItem) => void;
}

/**
 * 专为 4K 巨幕设计的自适应高清横幅图（优先加载 TMDB 4K Original Backdrop，失败降级 Poster）
 */
function BannerImage({ backdrop, cover, title }: { backdrop?: string; cover?: string; title: string }) {
  const [src, setSrc] = useState(backdrop || cover || '');

  useEffect(() => {
    setSrc(backdrop || cover || '');
  }, [backdrop, cover]);

  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title}
      referrerPolicy="no-referrer"
      onError={() => {
        if (cover && src !== cover) setSrc(cover);
      }}
      className="w-full h-full object-cover object-center filter brightness-[0.96] dark:brightness-[0.82] contrast-[1.04]"
    />
  );
}

/**
 * Apple TV+ / iOS 27 Spatial Liquid Glass 巨幕轮播舞台
 */
export function HeroBillboardBanner({
  items,
  cmsRemarksMap,
  onPlay,
  onDetail,
}: HeroBillboardBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  const banners = items.slice(0, 6);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (banners.length <= 1 || isPaused || userPaused || reduceMotion) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [banners.length, isPaused, userPaused, reduceMotion]);

  if (banners.length === 0) return null;
  const current = banners[currentIndex] || banners[0];
  const episodeBadge = resolveEpisodeBadge(current, cmsRemarksMap);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-[28px] sm:rounded-[36px] mb-8 group select-none transition-all duration-500',
        'border border-black/[0.08] dark:border-white/[0.12]',
        'bg-slate-100 dark:bg-[#080a11]',
        'shadow-[0_24px_60px_-15px_rgba(0,0,0,0.12)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_32px_72px_-16px_rgba(0,0,0,0.85)]',
        'min-h-[320px] sm:min-h-[420px]'
      )}
      style={{ height: 'clamp(320px, 56vh, 540px)' }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      {/* 背景 4K 宽画幅剧照层 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {banners.map((item, idx) => (
          <div
            key={item.id}
            className={cn(
              'absolute inset-0 transition-all duration-1000 ease-out',
              idx === currentIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
            )}
          >
            <BannerImage backdrop={item.backdrop} cover={item.cover} title={item.title} />
          </div>
        ))}

        {/* Apple TV+ 空间光学渐晕遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#f4f5f8] via-[#f4f5f8]/65 to-transparent dark:from-[#06070b] dark:via-[#06070b]/55 dark:to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#f4f5f8]/95 via-[#f4f5f8]/70 to-transparent dark:from-[#06070b]/95 dark:via-[#06070b]/65 dark:to-transparent w-full md:w-3/4" />
      </div>

      {/* 左下方 Apple Vision 空间信息舱 */}
      <div className="relative h-full flex flex-col justify-end p-6 sm:p-10 md:p-12 max-w-3xl z-10">
        <div className="space-y-3.5 sm:space-y-4" key={current.id}>
          {/* 冰晶毛玻璃元数据胶囊组 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase backdrop-blur-2xl bg-slate-900/85 text-white dark:bg-white/15 dark:text-white border border-white/20 shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span>TMDB 4K Official</span>
            </span>

            {current.rating && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full backdrop-blur-2xl bg-amber-500/15 dark:bg-amber-400/15 border border-amber-500/30 dark:border-amber-300/30 text-amber-700 dark:text-amber-300 font-bold text-xs">
                <span>★</span>
                <span>{current.rating}</span>
              </span>
            )}

            {current.year && (
              <span className="px-3 py-1 rounded-full backdrop-blur-2xl bg-black/[0.05] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.12] text-slate-700 dark:text-slate-200 text-xs font-medium">
                {current.year}
              </span>
            )}

            <span className="px-3 py-1 rounded-full backdrop-blur-2xl bg-black/[0.05] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.12] text-slate-700 dark:text-slate-200 text-xs font-medium">
              {episodeBadge}
            </span>
          </div>

          {/* 影院级大字标题 */}
          <h1
            className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-slate-950 dark:text-white tracking-tight line-clamp-1 cursor-pointer hover:opacity-85 transition-opacity"
            onClick={() => onPlay(current)}
          >
            {current.title}
          </h1>

          {/* 剧情简介 */}
          <p className="text-slate-600 dark:text-slate-300/90 text-xs sm:text-sm md:text-base line-clamp-2 max-w-2xl leading-relaxed font-normal">
            {current.overview ||
              current.card_subtitle ||
              'TMDB 全球高分院线臻选，支持全网多源流式并发测速秒播与自适应蓝光画质。'}
          </p>

          {/* Apple TV+ 胶囊按钮组 */}
          <div className="flex items-center gap-3 pt-1.5">
            <button
              type="button"
              onClick={() => onPlay(current)}
              className="flex items-center gap-2 px-7 py-2.5 sm:py-3 rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950 font-semibold text-xs sm:text-sm shadow-[0_8px_24px_rgba(0,0,0,0.25)] dark:shadow-[0_0_28px_rgba(255,255,255,0.25)] hover:scale-[1.02] active:scale-95 transition-all cursor-pointer touch-manipulation"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>立即播放</span>
            </button>

            {onDetail && (
              <button
                type="button"
                onClick={() => onDetail(current)}
                className="flex items-center gap-2 px-5 py-2.5 sm:py-3 rounded-full ios-pill text-slate-800 dark:text-white/90 hover:bg-black/10 dark:hover:bg-white/15 font-medium text-xs sm:text-sm active:scale-95 transition-all cursor-pointer touch-manipulation"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>更多剧集</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 左右空间毛玻璃导航圆钮 */}
      {banners.length > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            aria-label="上一部"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center ios-pill text-slate-800 dark:text-white opacity-0 group-hover:opacity-100 transition-all cursor-pointer active:scale-90"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="下一部"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center ios-pill text-slate-800 dark:text-white opacity-0 group-hover:opacity-100 transition-all cursor-pointer active:scale-90"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setUserPaused((prev) => !prev)}
            aria-label={userPaused ? '继续自动轮播' : '暂停自动轮播'}
            aria-pressed={userPaused}
            className="absolute right-4 bottom-4 z-20 w-9 h-9 rounded-full flex items-center justify-center ios-pill text-slate-800 dark:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all cursor-pointer active:scale-90"
          >
            {userPaused ? (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            )}
          </button>
        </>
      )}

      {/* 底部胶囊进度指示器 */}
      {banners.length > 1 && (
        <div className="absolute bottom-5 right-16 flex items-center gap-1.5 z-20 px-2.5 py-1.5 rounded-full backdrop-blur-xl bg-black/10 dark:bg-white/[0.06] border border-white/10">
          {banners.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300 cursor-pointer',
                idx === currentIndex
                  ? 'w-6 bg-slate-900 dark:bg-white'
                  : 'w-1.5 bg-slate-900/25 hover:bg-slate-900/50 dark:bg-white/30 dark:hover:bg-white/60'
              )}
              title={`切换至第 ${idx + 1} 部影片`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
