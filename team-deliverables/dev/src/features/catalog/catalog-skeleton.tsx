'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/** 片库列表骨架屏与分页渲染（从 app/catalog/page.tsx 抽出，纯展示无状态） */

export function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-4.5">
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="flex flex-col space-y-2">
          <div className="aspect-[2/3] w-full rounded-xl bg-chip/60 animate-pulse border border-line/30" />
          <div className="h-4 w-3/4 rounded bg-chip/60 animate-pulse" />
          <div className="h-3 w-1/3 rounded bg-chip/40 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function renderPageNumbers(
  currentPage: number,
  totalPages: number,
  onPageSelect: (page: number) => void
) {
  const pages: (number | string)[] = [];
  const delta = 2;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return pages.map((page, idx) => {
    if (page === '...') {
      return (
        <span key={`dots-${idx}`} className="px-1 text-xs text-faint">
          …
        </span>
      );
    }
    const pNum = Number(page);
    const isCur = pNum === currentPage;
    return (
      <button
        key={pNum}
        onClick={() => onPageSelect(pNum)}
        className={cn(
          'w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-xs font-medium transition-all active:scale-95 touch-manipulation cursor-pointer',
          isCur
            ? 'bg-accent text-on-accent font-bold shadow-xs'
            : 'text-muted hover:text-content hover:bg-hover bg-chip/50'
        )}
      >
        {pNum}
      </button>
    );
  });
}

export function CatalogPagination({
  currentPage,
  totalPages,
  isFetching,
  onPageSelect,
}: {
  currentPage: number;
  totalPages: number;
  isFetching: boolean;
  onPageSelect: (page: number) => void;
}) {
  const [jumpPageInput, setJumpPageInput] = useState('');

  if (totalPages <= 1) return null;

  return (
    <div className="pt-6 pb-8">
      {/* 移动端大按键上一页 / 下一页 */}
      <div className="sm:hidden flex items-center justify-between w-full gap-3">
        <button
          disabled={currentPage <= 1 || isFetching}
          onClick={() => {
            onPageSelect(currentPage - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex-1 h-11 rounded-xl bg-surface border border-line text-content text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-xs touch-manipulation cursor-pointer"
        >
          <span>‹</span>
          <span>上一页</span>
        </button>
        <div className="px-3 py-1.5 rounded-lg bg-chip/60 border border-line/40 text-xs font-semibold text-content shrink-0">
          {currentPage} / {totalPages}
        </div>
        <button
          disabled={currentPage >= totalPages || isFetching}
          onClick={() => {
            onPageSelect(currentPage + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex-1 h-11 rounded-xl bg-surface border border-line text-content text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-xs touch-manipulation cursor-pointer"
        >
          <span>下一页</span>
          <span>›</span>
        </button>
      </div>

      {/* 桌面端完整数字分页 */}
      <div className="hidden sm:flex flex-row items-center justify-center gap-3">
        <div className="flex items-center gap-1.5">
          <button
            disabled={currentPage <= 1 || isFetching}
            onClick={() => onPageSelect(1)}
            className="btn-ghost btn-sm px-2.5 text-xs disabled:opacity-30 disabled:pointer-events-none"
            title="第一页"
          >
            首页
          </button>
          <button
            disabled={currentPage <= 1 || isFetching}
            onClick={() => onPageSelect(currentPage - 1)}
            className="btn-ghost btn-sm px-3 text-xs flex items-center gap-1 disabled:opacity-30 disabled:pointer-events-none"
          >
            <span>‹</span>
            <span>上一页</span>
          </button>

          <div className="flex items-center gap-1">
            {renderPageNumbers(currentPage, totalPages, onPageSelect)}
          </div>

          <button
            disabled={currentPage >= totalPages || isFetching}
            onClick={() => onPageSelect(currentPage + 1)}
            className="btn-ghost btn-sm px-3 text-xs flex items-center gap-1 disabled:opacity-30 disabled:pointer-events-none"
          >
            <span>下一页</span>
            <span>›</span>
          </button>
          <button
            disabled={currentPage >= totalPages || isFetching}
            onClick={() => onPageSelect(totalPages)}
            className="btn-ghost btn-sm px-2.5 text-xs disabled:opacity-30 disabled:pointer-events-none"
            title="末页"
          >
            末页
          </button>
        </div>

        {/* 页面快速跳转 */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const p = parseInt(jumpPageInput.trim(), 10);
            if (!Number.isNaN(p) && p >= 1 && p <= totalPages) {
              onPageSelect(p);
              setJumpPageInput('');
            }
          }}
          className="flex items-center gap-1 text-xs text-muted"
        >
          <span>跳至</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpPageInput}
            onChange={(e) => setJumpPageInput(e.target.value)}
            placeholder={String(currentPage)}
            className="w-12 h-7 rounded border border-line bg-surface text-center text-content text-xs focus:border-accent focus:outline-none"
          />
          <span>页</span>
          <button
            type="submit"
            className="px-2 py-1 rounded bg-chip hover:bg-hover border border-line text-content text-xs active:scale-95 cursor-pointer"
          >
            GO
          </button>
        </form>
      </div>
    </div>
  );
}
