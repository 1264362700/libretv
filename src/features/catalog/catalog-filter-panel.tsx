'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { MobileFilterSheet } from '@/components/mobile-filter-sheet';
import { SORTS, YEARS } from './catalog-config';
import type { CatalogFilterChanges } from './use-catalog-query';

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
    <div className="flex items-center gap-2.5">
      <span className="text-xs font-medium text-faint shrink-0 w-8 sm:w-10 text-left sm:text-right">
        {label}
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
                'px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 active:scale-95 touch-manipulation cursor-pointer',
                isActive
                  ? 'ios-pill-active font-semibold'
                  : 'text-muted hover:text-content hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
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

export function CatalogFilterSection({
  regions,
  genres,
  currentRegion,
  currentGenre,
  currentYear,
  currentSort,
  hasActiveFilters,
  activeFilterCount,
  totalCount,
  onUpdateFilters,
  onReset,
}: {
  regions: string[];
  genres: string[];
  currentRegion: string;
  currentGenre: string;
  currentYear: string;
  currentSort: string;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  totalCount: number;
  onUpdateFilters: (changes: CatalogFilterChanges) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  return (
    <>
      {/* 网页版多维聚合筛选器面板 (桌面端 >= 1024px) */}
      <div className="hidden lg:block ios-glass rounded-3xl p-4 sm:p-5 space-y-2.5 sm:space-y-3">
        <FilterRow
          label={t('catalog.region', '地区')}
          options={regions}
          active={currentRegion}
          onSelect={(r) => onUpdateFilters({ region: r })}
        />
        <FilterRow
          label={t('catalog.genre', '类型')}
          options={genres}
          active={currentGenre}
          onSelect={(g) => onUpdateFilters({ genre: g })}
        />
        <FilterRow
          label={t('catalog.year', '年份')}
          options={YEARS}
          active={currentYear}
          onSelect={(y) => onUpdateFilters({ year: y })}
        />

        <div className="flex items-center justify-between pt-2 border-t border-black/[0.06] dark:border-white/[0.08] gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <span className="text-xs font-medium text-faint shrink-0 w-8 sm:w-10 text-left sm:text-right">
              {t('catalog.sort', '排序')}
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onUpdateFilters({ sort: s.id })}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 active:scale-95 touch-manipulation cursor-pointer',
                    currentSort === s.id
                      ? 'ios-pill-active font-semibold'
                      : 'text-muted hover:text-content hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {hasActiveFilters && (
            <button
              onClick={onReset}
              className="text-xs text-muted hover:text-content px-3 py-1 rounded-full ios-pill flex items-center gap-1 shrink-0 ml-auto cursor-pointer"
            >
              <span>重置所有筛选</span>
              <span>✕</span>
            </button>
          )}
        </div>
      </div>

      {/* iPad 平板端专属流式触控筛选卡片 (768px ~ 1024px) */}
      <TabletFilterPanel
        regions={regions}
        genres={genres}
        years={YEARS}
        activeRegion={currentRegion}
        activeGenre={currentGenre}
        activeYear={currentYear}
        activeSort={currentSort}
        onUpdateFilters={onUpdateFilters}
        onReset={onReset}
        hasActiveFilters={hasActiveFilters}
      />

      {/* 移动端专属精炼筛选栏 (手机端) */}
      <div className="md:hidden space-y-2">
        <div className="flex items-center justify-between gap-2 bg-chip/50 border border-line/60 rounded-xl p-2">
          <button
            type="button"
            onClick={() => setMobileFilterOpen(true)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 touch-manipulation cursor-pointer border shrink-0',
              activeFilterCount > 0
                ? 'bg-accent text-on-accent border-accent shadow-xs'
                : 'bg-surface border-line text-content hover:bg-hover'
            )}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span>筛选</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-white text-accent text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => onUpdateFilters({ sort: s.id })}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 active:scale-95 touch-manipulation',
                  currentSort === s.id
                    ? 'bg-accent text-on-accent font-semibold shadow-xs'
                    : 'text-muted hover:text-content bg-surface border border-line/50'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button
              onClick={onReset}
              className="text-xs text-muted hover:text-accent shrink-0 p-1 active:scale-90"
              title="重置全部筛选"
            >
              ✕
            </button>
          )}
        </div>

        {activeFilterCount > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs py-0.5 px-0.5">
            <span className="text-muted text-[11px] shrink-0">已选:</span>
            {currentRegion !== '全部' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent font-medium text-[11px] shrink-0">
                {currentRegion}
                <button onClick={() => onUpdateFilters({ region: '全部' })} className="hover:opacity-70">
                  ×
                </button>
              </span>
            )}
            {currentGenre !== '全部' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent font-medium text-[11px] shrink-0">
                {currentGenre}
                <button onClick={() => onUpdateFilters({ genre: '全部' })} className="hover:opacity-70">
                  ×
                </button>
              </span>
            )}
            {currentYear !== '全部' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent font-medium text-[11px] shrink-0">
                {currentYear}年
                <button onClick={() => onUpdateFilters({ year: '全部' })} className="hover:opacity-70">
                  ×
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      <MobileFilterSheet
        open={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        regions={regions}
        genres={genres}
        years={YEARS}
        activeRegion={currentRegion}
        activeGenre={currentGenre}
        activeYear={currentYear}
        onApply={(f) => {
          onUpdateFilters({ region: f.region, genre: f.genre, year: f.year });
        }}
        totalCount={totalCount}
      />
    </>
  );
}
