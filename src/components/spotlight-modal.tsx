'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db, addSearchHistory, removeSearchHistory, clearSearchHistory } from '@/lib/db';
import { Icon } from './icon';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

interface SpotlightModalProps {
  open: boolean;
  onClose: () => void;
}

const QUICK_CHANNELS = [
  { label: '电影', icon: '🎬', href: '/catalog?type=movie' },
  { label: '电视剧', icon: '📺', href: '/catalog?type=tv' },
  { label: '动漫', icon: '✨', href: '/catalog?type=anime' },
  { label: '综艺', icon: '🎤', href: '/catalog?type=variety' },
  { label: '纪录片', icon: '🌍', href: '/catalog?type=documentary' },
  { label: '电视直播', icon: '📡', href: '/live' },
];

export function SpotlightModal({ open, onClose }: SpotlightModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const history = useQuery({
    queryKey: ['searchHistory'],
    queryFn: () => db.searchHistory.orderBy('timestamp').reverse().limit(15).toArray(),
    enabled: open,
  });

  const matches = useMemo(() => {
    const all = history.data ?? [];
    const keyword = query.trim().toLowerCase();
    return keyword ? all.filter((h) => h.text.toLowerCase().includes(keyword)) : all;
  }, [history.data, query]);

  // 打开时重置输入并自聚焦，锁定页面滚动
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(-1);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        clearTimeout(timer);
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  if (!open) return null;

  const submitSearch = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    addSearchHistory(q)
      .then(() => queryClient.invalidateQueries({ queryKey: ['searchHistory'] }))
      .catch(() => {});
    onClose();
    router.push(`/?s=${encodeURIComponent(q)}`, { scroll: false });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    const totalItems = matches.length + (query.trim() ? 1 : 0);
    if (totalItems === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? totalItems - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex === 0 && query.trim()) {
        submitSearch(query);
      } else if (activeIndex > 0 && query.trim()) {
        const item = matches[activeIndex - 1];
        if (item) submitSearch(item.text);
      } else if (activeIndex >= 0 && !query.trim()) {
        const item = matches[activeIndex];
        if (item) submitSearch(item.text);
      } else {
        submitSearch(query);
      }
    }
  };

  const handleRemoveHistory = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    removeSearchHistory(text)
      .then(() => queryClient.invalidateQueries({ queryKey: ['searchHistory'] }))
      .catch(() => {});
  };

  const handleClearAllHistory = () => {
    clearSearchHistory()
      .then(() => queryClient.invalidateQueries({ queryKey: ['searchHistory'] }))
      .catch(() => {});
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="全局影片搜索"
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-start justify-center pt-[12vh] sm:pt-[16vh] px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface-raised dark:bg-zinc-900 border border-line rounded-2xl shadow-2xl overflow-hidden backdrop-blur flex flex-col max-h-[75vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部搜索大输入条 */}
        <div className="flex items-center px-4 py-3.5 border-b border-line gap-3 bg-surface/50">
          <Icon name="search" className="w-5 h-5 text-accent shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-content placeholder:text-muted/60 text-base sm:text-lg outline-none min-w-0"
            placeholder={t('search.placeholder', '搜索电影、电视剧、动漫、演员、片名...')}
            value={query}
            maxLength={100}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button
              type="button"
              className="p-1 rounded-lg text-muted hover:text-content hover:bg-hover transition-colors cursor-pointer shrink-0"
              onClick={() => {
                setQuery('');
                setActiveIndex(-1);
                inputRef.current?.focus();
              }}
              title="清空输入"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-mono bg-surface border border-line rounded-md text-faint shrink-0">
            ESC
          </kbd>
          <button
            type="button"
            className="sm:hidden p-1 rounded-lg text-muted hover:text-content"
            onClick={onClose}
            aria-label="关闭搜索"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        {/* 浮窗主体内容区 */}
        <div className="overflow-y-auto max-h-[55vh] p-4 space-y-5 scrollbar-thin">
          {/* 输入内容时的即时回车动作 */}
          {query.trim() && (
            <div
              className={cn(
                'flex items-center justify-between px-3.5 py-3 rounded-xl cursor-pointer transition-all border',
                activeIndex === 0
                  ? 'bg-accent text-white border-accent shadow-md'
                  : 'bg-surface hover:bg-hover border-line/60 text-content'
              )}
              onClick={() => submitSearch(query)}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Icon
                  name="search"
                  className={cn('w-4 h-4 shrink-0', activeIndex === 0 ? 'text-white' : 'text-accent')}
                />
                <span className="text-sm font-medium truncate">
                  全网蓝光聚合搜索：<span className="font-semibold underline underline-offset-2">「{query}」</span>
                </span>
              </div>
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded font-mono shrink-0',
                  activeIndex === 0 ? 'bg-white/20 text-white' : 'bg-surface-raised border border-line text-faint'
                )}
              >
                ↵ Enter
              </span>
            </div>
          )}

          {/* 历史记录匹配或全部最近历史 */}
          {matches.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted tracking-wide">
                  <Icon name="clock" className="w-3.5 h-3.5" />
                  {query.trim() ? '历史匹配' : '最近搜索'}
                </span>
                {!query.trim() && (
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-danger transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-danger/10"
                    onClick={handleClearAllHistory}
                  >
                    清空历史
                  </button>
                )}
              </div>

              {/* 当没有输入时，以精巧可点击标签流式排布 */}
              {!query.trim() ? (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {matches.map((item, idx) => (
                    <div
                      key={item.text}
                      className={cn(
                        'group inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer select-none',
                        activeIndex === idx
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : 'bg-surface hover:bg-hover border-line text-content hover:border-accent/40'
                      )}
                      onClick={() => submitSearch(item.text)}
                    >
                      <span className="truncate max-w-[180px]">{item.text}</span>
                      <button
                        type="button"
                        className={cn(
                          'p-0.5 rounded-full transition-colors',
                          activeIndex === idx
                            ? 'text-white/80 hover:text-white hover:bg-white/20'
                            : 'text-muted hover:text-danger hover:bg-surface-raised'
                        )}
                        onClick={(e) => handleRemoveHistory(e, item.text)}
                        title={`删除「${item.text}」`}
                      >
                        <Icon name="close" className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                /* 有输入关键词时，以匹配列表垂直呈现 */
                <div className="space-y-1">
                  {matches.map((item, idx) => {
                    const isSelected = activeIndex === idx + 1;
                    return (
                      <div
                        key={item.text}
                        className={cn(
                          'flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all border',
                          isSelected
                            ? 'bg-accent/15 border-accent text-accent font-medium'
                            : 'bg-surface/60 hover:bg-hover border-line/40 text-content'
                        )}
                        onClick={() => submitSearch(item.text)}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Icon name="clock" className="w-3.5 h-3.5 text-muted shrink-0" />
                          <span className="text-sm truncate">{item.text}</span>
                        </div>
                        <button
                          type="button"
                          className="p-1 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          onClick={(e) => handleRemoveHistory(e, item.text)}
                          title="删除此记录"
                        >
                          <Icon name="close" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 快捷频道直达导航 */}
          {!query.trim() && (
            <div className="space-y-2.5 pt-1">
              <span className="text-xs font-semibold text-muted tracking-wide px-1 block">
                频道快速直达
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {QUICK_CHANNELS.map((ch) => (
                  <button
                    key={ch.label}
                    type="button"
                    className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface hover:bg-hover border border-line hover:border-accent/40 text-left transition-all group cursor-pointer"
                    onClick={() => {
                      onClose();
                      router.push(ch.href);
                    }}
                  >
                    <span className="text-lg group-hover:scale-110 transition-transform">{ch.icon}</span>
                    <span className="text-xs sm:text-sm font-medium text-content group-hover:text-accent transition-colors">
                      {ch.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部按键提示底栏 */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface/80 border-t border-line text-[11px] text-faint">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface-raised border border-line rounded text-[10px] font-mono">↵</kbd>
              搜索
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface-raised border border-line rounded text-[10px] font-mono">↑↓</kbd>
              导航
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface-raised border border-line rounded text-[10px] font-mono">ESC</kbd>
              关闭
            </span>
          </div>
          <span className="hidden sm:inline font-mono tracking-tight text-accent/80">cl.tv 极速秒播引擎</span>
        </div>
      </div>
    </div>
  );
}
