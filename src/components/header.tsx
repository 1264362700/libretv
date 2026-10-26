'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ThemeToggle } from './theme';
import { LanguageToggle } from './language-toggle';
import { useAuth } from './auth';
import { Drawer } from './drawer';
import { SourceManagerDrawer } from './source-manager';
import { HistoryPanel } from './history-panel';
import { requestShowDownloadManager } from './download-manager';
import { SHOW_HISTORY_EVENT, SHOW_SETTINGS_EVENT } from './mobile-bottom-bar';
import { Icon } from './icon';
import { SpotlightModal } from './spotlight-modal';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { DRAWER_NAV, HEADER_NAV } from '@/lib/channels';

/** 顶栏导航项：频道部分由 @/lib/channels 单一来源派生，此处仅做转出兼容旧引用 */
export const CHANNELS = HEADER_NAV;

/**
 * NovaTV Cinema Ultra 顶部毛玻璃导航栏
 * 融合 NovaTV 原生品牌视觉（鎏金 N 徽标 + NovaTV Cinema Ultra + 沉浸式滚动渐变毛玻璃）
 * 与 LibreTV 播放源管理、历史记录、管理员后台及登录鉴权体系
 */
export function Header() {
  return (
    <Suspense fallback={<HeaderShell isHeroOverlay={false} />}>
      <HeaderInner />
    </Suspense>
  );
}

function HeaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasSearchQuery = Boolean(searchParams?.get('s'));
  // 首页无搜索态时启用全屏海报沉浸悬浮顶栏 (fixed + 顶部暗角渐变 -> 滚动切换 glass-nav)
  const isHeroOverlay = pathname === '/' && !hasSearchQuery;
  return <HeaderShell isHeroOverlay={isHeroOverlay} />;
}

function HeaderShell({ isHeroOverlay }: { isHeroOverlay: boolean }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const { verified, user, isAdmin, openAdminModal, logout } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleHistory = () => setHistoryOpen(true);
    const handleSettings = () => setSettingsOpen(true);
    window.addEventListener(SHOW_HISTORY_EVENT, handleHistory);
    window.addEventListener(SHOW_SETTINGS_EVENT, handleSettings);
    return () => {
      window.removeEventListener(SHOW_HISTORY_EVENT, handleHistory);
      window.removeEventListener(SHOW_SETTINGS_EVENT, handleSettings);
    };
  }, []);

  // ⌘K 或 Ctrl+K 全局快捷键呼出 Spotlight 搜索
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <header
        className={cn(
          'left-0 right-0 z-50 transition-all duration-300',
          isHeroOverlay ? 'fixed top-0' : 'sticky top-0',
          !isHeroOverlay || scrolled
            ? 'glass-nav py-3 shadow-lg'
            : 'bg-gradient-to-b from-[#0B0F19]/90 to-transparent py-4'
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          {/* 左侧：移动端汉堡菜单 + NovaTV Cinema Ultra 品牌 Logo + 频道导航 */}
          <div className="flex items-center gap-3 lg:gap-8 min-w-0">
            <button
              type="button"
              className="lg:hidden p-1.5 -ml-1 rounded-lg text-muted hover:text-content hover:bg-hover active:scale-90 transition-all touch-manipulation cursor-pointer"
              onClick={() => setMobileNavOpen(true)}
              aria-label="打开侧边导航"
              title="打开侧边导航"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3.5" y1="6" x2="20.5" y2="6" />
                <line x1="3.5" y1="12" x2="20.5" y2="12" />
                <line x1="3.5" y1="18" x2="20.5" y2="18" />
              </svg>
            </button>

            {/* NovaTV 标志性鎏金品牌 Logo */}
            <Link href="/" prefetch={false} aria-label="NovaTV 首页" className="flex items-center gap-2.5 group shrink-0 select-none">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-600 flex items-center justify-center shadow-glow-gold group-hover:scale-105 transition-transform duration-200">
                <span className="text-black font-black text-xl tracking-tighter">N</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold tracking-tight text-content group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors leading-none">
                  Nova<span className="text-amber-500 dark:text-amber-400 font-black">TV</span>
                </span>
                <span className="text-[10px] text-muted tracking-widest font-mono uppercase mt-0.5">
                  Cinema Ultra
                </span>
              </div>
            </Link>

            {/* 桌面端频道导航 */}
            <Suspense fallback={null}>
              <DesktopChannelNav />
            </Suspense>
          </div>

          {/* 右侧：NovaTV Spotlight 搜索框 + 历史/源设置/管理后台/账号鉴权 */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* NovaTV Spotlight 搜索触发器 */}
            <button
              type="button"
              onClick={() => setSpotlightOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-chip/70 hover:bg-hover text-muted hover:text-content border border-line text-xs transition-all duration-200 group cursor-pointer min-w-0"
              title="全局搜索 (⌘K / Ctrl+K)"
              aria-label="全局搜索 (⌘K)"
            >
              <Icon name="search" className="w-4 h-4 text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
              <span className="hidden sm:inline font-normal truncate min-w-0 max-w-[120px]">{t('nav.searchPlaceholder', '搜索片名、演员、导演...')}</span>
              <span className="sm:hidden font-normal shrink-0">搜索</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-surface border border-line text-muted rounded shrink-0">
                ⌘K
              </kbd>
            </button>

            <div className="hidden sm:flex items-center gap-1">
              <LanguageToggle />
              <ThemeToggle />
              <button
                type="button"
                title={t('nav.history', '观看历史')}
                aria-label={t('nav.history', '观看历史')}
                onClick={() => setHistoryOpen(true)}
                className="p-2 rounded-xl text-muted hover:text-amber-500 dark:hover:text-amber-400 hover:bg-hover transition-colors border border-transparent hover:border-line cursor-pointer"
              >
                <Icon name="clock" className="w-4 h-4" />
              </button>
              <button
                type="button"
                title={t('nav.settings', '播放源与设置')}
                aria-label={t('nav.settings', '播放源与设置')}
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-xl text-muted hover:text-amber-500 dark:hover:text-amber-400 hover:bg-hover transition-colors border border-transparent hover:border-line cursor-pointer"
              >
                <Icon name="gear" className="w-4 h-4" />
              </button>
            </div>

            {/* 管理员专属后台入口 */}
            {isAdmin && (
              <button
                type="button"
                className="hidden md:inline-flex px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 active:scale-95 transition-all items-center gap-1 shrink-0 cursor-pointer"
                onClick={openAdminModal}
                title="打开管理员后台（邀请码、用户与全局源）"
              >
                <span>👑</span>
                <span className="hidden xl:inline">{t('nav.admin', '管理中心')}</span>
              </button>
            )}

            {/* 用户登录态与退出 */}
            {verified ? (
              <div className="hidden md:flex items-center gap-1.5 pl-1.5 border-l border-line">
                <span
                  className="text-xs text-muted max-w-[4.5rem] truncate hidden sm:inline font-medium"
                  title={`当前账号: ${user?.username}`}
                >
                  {user?.username}
                </span>
                <button
                  type="button"
                  className="px-2 py-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 text-xs active:scale-90 transition-all cursor-pointer shrink-0"
                  onClick={logout}
                  title="登出账号"
                >
                  {t('nav.logout', '退出')}
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-bold text-[11px] sm:text-xs shadow-glow-gold hover:brightness-110 active:scale-95 transition-all shrink-0 truncate max-w-[80px] sm:max-w-none"
              >
                <span className="sm:hidden">{t('nav.login', '登录')}</span>
                <span className="hidden sm:inline">{t('nav.loginOrRegister', '登录 / 注册')}</span>
              </Link>
            )}
          </div>
        </div>

        {/* 平板与手机端专属频道横滑栏 */}
        <Suspense fallback={null}>
          <TabletMobileChannelBar />
        </Suspense>
      </header>

      <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <Suspense fallback={null}>
        <MobileNavDrawer
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </Suspense>
      <SpotlightModal open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
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
    if (t === 'documentary') return 'documentary';
    return 'movie';
  }
  if (pathname === '/') return 'home';
  return '';
}

function DesktopChannelNav() {
  const currentId = useCurrentChannelId();
  const { t } = useTranslation();

  return (
    <nav className="hidden lg:flex items-center gap-1 shrink-0">
      {CHANNELS.map((ch) => {
        const isActive = currentId === ch.id;
        return (
          <Link
            key={ch.id}
            href={ch.href}
            prefetch={false}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap shrink-0',
              isActive
                ? 'bg-amber-400 text-slate-950 font-bold shadow-glow-gold'
                : 'text-muted hover:text-content hover:bg-hover'
            )}
          >
            {t(`nav.${ch.id}`, ch.label)}
          </Link>
        );
      })}
    </nav>
  );
}

function TabletMobileChannelBar() {
  const currentId = useCurrentChannelId();
  const { t } = useTranslation();

  return (
    <div className="lg:hidden mt-2 pt-2 border-t border-white/5 px-4 sm:px-6 overflow-x-auto no-scrollbar flex items-center justify-start md:justify-center gap-1.5">
      {CHANNELS.map((ch) => {
        const isActive = currentId === ch.id;
        return (
          <Link
            key={ch.id}
            href={ch.href}
            prefetch={false}
            className={cn(
              'shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-all active:scale-95 touch-manipulation whitespace-nowrap',
              isActive
                ? 'bg-amber-400 text-slate-950 font-bold shadow-glow-gold'
                : 'text-slate-300 hover:text-white bg-white/5'
            )}
          >
            {t(`nav.${ch.id}`, ch.label)}
          </Link>
        );
      })}
    </div>
  );
}

function MobileNavDrawer({
  open,
  onClose,
  onOpenHistory,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}) {
  const currentId = useCurrentChannelId();
  const { verified, user, isAdmin, openAdminModal, logout } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [drawerQuery, setDrawerQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = drawerQuery.trim();
    if (!q) return;
    onClose();
    router.push(`/?s=${encodeURIComponent(q)}`);
  };

  const navItems = DRAWER_NAV;

  return (
    <Drawer open={open} onClose={onClose} title="NovaTV 导航" side="left" width="max-w-[290px]">
      <div className="space-y-4">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            className="input w-full h-8.5 text-xs pl-8 pr-2"
            placeholder={t('nav.searchPlaceholder', '搜索影片、演员或剧集...')}
            value={drawerQuery}
            onChange={(e) => setDrawerQuery(e.target.value)}
          />
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            <Icon name="search" className="w-3.5 h-3.5" />
          </div>
        </form>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-faint px-2 uppercase tracking-wider">{t('nav.catalog', '探索频道')}</p>
          {navItems.map((item) => {
            const active = currentId === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 touch-manipulation',
                  active
                    ? 'bg-amber-500/15 text-amber-400 font-semibold shadow-xs'
                    : 'text-muted hover:text-content hover:bg-hover'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{item.icon}</span>
                  <div className="flex flex-col text-left">
                    <span className={cn(active ? 'text-amber-400 font-bold' : 'text-content')}>{t(`nav.${item.id}`, item.label)}</span>
                    {item.desc && <span className="text-[10px] text-faint font-normal">{item.desc}</span>}
                  </div>
                </div>
                {active && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
              </Link>
            );
          })}
        </div>

        <div className="pt-2 border-t border-line/50 space-y-1">
          <p className="text-[11px] font-semibold text-faint px-2 uppercase tracking-wider">{t('nav.settings', '实用工具')}</p>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenHistory();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted hover:text-content hover:bg-hover transition-all active:scale-95 text-left cursor-pointer"
          >
            <Icon name="clock" className="w-4 h-4 text-muted" />
            <span>{t('nav.history', '观看历史')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted hover:text-content hover:bg-hover transition-all active:scale-95 text-left cursor-pointer"
          >
            <Icon name="gear" className="w-4 h-4 text-muted" />
            <span>{t('nav.settings', '播放源与设置')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              requestShowDownloadManager();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted hover:text-content hover:bg-hover transition-all active:scale-95 text-left cursor-pointer"
          >
            <Icon name="download" className="w-4 h-4 text-muted" />
            <span>{t('nav.downloads', '下载管理')}</span>
          </button>
          <div className="flex items-center justify-between px-3 py-1.5 rounded-xl text-xs text-muted bg-chip/30">
            <span className="flex items-center gap-2">
              <span className="text-sm">🌓</span>
              <span>外观模式</span>
            </span>
            <ThemeToggle showLabel />
          </div>
          <Link
            href="/about"
            onClick={onClose}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted hover:text-content hover:bg-hover transition-all active:scale-95"
          >
            <span className="text-sm">ℹ️</span>
            <span>关于 NovaTV</span>
          </Link>
        </div>

        <div className="pt-2 border-t border-line/50 space-y-2">
          {verified ? (
            <div className="bg-chip/50 rounded-xl p-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 truncate">
                <span>👤</span>
                <span className="font-medium text-content truncate">{user?.username}</span>
              </div>
              <button
                onClick={() => {
                  onClose();
                  logout();
                }}
                className="text-danger hover:underline text-xs shrink-0 cursor-pointer"
              >
                {t('nav.logout', '退出')}
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              onClick={onClose}
              className="w-full py-2 text-xs rounded-xl font-bold bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center cursor-pointer"
            >
              {t('nav.loginOrRegister', '登录 / 注册')}
            </Link>
          )}

          {isAdmin && (
            <button
              onClick={() => {
                onClose();
                openAdminModal();
              }}
              className="w-full py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>👑</span>
              <span>{t('nav.admin', '管理中心')}</span>
            </button>
          )}
        </div>
      </div>
    </Drawer>
  );
}
