'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

interface MobileFilterSheetProps {
  open: boolean;
  onClose: () => void;
  regions: string[];
  genres: string[];
  years: string[];
  activeRegion: string;
  activeGenre: string;
  activeYear: string;
  onApply: (filters: { region: string; genre: string; year: string }) => void;
  totalCount?: number;
}

export function MobileFilterSheet({
  open,
  onClose,
  regions,
  genres,
  years,
  activeRegion,
  activeGenre,
  activeYear,
  onApply,
  totalCount,
}: MobileFilterSheetProps) {
  // 抽屉内临时选中的状态，支持用户自由点选，点击“确定”时一次性提交，避免频繁重刷页面
  const [selectedRegion, setSelectedRegion] = useState(activeRegion);
  const [selectedGenre, setSelectedGenre] = useState(activeGenre);
  const [selectedYear, setSelectedYear] = useState(activeYear);
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  // 打开时同步父级当前生效的过滤状态
  useEffect(() => {
    if (open) {
      setSelectedRegion(activeRegion);
      setSelectedGenre(activeGenre);
      setSelectedYear(activeYear);
      setMounted(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
      return () => cancelAnimationFrame(raf);
    }
    setEntered(false);
    const timer = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(timer);
  }, [open, activeRegion, activeGenre, activeYear]);

  // 打开时锁定背景滚动，防止触控穿透
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  // Esc 键关闭
  useEffect(() => {
    if (!mounted) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mounted, onClose]);

  const { t } = useTranslation();

  if (!mounted) return null;

  const activeCount =
    (selectedRegion !== '全部' ? 1 : 0) +
    (selectedGenre !== '全部' ? 1 : 0) +
    (selectedYear !== '全部' ? 1 : 0);

  const handleReset = () => {
    setSelectedRegion('全部');
    setSelectedGenre('全部');
    setSelectedYear('全部');
  };

  const handleConfirm = () => {
    onApply({
      region: selectedRegion,
      genre: selectedGenre,
      year: selectedYear,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
      {/* 遮罩背景 */}
      <div
        className={cn(
          'fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200',
          entered ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
        aria-hidden
      />

      {/* 底部滑出的筛选半屏面板 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="筛选影片"
        className={cn(
          'relative z-10 w-full bg-surface-raised border-t border-line rounded-t-3xl max-h-[82vh] flex flex-col shadow-2xl transition-transform duration-220 ease-out',
          entered ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* 顶部手势拖拽把手指示条 */}
        <div className="pt-2.5 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-muted/30" />
        </div>

        {/* 标题栏 */}
        <div className="px-4 py-2 border-b border-line/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-content">多维条件筛选</h2>
            {activeCount > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                已选 {activeCount} 项
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-muted hover:text-accent active:scale-95 transition-all cursor-pointer font-medium"
              >
                重置
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-muted hover:text-content hover:bg-hover active:scale-90 transition-all cursor-pointer"
              aria-label="关闭"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 筛选选项核心内容区（支持垂直自然平滑滚动） */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 overscroll-contain">
          {/* 地区 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-content">地区</span>
              <span className="text-[11px] text-faint">
                {selectedRegion === '全部' ? t('filter.unlimited') : selectedRegion}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {regions.map((r) => {
                const isSelected = selectedRegion === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedRegion(r)}
                    className={cn(
                      'py-2 px-1 text-xs rounded-xl font-medium transition-all text-center truncate active:scale-95 touch-manipulation',
                      isSelected
                        ? 'bg-accent text-on-accent font-semibold shadow-xs'
                        : 'bg-chip/70 text-muted hover:text-content hover:bg-chip border border-line/40'
                    )}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 类型 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-content">类型题材</span>
              <span className="text-[11px] text-faint">
                {selectedGenre === '全部' ? t('filter.unlimited') : selectedGenre}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {genres.map((g) => {
                const isSelected = selectedGenre === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setSelectedGenre(g)}
                    className={cn(
                      'py-2 px-1 text-xs rounded-xl font-medium transition-all text-center truncate active:scale-95 touch-manipulation',
                      isSelected
                        ? 'bg-accent text-on-accent font-semibold shadow-xs'
                        : 'bg-chip/70 text-muted hover:text-content hover:bg-chip border border-line/40'
                    )}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 年份 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-content">上映年份</span>
              <span className="text-[11px] text-faint">
                {selectedYear === '全部' ? '未限制' : selectedYear}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {years.map((y) => {
                const isSelected = selectedYear === y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setSelectedYear(y)}
                    className={cn(
                      'py-2 px-1 text-xs rounded-xl font-medium transition-all text-center truncate active:scale-95 touch-manipulation',
                      isSelected
                        ? 'bg-accent text-on-accent font-semibold shadow-xs'
                        : 'bg-chip/70 text-muted hover:text-content hover:bg-chip border border-line/40'
                    )}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 底部吸底大按钮操作条 */}
        <div className="p-3 border-t border-line/60 bg-surface-raised flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={handleReset}
            className="btn-ghost flex-1 py-2.5 rounded-xl text-xs font-semibold border border-line text-muted hover:text-content active:scale-95"
          >
            清空重选
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-primary flex-2 py-2.5 rounded-xl text-xs font-bold shadow-md active:scale-95"
          >
            {totalCount !== undefined && totalCount > 0
              ? `确认筛选（共 ${totalCount.toLocaleString()} 部）`
              : '确认筛选'}
          </button>
        </div>
      </div>
    </div>
  );
}
