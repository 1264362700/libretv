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
 * 专为 Banner 设计的防盗链降级图片组件
 * 豆瓣图床默认会触发 418 / 403 拦截，通过多级候选链顺次降级：
 * 1. 公共加速镜像 (img.doubanio.cmliussss.net)
 * 2. 站点内置代理 (/api/proxy?url=...)
 * 3. 原始原站地址
 */
function BannerImage({ cover, title }: { cover?: string; title: string }) {
  const [candidateIdx, setCandidateIdx] = useState(0);

  const candidates: string[] = (() => {
    if (!cover) return [];
    if (cover.includes('doubanio.com')) {
      const mirror = cover.replace(/img\d+\.doubanio\.com/g, 'img.doubanio.cmliussss.net');
      const proxy = `/api/proxy?url=${encodeURIComponent(cover)}`;
      return [mirror, proxy, cover];
    }
    return [cover, `/api/proxy?url=${encodeURIComponent(cover)}`];
  })();

  const currentSrc = candidates[candidateIdx] || cover;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc}
      alt={title}
      referrerPolicy="no-referrer"
      onError={() => {
        if (candidateIdx < candidates.length - 1) {
          setCandidateIdx((prev) => prev + 1);
        }
      }}
      className="w-full h-full object-cover filter brightness-[0.95] dark:brightness-[0.7] contrast-[1.05]"
    />
  );
}

/**
 * 首屏巨幕轮播区 (Hero Billboard Banner)
 * 完整适配 Light (浅色)/ Dark (深色) 双主题自适应流媒体风范：
 * 1. 浅色模式：明亮典雅、温润通透的白灰渐变遮罩与高对比度文字
 * 2. 深色模式：沉浸式影院黑金暗角与深邃背景
 * 3. 图片加载自动阻断 418 报错，优雅平滑降级
 * 4. 支持手动上一部/下一部切换、悬浮暂停、左右指示器
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

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl sm:rounded-3xl mb-8 group select-none transition-all duration-300',
        'border border-slate-200/90 dark:border-slate-800/80',
        'bg-slate-100 dark:bg-[#0B0F19]',
        'shadow-lg dark:shadow-2xl'
      )}
      style={{ minHeight: '380px', height: 'clamp(380px, 58vh, 560px)' }}
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
            <BannerImage cover={item.cover} title={item.title} />
          </div>
        ))}

        {/* 浅色 / 深色双模式自适应渐变遮罩 */}
        {/* 底部向上渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-[#0B0F19] dark:via-[#0B0F19]/70 dark:to-transparent" />
        {/* 左侧向右渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-transparent dark:from-[#0B0F19] dark:via-[#0B0F19]/80 dark:to-transparent w-full md:w-3/4" />
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

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 dark:bg-black/60 backdrop-blur-md border border-emerald-500/20 dark:border-white/10 text-emerald-700 dark:text-emerald-400 font-semibold text-xs shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
              <span>{episodeBadge}</span>
            </span>

            {current.year && (
              <span className="px-2.5 py-1 rounded-lg bg-slate-900/5 dark:bg-white/10 backdrop-blur-md border border-slate-900/10 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-medium">
                {current.year}
              </span>
            )}

            <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 dark:bg-blue-600/30 border border-blue-500/20 dark:border-blue-500/40 text-blue-600 dark:text-blue-400 text-xs font-semibold backdrop-blur-md">
              4K 极速秒播
            </span>
          </div>

          {/* 超大字号标题（支持浅色/深色模式） */}
          <h1
            className="text-2xl sm:text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight line-clamp-1 drop-shadow-xs cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            onClick={() => onPlay(current)}
          >
            {current.title}
          </h1>

          {/* 剧情简介 (2行截断，支持浅色/深色文字自适应) */}
          <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm md:text-base line-clamp-2 max-w-2xl leading-relaxed">
            {current.card_subtitle ||
              '高分精选推荐佳作，多源并发流式秒开，支持自动跳过片头片尾与原画极速连播。'}
          </p>

          {/* 双操作大按钮组：[▶ 立即播放] 和 [ⓘ 影片详情] */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onPlay(current)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/30 active:scale-95 transition-all cursor-pointer touch-manipulation"
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-slate-100 font-semibold text-sm backdrop-blur-md border border-slate-300/70 dark:border-white/15 active:scale-95 transition-all cursor-pointer touch-manipulation"
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

      {/* 左右手动切换按钮（桌面端悬浮展示） */}
      {banners.length > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            aria-label="上一部"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full flex items-center justify-center bg-white/70 hover:bg-white dark:bg-black/40 dark:hover:bg-black/70 backdrop-blur-md border border-slate-200/60 dark:border-white/10 text-slate-800 dark:text-white opacity-0 group-hover:opacity-100 transition-all cursor-pointer shadow-sm active:scale-90"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="下一部"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full flex items-center justify-center bg-white/70 hover:bg-white dark:bg-black/40 dark:hover:bg-black/70 backdrop-blur-md border border-slate-200/60 dark:border-white/10 text-slate-800 dark:text-white opacity-0 group-hover:opacity-100 transition-all cursor-pointer shadow-sm active:scale-90"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* 底部轮播指示小圆点与进度条 */}
      {banners.length > 1 && (
        <div className="absolute bottom-4 right-6 sm:right-10 flex items-center gap-1.5 z-20">
          {banners.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={cn(
                'h-1.5 rounded-full transition-all cursor-pointer',
                idx === currentIndex
                  ? 'w-6 bg-blue-600 dark:bg-blue-500'
                  : 'w-1.5 bg-slate-900/20 hover:bg-slate-900/40 dark:bg-white/30 dark:hover:bg-white/60'
              )}
              title={`切换至第 ${idx + 1} 部影片`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
