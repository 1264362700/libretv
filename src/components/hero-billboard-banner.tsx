'use client';

import { useEffect, useState } from 'react';
import type { MediaItem } from '@/lib/media-library-service';
import { resolveEpisodeBadge } from '@/lib/media-library-service';
import { useAppStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import { SmartImage } from './smart-image';

export interface HeroBillboardBannerProps {
  items: MediaItem[];
  isLoading?: boolean;
  cmsRemarksMap?: Map<string, string>;
  onPlay: (item: MediaItem) => void;
  onDetail?: (item: MediaItem) => void;
}

function BannerImage({ backdrop, cover, title, isActive }: { backdrop?: string; cover?: string; title: string; isActive: boolean }) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const url = backdrop || cover || '';
  if (!url) return null;

  return (
    <SmartImage
      url={url}
      mode={imageProxyMode}
      customProxy={customImageProxy}
      alt={title}
      loading={isActive ? "eager" : "lazy"}
      className={`w-full h-full object-cover object-center ${isActive ? 'animate-ken-burns' : ''}`}
    />
  );
}

/**
 * NovaTV Cinema Ultra 全屏沉浸式 4K 巨幕大轮播 (HeroBillboard)
 * 支持高对比渐变暗角遮罩、剧集状态呼吸灯、立即播放/详情双按钮与自动平滑轮播
 */
export function HeroBillboardBanner({
  items,
  isLoading,
  cmsRemarksMap,
  onPlay,
  onDetail,
}: HeroBillboardBannerProps) {
  const { t } = useTranslation();
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

  if (isLoading || slides.length === 0) {
    return <HeroBillboardSkeleton />;
  }

  const current = slides[currentIndex] || slides[0];
  const episodeBadge = resolveEpisodeBadge(current, cmsRemarksMap);

  return (
    <section
      className="relative w-full h-[520px] sm:h-[620px] lg:h-[720px] overflow-hidden select-none bg-page transition-colors"
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
            {(isActive || index === (currentIndex + 1) % slides.length) && (\n              <BannerImage\n                backdrop={slide.backdrop}\n                cover={slide.cover}\n                title={slide.title}\n                isActive={isActive}\n              />\n            )}
            {/* High-Contrast Cinematic Gradient Vignettes */}
            <div className="absolute inset-0 bg-gradient-to-t from-page via-page/65 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-page via-page/75 to-transparent w-full md:w-3/4" />
            <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-page/85 to-transparent" />
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
              <span>{episodeBadge || t('hero.nowPlaying')}</span>
            </div>

            {/* Category Tag */}
            <span className="px-2.5 py-1 rounded-full bg-chip/80 border border-line text-content text-xs font-medium">
              {current.typeName || t('hero.quality4k')}
            </span>

            {/* Year */}
            {current.year && (
              <span className="px-2 py-0.5 rounded text-muted text-xs font-mono">
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
            className="text-3xl sm:text-5xl lg:text-6xl font-black text-content tracking-tight drop-shadow-md leading-tight cursor-pointer hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
          >
            {current.title}
          </h1>

          {/* Subtitle / Actors */}
          {current.card_subtitle && (
            <p className="text-xs sm:text-sm text-amber-500 dark:text-amber-300/90 font-medium line-clamp-1">
              {current.card_subtitle}
            </p>
          )}

          {/* Summary */}
          <p className="text-xs sm:text-sm text-muted line-clamp-2 leading-relaxed drop-shadow max-w-xl">
            {current.overview ||
              current.card_subtitle ||
              t('hero.tagline')}
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
              className="flex items-center gap-2 px-5 py-3 rounded-xl glass-panel text-content hover:text-amber-500 dark:hover:text-amber-400 font-medium text-sm sm:text-base hover:bg-hover transition-all duration-200 cursor-pointer"
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

/**
 * NovaTV 巨幕大轮播骨架屏占位
 * 避免数据未加载完成时首页视口高度坍塌或剧烈抖动
 */
export function HeroBillboardSkeleton() {
  return (
    <section className="relative w-full h-[520px] sm:h-[620px] lg:h-[720px] overflow-hidden select-none bg-chip/35 border-b border-line animate-pulse">
      {/* 渐变遮罩 */}
      <div className="absolute inset-0 bg-gradient-to-t from-page via-page/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-page via-page/75 to-transparent w-full md:w-3/4" />
      <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-page/85 to-transparent" />

      {/* 前台骨架文字与按钮 */}
      <div className="relative z-10 max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-16 sm:pb-24">
        <div className="max-w-2xl space-y-4">
          {/* 标签栏骨架 */}
          <div className="flex items-center gap-2.5">
            <div className="w-24 h-6 rounded-full bg-chip border border-line" />
            <div className="w-20 h-6 rounded-full bg-chip border border-line" />
            <div className="w-12 h-6 rounded-md bg-chip" />
          </div>

          {/* 标题骨架 */}
          <div className="w-3/4 max-w-lg h-10 sm:h-14 rounded-2xl bg-chip/90" />

          {/* 副标题骨架 */}
          <div className="w-1/2 max-w-xs h-4 rounded-lg bg-chip/80" />

          {/* 剧情简介骨架 */}
          <div className="space-y-2 max-w-xl">
            <div className="w-full h-4 rounded-lg bg-chip/70" />
            <div className="w-4/5 h-4 rounded-lg bg-chip/60" />
          </div>

          {/* 按钮骨架 */}
          <div className="flex items-center gap-3.5 pt-2">
            <div className="w-32 sm:w-36 h-11 sm:h-12 rounded-xl bg-amber-400/25 border border-amber-400/35" />
            <div className="w-28 sm:w-32 h-11 sm:h-12 rounded-xl bg-chip border border-line" />
          </div>
        </div>

        {/* 轮播点指示器骨架 */}
        <div className="absolute right-4 sm:right-8 bottom-16 sm:bottom-24 hidden sm:flex items-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-2.5 h-2.5 rounded-full bg-chip border border-line" />
          ))}
        </div>
      </div>
    </section>
  );
}
