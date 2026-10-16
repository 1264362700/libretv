'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ThemeToggle } from './theme';
import { useAuth } from './auth';
import { SourceManagerDrawer } from './source-manager';
import { HistoryPanel } from './history-panel';
import { requestShowDownloadManager } from './download-manager';
import { Icon } from './icon';
import { SearchHistoryDropdown, useSearchHistory } from './search-history';
import { cn } from '@/lib/utils';

export const CHANNELS = [
  { id: 'home', label: '首页', href: '/' },
  { id: 'movie', label: '电影', href: '/catalog?type=movie' },
  { id: 'tv', label: '电视剧', href: '/catalog?type=tv' },
  { id: 'anime', label: '动漫', href: '/catalog?type=anime' },
  { id: 'variety', label: '综艺', href: '/catalog?type=variety' },
  { id: 'catalog', label: '片库', href: '/catalog' },
  { id: 'live', label: '直播', href: '/live' },
];

/** 顶部导航：Logo、全频道大厅入口、搜索框、历史、设置与移动端专属频道栏 */
export function Header({ showSearch = false }: { showSearch?: boolean }) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchHistory = useSearchHistory(query);

  const { verified, user, isAdmin, openLogin, openAdminModal, logout } = useAuth();

  const submitSearch = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    searchHistory.close();
    router.push(`/?s=${encodeURIComponent(q)}`, { scroll: false });
    searchHistory.record(q);
  };

  const pickHistory = (text: string) => {
    setQuery(text);
    submitSearch(text);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line shadow-xs">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" aria-label="星芒影院 首页" className="flex items-center gap-2.5 shrink-0 group">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg border border-line/70 bg-surface/80 group-hover:border-accent/70 group-hover:bg-accent/5 transition-all">
              <svg className="w-4.5 h-4.5 text-accent transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2.5" y="4" width="19" height="13" rx="3" />
                <polygon points="10 8 15.5 10.5 10 13 10 8" />
                <line x1="8" y1="20" x2="16" y2="20" />
                <line x1="12" y1="17" x2="12" y2="20" />
              </svg>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-bold tracking-tight text-content group-hover:text-accent transition-colors">
                星芒<span className="text-accent">影院</span>
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-line text-muted tracking-wider uppercase hidden sm:inline-block">
                NOVA
              </span>
            </div>
          </Link>

          {/* 桌面端频道大导航 */}
          <Suspense fallback={null}>
            <DesktopChannelNav />
          </Suspense>

          {showSearch && (
            <form
              className="flex-1 max-w-sm lg:max-w-md hidden sm:block ml-auto"
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch(query);
              }}
            >
              <div ref={searchHistory.containerRef} className="relative">
                <input
                  className={cn(
                    'input w-full h-9 text-xs sm:text-sm',
                    searchHistory.visible &&
                      'rounded-b-none border-accent border-b-line bg-surface-raised focus-visible:ring-0'
                  )}
                  aria-label="搜索影片"
                  placeholder="搜索影片..."
                  value={query}
                  maxLength={100}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    searchHistory.resetActive();
                  }}
                  onFocus={searchHistory.onFocus}
                  onKeyDown={(e) => searchHistory.onKeyDown(e, pickHistory)}
                  role="combobox"
                  aria-expanded={searchHistory.visible}
                  aria-controls="header-search-history"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    searchHistory.visible && searchHistory.activeIndex >= 0
                      ? `header-search-history-${searchHistory.activeIndex}`
                      : undefined
                  }
                />
                {searchHistory.visible && (
                  <SearchHistoryDropdown
                    id="header-search-history"
                    matches={searchHistory.matches}
                    activeIndex={searchHistory.activeIndex}
                    onPick={pickHistory}
                    onRemove={searchHistory.remove}
                    onClearAll={searchHistory.clearAll}
                  />
                )}
              </div>
            </form>
          )}

          <div className="flex-1 sm:hidden" />

          {/* 右侧功能入口组 */}
          <nav className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto sm:ml-0">
            <div className="hidden lg:inline-flex">
              <HeaderLink href="/about" active={false}>
                关于
              </HeaderLink>
            </div>
            <ThemeToggle />
            <IconButton label="观看历史" onClick={() => setHistoryOpen(true)}>
              <Icon name="clock" />
            </IconButton>
            <div className="hidden sm:inline-flex">
              <IconButton label="下载管理" onClick={requestShowDownloadManager}>
                <Icon name="download" />
              </IconButton>
            </div>
            <IconButton label="设置" onClick={() => setSettingsOpen(true)}>
              <Icon name="gear" />
            </IconButton>

            {/* 管理员专属后台入口 */}
            {isAdmin && (
              <button
                className="px-2 py-1 rounded-lg text-xs font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-300 hover:bg-purple-500/25 active:scale-95 transition-all flex items-center gap-1 shrink-0"
                onClick={openAdminModal}
                title="打开管理员后台（邀请码、用户与全局源）"
              >
                <span>👑</span>
                <span className="hidden sm:inline">管理中心</span>
              </button>
            )}

            {/* 用户状态或登录入口 */}
            {verified ? (
              <div className="flex items-center gap-1 pl-1 border-l border-line/60">
                <span
                  className="text-xs text-faint max-w-[4rem] sm:max-w-[5rem] truncate hidden sm:inline"
                  title={`当前账号: ${user?.username}`}
                >
                  {user?.username}
                </span>
                <button
                  className="px-2 py-1 rounded-lg text-muted hover:text-danger hover:bg-danger/10 text-xs active:scale-90 transition-all cursor-pointer shrink-0"
                  onClick={logout}
                  title="登出账号"
                >
                  退出
                </button>
              </div>
            ) : (
              <button
                className="btn-primary px-2.5 py-1 text-xs rounded-lg active:scale-95 shrink-0"
                onClick={openLogin}
              >
                <span className="sm:hidden">登录</span>
                <span className="hidden sm:inline">登录 / 注册</span>
              </button>
            )}
          </nav>
        </div>

        {/* 移动端专属横向滑动频道栏：极简、单行顺滑、彻底避免顶栏换行拥挤 */}
        <Suspense fallback={null}>
          <MobileChannelBar />
        </Suspense>
      </header>

      <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}

function useCurrentChannelId(): string {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname === '/live') return 'live';
  if (pathname === '/catalog') {
    const t = searchParams?.get('type');
    if (t === 'movie') return 'movie';
    if (t === 'tv') return 'tv';
    if (t === 'anime') return 'anime';
    if (t === 'variety') return 'variety';
    return 'catalog';
  }
  if (pathname === '/') return 'home';
  return '';
}

function DesktopChannelNav() {
  const currentId = useCurrentChannelId();

  return (
    <nav className="hidden md:flex items-center gap-1 ml-1 lg:ml-3">
      {CHANNELS.map((ch) => {
        const isActive = currentId === ch.id;
        return (
          <HeaderLink key={ch.id} href={ch.href} active={isActive}>
            {ch.label}
          </HeaderLink>
        );
      })}
    </nav>
  );
}

function MobileChannelBar() {
  const currentId = useCurrentChannelId();

  return (
    <div className="md:hidden border-t border-line/40 px-3 py-1.5 overflow-x-auto no-scrollbar flex items-center gap-1.5 bg-surface/95">
      {CHANNELS.map((ch) => {
        const isActive = currentId === ch.id;
        return (
          <Link
            key={ch.id}
            href={ch.href}
            className={cn(
              'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all active:scale-95 touch-manipulation',
              isActive
                ? 'bg-accent text-on-accent font-semibold shadow-xs'
                : 'text-muted hover:text-content hover:bg-hover bg-chip/40'
            )}
          >
            {ch.label}
          </Link>
        );
      })}
    </div>
  );
}

function HeaderLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all touch-manipulation active:scale-95',
        active ? 'text-accent bg-accent/10 font-semibold' : 'text-muted hover:text-content hover:bg-hover'
      )}
    >
      {children}
    </Link>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="p-1.5 sm:p-2 rounded-lg text-muted hover:text-content hover:bg-hover active:scale-90 transition-all touch-manipulation"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
