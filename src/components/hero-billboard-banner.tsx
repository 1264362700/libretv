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
 * 首屏巨幕轮播区 (Hero Billboard Banner)
 * Netflix / Apple TV+ 影院级暗黑流媒体风范：
 * 1. 占满视口宽度，高度 65vh（移动端 50vh）
 * 2. 底部与左侧多层渐变暗影与背景 (#0B0F19) 完美融合
 * 3. 超大标题、金标 ⭐ 8.7、年份/地区标签、更新状态徽章、2行剧情简介
 * 4. 主操作按钮：[▶ 立即播放] 与 [ⓘ 影片详情]
 */
export function HeroBillboardBanner({
  items,
  cmsRemarksMap,
  onPlay,
  onDetail,
}: HeroBillboardBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const banners = items.slice(0, 6);

  useEffect(() => {
    if (banners.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [banners.length, isPaused]);

  if (banners.length === 0) return null;
  const current = banners[currentIndex] || banners[0];

  const episodeBadge = resolveEpisodeBadge(current, cmsRemarksMap);

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl mb-8 group select-none shadow-2xl border border-slate-800/80 bg-[#0B0F19]"
      style={{ minHeight: '380px', height: 'clamp(380px, 60vh, 560px)' }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* 背景巨幕大图（多图平滑切换） */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {banners.map((item, idx) => (
          <div
            key={item.id}
            className={cn(
              'absolute inset-0 transition-opacity duration-1000 ease-in-out',
              idx === currentIndex ? 'opacity-100 scale-105' : 'opacity-0 scale-100',
              'transition-transform duration-1200'
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.cover}
              alt={item.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover filter brightness-[0.7] contrast-[1.05]"
            />
          </div>
        ))}

        {/* 底部与左侧多重沉浸式渐变遮罩 (渐变融入主背景 #0B0F19) */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F19] via-[#0B0F19]/80 to-transparent w-full md:w-3/4" />
      </div>

      {/* 巨幕左下方信息区 */}
      <div className="relative h-full flex flex-col justify-end p-6 sm:p-10 md:p-14 max-w-3xl z-10">
        <div className="space-y-3 sm:space-y-4" key={current.id}>
          {/* 状态徽章与评分金标 */}
          <div className="flex flex-wrap items-center gap-2">
            {current.rating && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-md">
                <span>★</span>
                <span>{current.rating}</span>
              </span>
            )}

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-emerald-400 font-semibold text-xs shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{episodeBadge}</span>
            </span>

            {current.year && (
              <span className="px-2.5 py-1 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 text-slate-200 text-xs font-medium">
                {current.year}
              </span>
            )}

            <span className="px-2.5 py-1 rounded-lg bg-blue-600/30 border border-blue-500/40 text-blue-400 text-xs font-semibold backdrop-blur-md">
              4K 极速秒播
            </span>
          </div>

          {/* 超大字号标题 */}
          <h1
            className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight line-clamp-1 drop-shadow-lg cursor-pointer hover:text-blue-400 transition-colors"
            onClick={() => onPlay(current)}
          >
            {current.title}
          </h1>

          {/* 剧情简介 (2行截断) */}
          <p className="text-slate-300 text-xs sm:text-sm md:text-base line-clamp-2 max-w-2xl leading-relaxed drop-shadow-sm">
            {current.card_subtitle ||
              '豆瓣高分推荐佳作，多源并发流式秒开，支持自动跳过片头片尾与原画极速连播。'}
          </p>

          {/* 双操作大按钮组：[▶ 立即播放] 和 [ⓘ 影片详情] */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onPlay(current)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/40 active:scale-95 transition-all cursor-pointer touch-manipulation"
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-100 font-semibold text-sm backdrop-blur-md border border-white/15 active:scale-95 transition-all cursor-pointer touch-manipulation"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>影片详情</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 底部轮播指示小圆点 */}
      {banners.length > 1 && (
        <div className="absolute bottom-4 right-6 sm:right-10 flex items-center gap-1.5 z-20">
          {banners.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={cn(
                'h-1.5 rounded-full transition-all cursor-pointer',
                idx === currentIndex ? 'w-6 bg-blue-500' : 'w-1.5 bg-white/30 hover:bg-white/60'
              )}
              title={`切换至第 ${idx + 1} 部影片`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
