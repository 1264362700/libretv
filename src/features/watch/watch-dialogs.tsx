'use client';

import { useEffect } from 'react';
import { Icon } from '@/components/icon';
import type { CandidateItem } from './watch-types';

/** 最优线路提示弹框：弹框期间暂停播放，取消即恢复（从 app/watch/page.tsx 抽出） */

export function SpeedSuggestionDialog({
  currentSourceName,
  target,
  onAccept,
  onDismiss,
}: {
  currentSourceName: string;
  target: CandidateItem;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="切换到更快的播放线路"
    >
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface-raised p-5 shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <span className="mt-0.5 w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
            <Icon name="bolt" className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-content leading-snug">发现更快的播放线路</h3>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              已为你暂停播放。切换后会保留当前集数与播放进度。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs mb-5">
          <span className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-chip/50 text-muted truncate">
            当前 · {currentSourceName}
            {target.baselineMs ? ` · ${target.baselineMs}ms` : ''}
          </span>
          <svg className="w-4 h-4 text-faint shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-accent/15 text-accent font-medium truncate">
            推荐 · {target.source.name}
            {target.ms ? ` · ${target.ms}ms` : ''}
          </span>
        </div>

        {target.gainPercent ? (
          <p className="text-[11px] text-emerald-500 mb-4 text-center">
            首集预计快 {target.gainPercent}%
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="btn-ghost btn-sm flex-1 !py-2 text-xs"
          >
            保持当前线路
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="btn-primary btn-sm flex-1 !py-2 text-xs"
          >
            立即切换
          </button>
        </div>
      </div>
    </div>
  );
}

/** 集数按钮：激活时自动滚动进可视区（长剧列表），统一高度与高质感圆角 */
