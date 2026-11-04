'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db, addSearchHistory, removeSearchHistory, clearSearchHistory } from '@/lib/db';
import { TRENDING_SEARCH_KEYWORDS } from './search-history';
import { Icon } from './icon';
import { SmartImage } from './smart-image';
import { useTheme } from './theme';
import { useAuth } from './auth';
import { useAppStore } from '@/lib/store';
import { buildWatchUrl, cn, formatTime } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { QUICK_CHANNELS as QUICK_CHANNELS_SOURCE } from '@/lib/channels';
import type { TmdbMediaItem } from '@/lib/tmdb';

interface SpotlightSuggestItem {
  id: string;
  title: string;
  year?: string;
  img?: string;
  subTitle?: string;
}

async function fetchTmdbSuggest(keyword: string, signal?: AbortSignal): Promise<SpotlightSuggestItem[]> {
  const q = keyword.trim();
  if (!q) return [];
  const res = await fetch(`/api/media/feed?q=${encodeURIComponent(q)}&page=1`, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  const items: TmdbMediaItem[] = Array.isArray(data.items) ? data.items : [];
  return items.slice(0, 6).map((item) => ({
    id: item.id,
    title: item.title,
    year: item.year,
    img: item.cover,
    subTitle: item.card_subtitle || item.overview,
  }));
}

interface SpotlightModalProps {
  open: boolean;
  onClose: () => void;
}

/** 快捷频道入口由 @/lib/channels 单一来源派生（含首页/直播的固定项） */
const QUICK_CHANNELS = QUICK_CHANNELS_SOURCE;

export function SpotlightModal({ open, onClose }: SpotlightModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { resolved, setTheme } = useTheme();
  const { verified } = useAuth();
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(timer);
  }, [query]);

  const history = useQuery({
    queryKey: ['searchHistory'],
    queryFn: () => db.searchHistory.orderBy('timestamp').reverse().limit(15).toArray(),
    enabled: open,
  });

  // 本地观看历史与追剧单：支持即搜即播
  const watchRecords = useQuery({
    queryKey: ['spotlight-local-media'],
    queryFn: async () => {
      const [recentHistory, favs] = await Promise.all([
        db.history.orderBy('timestamp').reverse().limit(20).toArray(),
        db.favorites.orderBy('updatedAt').reverse().limit(20).toArray(),
      ]);
      return { recentHistory, favs };
    },
    enabled: open,
  });

  // 实时海报联想：输入关键词时即时返回匹配的影视条目与海报
  const suggestQuery = useQuery({
    queryKey: ['spotlight-tmdb-suggest', debouncedQuery],
    queryFn: ({ signal }) => fetchTmdbSuggest(debouncedQuery, signal),
    enabled: open && debouncedQuery.length > 0 && !debouncedQuery.startsWith('>'),
    staleTime: 5 * 60_000,
  });

  const matches = useMemo(() => {
    const all = history.data ?? [];
    const keyword = query.trim().toLowerCase();
    return keyword ? all.filter((h) => h.text.toLowerCase().includes(keyword)) : all;
  }, [history.data, query]);

  // 匹配本地继续观看 / 追剧条目
  const matchedLocalMedia = useMemo(() => {
    const raw = query.trim().toLowerCase();
    const cleanKw = raw.startsWith('>') ? '' : raw;
    const hist = watchRecords.data?.recentHistory ?? [];
    const favs = watchRecords.data?.favs ?? [];
    const seen = new Set<string>();
    const combined: Array<{
      id: string;
      title: string;
      pic?: string;
      badge: string;
      watchHref: string;
    }> = [];

    for (const h of hist) {
      if (cleanKw && !h.title.toLowerCase().includes(cleanKw)) continue;
      if (seen.has(h.title)) continue;
      seen.add(h.title);
      const epLabel = h.totalEpisodes > 1 ? `第${h.episodeIndex + 1}集` : '正片';
      const posLabel = h.playbackPosition && h.playbackPosition > 5 ? ` · ${formatTime(h.playbackPosition)}` : '';
      combined.push({
        id: `hist-${h.id ?? h.title}`,
        title: h.title,
        pic: h.pic,
        badge: `继续观看 · ${epLabel}${posLabel}`,
        watchHref: buildWatchUrl({
          sourceKey: h.sourceKey,
          vodId: h.vodId,
          index: h.episodeIndex,
          title: h.title,
          sourceUrl: h.sourceUrl,
          position: h.playbackPosition && h.playbackPosition > 5 ? Math.floor(h.playbackPosition) : undefined,
        }),
      });
      if (combined.length >= 4) break;
    }

    for (const f of favs) {
      if (combined.length >= 4) break;
      if (cleanKw && !f.title.toLowerCase().includes(cleanKw)) continue;
      if (seen.has(f.title)) continue;
      seen.add(f.title);
      combined.push({
        id: `fav-${f.id}`,
        title: f.title,
        pic: f.pic,
        badge: `★ 我的追剧${f.remarks ? ` · ${f.remarks}` : ''}`,
        watchHref: buildWatchUrl({
          sourceKey: f.sourceKey,
          vodId: f.vodId,
          title: f.title,
          sourceUrl: f.sourceUrl,
          year: f.year,
        }),
      });
    }

    return combined;
  }, [watchRecords.data, query]);

  // 打开时重置输入并自聚焦，锁定页面滚动
  useEffect(() => {
    if (open) {
      setQuery('');
      setDebouncedQuery('');
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

  const navigateToWatch = (watchUrl: string, recordKeyword?: string) => {
    if (recordKeyword?.trim()) {
      addSearchHistory(recordKeyword.trim().slice(0, 100))
        .then(() => queryClient.invalidateQueries({ queryKey: ['searchHistory'] }))
        .catch(() => {});
    }
    onClose();
    if (!verified) {
      router.push(`/login?redirect=${encodeURIComponent(watchUrl)}`);
      return;
    }
    router.push(watchUrl);
  };

  const submitSearch = (text: string) => {
    const q = text.trim().replace(/^>\s*/, '').slice(0, 100);
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

  const suggestItems = (suggestQuery.data ?? []).slice(0, 5);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="全局影片搜索与快捷命令"
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-start justify-center pt-[10vh] sm:pt-[14vh] px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface-raised dark:bg-zinc-900 border border-line rounded-2xl shadow-2xl overflow-hidden backdrop-blur flex flex-col max-h-[78vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部搜索大输入条 */}
        <div className="flex items-center px-4 py-3.5 border-b border-line gap-3 bg-surface/50">
          <Icon name="search" className="w-5 h-5 text-accent shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-content placeholder:text-muted/60 text-base sm:text-lg outline-none min-w-0"
            placeholder={t('search.placeholder', '搜索电影、剧集、演员，或直接秒播继续观看...')}
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
        <div className="overflow-y-auto max-h-[60vh] p-4 space-y-5 scrollbar-thin">
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

          {/* 豆瓣实时海报联想：即搜即播 */}
          {query.trim() && suggestItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-muted tracking-wide flex items-center gap-1.5">
                  <span>⚡</span>
                  <span>即搜即播（点击直达播放页）</span>
                </span>
                {suggestQuery.isFetching && (
                  <span className="text-[10px] text-accent animate-pulse">联想中…</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestItems.map((item) => {
                  const watchHref = buildWatchUrl({
                    title: item.title,
                    doubanId: item.id,
                    year: item.year,
                  });
                  return (
                    <button
                      key={`${item.id}-${item.title}`}
                      type="button"
                      onClick={() => navigateToWatch(watchHref, item.title)}
                      className="flex items-center gap-2.5 p-2 rounded-xl bg-surface hover:bg-hover border border-line/60 hover:border-accent/50 text-left transition-all group cursor-pointer"
                    >
                      <div className="w-10 h-14 rounded-lg bg-chip overflow-hidden shrink-0 border border-line/40">
                        {item.img ? (
                          <SmartImage
                            url={item.img}
                            mode={imageProxyMode}
                            customProxy={customImageProxy}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-faint">🎬</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-semibold text-content group-hover:text-accent truncate">
                            {item.title}
                          </span>
                          {item.year && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-chip text-muted font-mono shrink-0">
                              {item.year}
                            </span>
                          )}
                        </div>
                        {item.subTitle && (
                          <p className="text-[11px] text-faint truncate mt-0.5">{item.subTitle}</p>
                        )}
                        <span className="inline-flex items-center gap-1 text-[10px] text-accent font-medium mt-1">
                          ▶ 立即秒播
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 本地继续观看与追剧单秒播匹配 */}
          {matchedLocalMedia.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted tracking-wide px-1 flex items-center gap-1.5">
                <span>▶</span>
                <span>{query.trim() ? '本地继续观看 / 追剧匹配' : '继续观看与追剧直达'}</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {matchedLocalMedia.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => navigateToWatch(m.watchHref)}
                    className="flex items-center gap-2.5 p-2 rounded-xl bg-surface hover:bg-hover border border-line/60 hover:border-accent/50 text-left transition-all group cursor-pointer"
                  >
                    <div className="w-9 h-12 rounded-lg bg-chip overflow-hidden shrink-0 border border-line/40">
                      {m.pic ? (
                        <SmartImage
                          url={m.pic}
                          mode={imageProxyMode}
                          customProxy={customImageProxy}
                          alt={m.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-faint">▶</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-semibold text-content group-hover:text-accent truncate">
                        {m.title}
                      </p>
                      <p className="text-[11px] text-accent/90 truncate mt-0.5">{m.badge}</p>
                    </div>
                  </button>
                ))}
              </div>
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

              {!query.trim() ? (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {matches.map((item, idx) => (
                    <div
                      key={item.text}
                      className={cn(
                        'group inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer select-none animate-slide-in-left',
                        activeIndex === idx
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : 'bg-surface hover:bg-hover border-line text-content hover:border-accent/40'
                      )}
                      style={{ animationDelay: `${idx * 40}ms` }}
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

          {/* 🔥 全网热门搜索热榜推荐 */}
          {!query.trim() && (
            <div className="space-y-2.5">
              <span className="text-xs font-semibold text-muted tracking-wide px-1 flex items-center gap-1.5">
                <span>🔥</span>
                <span>全网热门搜索榜</span>
              </span>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {TRENDING_SEARCH_KEYWORDS.map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => submitSearch(kw)}
                    className="px-3 py-1.5 rounded-xl border border-line/60 bg-surface hover:bg-accent hover:text-on-accent text-content hover:border-accent text-xs font-medium transition-all active:scale-95 cursor-pointer select-none"
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 快捷命令与频道直达导航（Command Palette） */}
          {!query.trim() && (
            <div className="space-y-2.5 pt-1">
              <span className="text-xs font-semibold text-muted tracking-wide px-1 block">
                快捷指令与频道直达
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface hover:bg-hover border border-line hover:border-accent/40 text-left transition-all group cursor-pointer"
                  onClick={() => {
                    setTheme(resolved === 'dark' ? 'light' : 'dark');
                    onClose();
                  }}
                >
                  <span className="text-lg group-hover:scale-110 transition-transform">
                    {resolved === 'dark' ? '☀️' : '🌙'}
                  </span>
                  <span className="text-xs sm:text-sm font-medium text-content group-hover:text-accent transition-colors">
                    {resolved === 'dark' ? '切换浅色模式' : '切换深色模式'}
                  </span>
                </button>
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
          <span className="hidden sm:inline font-mono tracking-tight text-amber-400/90">NovaTV Cinema Ultra · 4K 臻选</span>
        </div>
      </div>
    </div>
  );
}
