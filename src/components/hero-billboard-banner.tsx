'use client';

import { useEffect, useState } from 'react';
import type { MediaItem } from '@/lib/media-library-service';
import { resolveEpisodeBadge } from '@/lib/media-library-service';

export interface HeroBillboardBannerProps {
  items: MediaItem[];
  cmsRemarksMap?: Map<string, string>;
  onPlay: (item: MediaItem) => void;
  onDetail?: (item: MediaItem) => void;
}

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
      className="w-full h-full object-cover object-center transform transition-transform duration-[8000ms] ease-out scale-105"
    />
  );
}

/**
 * NovaTV Cinema Ultra 全屏沉浸式 4K 巨幕大轮播 (HeroBillboard)
 * 支持高对比渐变暗角遮罩、剧集状态呼吸灯、立即播放/详情双按钮与自动平滑轮播
 */
export function HeroBillboardBanner({
  items,
  cmsRemarksMap,
  onPlay,
  onDetail,
}: HeroBillboardBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const slides = items.slice(0, 6);

  useEffect(() => {
    if (isPaused || slides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [isPaused, slides.length]);

  if (slides.length === 0) return null;
  const current = slides[currentIndex] || slides[0];
  const episodeBadge = resolveEpisodeBadge(current, cmsRemarksMap);

  return (
    <section
      className="relative w-full h-[520px] sm:h-[620px] lg:h-[720px] overflow-hidden select-none bg-[#0B0F19]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Backdrops with crossfade transition */}
      {slides.map((slide, index) => {
        const isActive = index === currentIndex;
        return (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'
            }`}
            style={{ transitionProperty: 'opacity, transform' }}
          >
            <BannerImage backdrop={slide.backdrop} cover={slide.cover} title={slide.title} />
            {/* High-Contrast Cinematic Gradient Vignettes */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/65 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F19] via-[#0B0F19]/75 to-transparent w-full md:w-3/4" />
            <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#0B0F19]/85 to-transparent" />
          </div>
        );
      })}

      {/* Foreground Hero Content Container */}
      <div className="relative z-10 max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-16 sm:pb-24">
        <div className="max-w-2xl animate-fade-in space-y-4" key={current.id}>
          {/* Status & Badges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Emerald Breathing Light */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/85 border border-emerald-500/35 text-emerald-400 text-xs font-medium shadow-glow-emerald">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span>{episodeBadge || '正在热映'}</span>
            </div>

            {/* Category Tag */}
            <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-slate-200 text-xs font-medium">
              {current.typeName || 'TMDB 4K 原画'}
            </span>

            {/* Year */}
            {current.year && (
              <span className="px-2 py-0.5 rounded text-slate-400 text-xs font-mono">
                {current.year}
              </span>
            )}

            {/* Rating */}
            {current.rating && (
              <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-bold shadow-glow-gold">
                <span>★</span>
                <span>{current.rating}</span>
              </div>
            )}
          </div>

          {/* Title */}
          <h1
            onClick={() => onPlay(current)}
            className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-md leading-tight cursor-pointer hover:text-amber-400 transition-colors"
          >
            {current.title}
          </h1>

          {/* Subtitle / Actors */}
          {current.card_subtitle && (
            <p className="text-xs sm:text-sm text-amber-300/90 font-medium line-clamp-1">
              {current.card_subtitle}
            </p>
          )}

          {/* Summary */}
          <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 leading-relaxed drop-shadow max-w-xl">
            {current.overview ||
              current.card_subtitle ||
              'TMDB 全球 4K 原画臻选大片，支持全网多点播采集源流式并发测速秒播。'}
          </p>

          {/* 立即播放 / 详情 双按钮 */}
          <div className="flex items-center gap-3.5 pt-2">
            <button
              type="button"
              onClick={() => onPlay(current)}
              className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold text-sm sm:text-base hover:brightness-110 shadow-glow-gold transition-all duration-200 hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>立即播放</span>
            </button>

            <button
              type="button"
              onClick={() => (onDetail ? onDetail(current) : onPlay(current))}
              className="flex items-center gap-2 px-5 py-3 rounded-xl glass-panel text-slate-200 hover:text-white font-medium text-sm sm:text-base hover:bg-white/10 transition-all duration-200 cursor-pointer"
            >
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>影片详情</span>
            </button>
          </div>
        </div>

        {/* Bottom Carousel Navigation Indicators */}
        {slides.length > 1 && (
          <div className="absolute right-4 sm:right-8 bottom-16 sm:bottom-24 z-20 flex items-center gap-2">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                aria-label={`切换至第 ${idx + 1} 部`}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                  idx === currentIndex
                    ? 'w-8 bg-amber-400 shadow-glow-gold'
                    : 'w-2 bg-white/30 hover:bg-white/60'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
