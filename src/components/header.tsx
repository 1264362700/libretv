'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from './theme';
import { useAuth } from './auth';
import { SourceManagerDrawer } from './source-manager';
import { HistoryPanel } from './history-panel';
import { requestShowDownloadManager } from './download-manager';
import { Icon } from './icon';
import { SearchHistoryDropdown, useSearchHistory } from './search-history';
import { cn } from '@/lib/utils';

/** 顶部导航：Logo、搜索框（首页外）、历史、设置 */
export function Header({ showSearch = false }: { showSearch?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  // 与首页搜索框共用同一套「最近搜索」下拉逻辑
  const searchHistory = useSearchHistory(query);

  const { verified, user, isAdmin, openLogin, openAdminModal, logout } = useAuth();

  const submitSearch = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    searchHistory.close();
    router.push(`/?s=${encodeURIComponent(q)}`, { scroll: false });
    // 顶栏搜索一并写入最近搜索（此前只有首页会记录）
    searchHistory.record(q);
  };

  const pickHistory = (text: string) => {
    setQuery(text);
    submitSearch(text);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" aria-label="LibreTV 首页" className="flex items-center gap-2.5 shrink-0 group">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-accent via-indigo-500 to-purple-500 shadow-md shadow-accent/25 group-hover:scale-105 transition-transform duration-200">
              <svg className="w-4 h-4 text-white fill-current translate-x-0.5" viewBox="0 0 24 24">
                <path d="M5 3.868v16.264c0 .848.94 1.36 1.65.908l13.25-8.132a1.07 1.07 0 000-1.816L6.65 2.96C5.94 2.508 5 3.02 5 3.868z" />
              </svg>
              <div className="absolute inset-0 rounded-xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-content via-content to-accent bg-clip-text text-transparent">
                Libre<span className="text-accent">TV</span>
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-accent/15 text-accent border border-accent/20 tracking-wider uppercase hidden sm:inline-block">
                CINEMA
              </span>
            </div>
          </Link>

          {showSearch && (
            <form
              className="flex-1 max-w-xl hidden sm:block"
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch(query);
              }}
            >
              <div ref={searchHistory.containerRef} className="relative">
                <input
                  className={cn(
                    'input w-full h-9',
                    // 展开时：上圆角与外框沿用聚焦样式，底边改为内部分隔线，与下拉拼成同一面板
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

          <nav className="flex items-center gap-0.5 sm:gap-1.5 ml-auto">
            <HeaderLink href="/live" active={pathname === '/live'}>
              直播
            </HeaderLink>
            <HeaderLink href="/about" active={pathname === '/about'}>
              关于
            </HeaderLink>
            <ThemeToggle />
            <IconButton label="观看历史" onClick={() => setHistoryOpen(true)}>
              <Icon name="clock" />
            </IconButton>
            <IconButton label="下载管理" onClick={requestShowDownloadManager}>
              <Icon name="download" />
            </IconButton>
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
                  className="text-xs text-faint max-w-[5rem] truncate hidden sm:inline"
                  title={`当前账号: ${user?.username}`}
                >
                  {user?.username}
                </span>
                <button
                  className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 text-xs active:scale-90 transition-all"
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
                登录 / 注册
              </button>
            )}
          </nav>
        </div>
      </header>

      <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}

function HeaderLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'px-2 sm:px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all touch-manipulation active:scale-95',
        active ? 'text-content bg-hover font-semibold' : 'text-muted hover:text-content'
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
