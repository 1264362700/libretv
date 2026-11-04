'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';

interface EpisodeDrawerProps {
  episodes: string[];
  currentEpisodeIndex: number;
  onSelectEpisode: (index: number) => void;
  host: HTMLDivElement;
  onHint: (text: string) => void;
  subtitleLabel: string;
}

/**
 * 全屏/沉浸态右侧贴边感应「悬浮选集抽屉」：
 * 挂载于 ArtPlayer 容器内（脱离父级 overflow:hidden 限制），全屏下无需退出即可秒切集数。
 * 行为与旧版 player-shell 内联实现一致：
 * - 右侧 14px 隐形鼠标感应热区 + 右上角轻量唤醒胶囊；
 * - 抽屉头部含「上集/下集」按钮（切集时给出提示）；
 * - 每集按钮显示序号，当前集高亮并自动滚动到视口。
 */
export function EpisodeDrawer({
  episodes,
  currentEpisodeIndex,
  onSelectEpisode,
  host,
  onHint,
  subtitleLabel,
}: EpisodeDrawerProps) {
  const [epDrawerOpen, setEpDrawerOpen] = useState(false);
  const epHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeEpBtnRef = useRef<HTMLButtonElement | null>(null);

  const openEpDrawer = () => {
    if (epHideTimerRef.current) {
      clearTimeout(epHideTimerRef.current);
      epHideTimerRef.current = null;
    }
    setEpDrawerOpen(true);
  };

  const scheduleHideEpDrawer = (delayMs = 280) => {
    if (epHideTimerRef.current) clearTimeout(epHideTimerRef.current);
    epHideTimerRef.current = setTimeout(() => {
      setEpDrawerOpen(false);
    }, delayMs);
  };

  // 抽屉打开或切集时滚动当前集按钮到视口
  useEffect(() => {
    if (epDrawerOpen && activeEpBtnRef.current) {
      activeEpBtnRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [epDrawerOpen, currentEpisodeIndex]);

  // 卸载清理定时器
  useEffect(() => {
    return () => {
      if (epHideTimerRef.current) clearTimeout(epHideTimerRef.current);
    };
  }, []);

  return createPortal(
    <>
      {/* 右侧 14px 隐形鼠标感应热区：鼠标移至播放器右边缘即滑出选集抽屉 */}
      <div
        className="absolute inset-y-12 right-0 w-3.5 z-[115] pointer-events-auto"
        onMouseEnter={openEpDrawer}
        title="移至右边缘唤出悬浮选集抽屉"
      />

      {/* 右上角轻量选集唤醒胶囊（兼顾触屏设备与全屏直观选集） */}
      {!epDrawerOpen && !subtitleLabel && (
        <button
          type="button"
          onClick={openEpDrawer}
          onMouseEnter={openEpDrawer}
          className="absolute top-3 right-3 z-[115] flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/55 hover:bg-black/85 text-white/80 hover:text-white border border-white/15 text-[11px] font-medium backdrop-blur transition-all opacity-60 hover:opacity-100 pointer-events-auto cursor-pointer"
          title="打开悬浮选集抽屉（也可将鼠标移至播放器最右侧边缘唤出）"
        >
          <span>☰ 选集</span>
          <span className="text-accent font-mono">
            {currentEpisodeIndex + 1}/{episodes.length}
          </span>
        </button>
      )}

      {/* 悬浮毛玻璃选集抽屉主体 */}
      <div
        onMouseEnter={openEpDrawer}
        onMouseLeave={() => scheduleHideEpDrawer(280)}
        className={`
          absolute inset-y-0 right-0 z-[125] w-64 sm:w-72
          bg-black/82 backdrop-blur-xl border-l border-white/15 shadow-2xl
          flex flex-col pointer-events-auto
          transition-all duration-200 ease-out
          ${epDrawerOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}
        `}
      >
        <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-semibold text-white truncate">悬浮选集</span>
            <span className="text-[11px] text-accent font-mono">
              {currentEpisodeIndex + 1}/{episodes.length}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={currentEpisodeIndex <= 0}
              onClick={() => {
                if (currentEpisodeIndex > 0) {
                  onSelectEpisode(currentEpisodeIndex - 1);
                  onHint(`正在切换至 第 ${currentEpisodeIndex} 集`);
                }
              }}
              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-35 text-[11px] text-white cursor-pointer"
              title="上一集"
            >
              上集
            </button>
            <button
              type="button"
              disabled={currentEpisodeIndex >= episodes.length - 1}
              onClick={() => {
                if (currentEpisodeIndex < episodes.length - 1) {
                  onSelectEpisode(currentEpisodeIndex + 1);
                  onHint(`正在切换至 第 ${currentEpisodeIndex + 2} 集`);
                }
              }}
              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-35 text-[11px] text-white cursor-pointer"
              title="下一集"
            >
              下集
            </button>
            <button
              type="button"
              onClick={() => setEpDrawerOpen(false)}
              className="ml-0.5 px-1.5 py-0.5 rounded text-white/60 hover:text-white hover:bg-white/10 text-xs cursor-pointer"
              title="收起选集抽屉"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-4 gap-1.5 content-start">
          {episodes.map((_, idx) => {
            const isActive = idx === currentEpisodeIndex;
            return (
              <button
                key={idx}
                ref={isActive ? activeEpBtnRef : undefined}
                type="button"
                onClick={() => {
                  if (idx !== currentEpisodeIndex) {
                    onSelectEpisode(idx);
                    onHint(`正在切换至 第 ${idx + 1} 集`);
                  }
                  setEpDrawerOpen(false);
                }}
                className={`
                  h-8 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer flex items-center justify-center border
                  ${
                    isActive
                      ? 'bg-accent text-white border-accent shadow-sm'
                      : 'bg-white/8 hover:bg-white/18 text-white/85 hover:text-white border-white/10'
                  }
                `}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        <div className="px-3.5 py-2 border-t border-white/10 text-[10px] text-white/50 flex items-center justify-between shrink-0">
          <span>鼠标移至画面右边缘即可呼出</span>
          <span>全屏免退切集</span>
        </div>
      </div>
    </>,
    host
  );
}
