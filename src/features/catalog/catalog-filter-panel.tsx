'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { SORTS } from './catalog-config';

/**
 * 片库页的筛选面板（从 app/catalog/page.tsx 抽出）：
 * - TabletFilterPanel：md~lg 区间的可折叠多维筛选
 * - FilterRow：单行筛选（供移动端与桌面复用）
 * 两者都是纯展示组件，状态由页面持有，抽出来只为降低页面体积。
 */

export function TabletFilterPanel({
  regions,
  genres,
  years,
  activeRegion,
  activeGenre,
  activeYear,
  activeSort,
  onUpdateFilters,
  onReset,
  hasActiveFilters,
}: {
  regions: string[];
  genres: string[];
  years: string[];
  activeRegion: string;
  activeGenre: string;
  activeYear: string;
  activeSort: string;
  onUpdateFilters: (changes: { region?: string; genre?: string; year?: string; sort?: string }) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="hidden md:block lg:hidden bg-chip/35 border border-line/60 rounded-2xl p-4 space-y-3 shadow-xs">
      {/* 顶栏控制：排序 + 重置 + 展开切换 */}
      <div className="flex items-center justify-between pb-2.5 border-b border-line/50 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-content shrink-0">排序:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onUpdateFilters({ sort: s.id })}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95 touch-manipulation cursor-pointer',
                  activeSort === s.id
                    ? 'bg-accent text-on-accent font-semibold shadow-xs'
                    : 'bg-surface hover:bg-hover text-muted hover:text-content border border-line/60'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-accent hover:underline flex items-center gap-1 cursor-pointer mr-1"
            >
              <span>重置条件</span>
              <span>✕</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-content bg-surface border border-line active:scale-95 touch-manipulation cursor-pointer"
          >
            <span>{expanded ? '收起选项' : '展开多维筛选'}</span>
            <svg
              className={cn('w-3.5 h-3.5 transition-transform duration-200', expanded && 'rotate-180')}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <polyline points="6 9 12 15 18 9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* 地区流式药丸：自动换行 flex-wrap */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-faint">地区:</span>
          {activeRegion !== '全部' && (
            <span className="text-[11px] text-accent font-medium">已选: {activeRegion}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {regions.map((r) => {
            const isSelected = activeRegion === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onUpdateFilters({ region: r })}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-xl font-medium transition-all active:scale-95 touch-manipulation cursor-pointer',
                  isSelected
                    ? 'bg-accent text-on-accent font-semibold shadow-xs'
                    : 'bg-surface hover:bg-hover text-muted hover:text-content border border-line/50'
                )}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* 类型题材流式药丸：自动换行 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-faint">类型题材:</span>
          {activeGenre !== '全部' && (
            <span className="text-[11px] text-accent font-medium">已选: {activeGenre}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(expanded ? genres : genres.slice(0, 10)).map((g) => {
            const isSelected = activeGenre === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => onUpdateFilters({ genre: g })}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-xl font-medium transition-all active:scale-95 touch-manipulation cursor-pointer',
                  isSelected
                    ? 'bg-accent text-on-accent font-semibold shadow-xs'
                    : 'bg-surface hover:bg-hover text-muted hover:text-content border border-line/50'
                )}
              >
                {g}
              </button>
            );
          })}
          {!expanded && genres.length > 10 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="px-2.5 py-1.5 text-xs rounded-xl text-faint hover:text-accent border border-dashed border-line active:scale-95 cursor-pointer"
            >
              +{genres.length - 10} 更多...
            </button>
          )}
        </div>
      </div>

      {/* 上映年份流式药丸 */}
      {(expanded || activeYear !== '全部') && (
        <div className="pt-2 border-t border-line/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-faint">上映年份:</span>
            {activeYear !== '全部' && (
              <span className="text-[11px] text-accent font-medium">已选: {activeYear}年</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {years.map((y) => {
              const isSelected = activeYear === y;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => onUpdateFilters({ year: y })}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-xl font-medium transition-all active:scale-95 touch-manipulation cursor-pointer',
                    isSelected
                      ? 'bg-accent text-on-accent font-semibold shadow-xs'
                      : 'bg-surface hover:bg-hover text-muted hover:text-content border border-line/50'
                  )}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterRow({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: string[];
  active: string;
  onSelect: (opt: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-faint shrink-0 w-8 sm:w-10 text-left sm:text-right">
        {label}:
      </span>
      <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {options.map((opt) => {
          const isActive = active === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onSelect(opt)}
              className={cn(
                'px-2.5 sm:px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 active:scale-95 touch-manipulation',
                isActive
                  ? 'bg-accent text-on-accent font-semibold shadow-xs'
                  : 'text-muted hover:text-content hover:bg-hover bg-surface/50'
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
