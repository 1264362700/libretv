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

export const CHANNELS = [
  { id: 'home', label: '首页', href: '/' },
  { id: 'movie', label: '电影', href: '/catalog?type=movie' },
  { id: 'tv', label: '电视剧', href: '/catalog?type=tv' },
  { id: 'short_drama', label: '短剧', href: '/catalog?type=short_drama' },
  { id: 'ai', label: 'AI专区', href: '/catalog?type=ai' },
  { id: 'anime', label: '动漫', href: '/catalog?type=anime' },
  { id: 'variety', label: '综艺', href: '/catalog?type=variety' },
  { id: 'documentary', label: '纪录片', href: '/catalog?type=documentary' },
  { id: 'catalog', label: '片库', href: '/catalog' },
  { id: 'live', label: '直播', href: '/live' },
];

/** 顶部导航：Logo、全频道大厅入口、搜索框、历史、设置与移动端专属频道栏 */
export function Header(_props?: { showSearch?: boolean }) {
  void _props;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  const { verified, user, isAdmin, openAdminModal, logout } = useAuth();
  const { t } = useTranslation();

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
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center gap-2 sm:gap-3 lg:gap-4">
          {/* 手机与平板竖屏模式专属侧边栏呼出按钮（汉堡菜单图标） */}
          <button
            type="button"
            className="lg:hidden p-1.5 -ml-1 rounded-lg text-muted hover:text-content hover:bg-hover active:scale-90 transition-all touch-manipulation cursor-pointer"
            onClick={() => setMobileNavOpen(true)}
            aria-label="打开侧边导航"
            title="打开侧边导航"
          >
            <svg className="w-5 h-5 text-content" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3.5" y1="6" x2="20.5" y2="6" />
              <line x1="3.5" y1="12" x2="20.5" y2="12" />
              <line x1="3.5" y1="18" x2="20.5" y2="18" />
            </svg>
          </button>

          {/* cl.tv 极简线条 SVG 品牌 Logo（带线条绘制与流光动画） */}
          <Link href="/" aria-label="cl 首页" className="flex items-center gap-2 shrink-0 group select-none">
            <svg
              className="w-7 h-7 sm:w-8 sm:h-8 text-accent cl-logo-svg transition-transform duration-300 group-hover:scale-105 shrink-0"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* 极简天线折线 */}
              <path
                d="M11 3.5L14.5 7M21 3.5L17.5 7"
                className="cl-logo-draw"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              {/* 极简圆角电视屏幕线框 */}
              <rect
                x="3.5"
                y="7"
                width="25"
                height="18"
                rx="4.5"
                className="cl-logo-draw"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* 极简悬浮支架线 */}
              <path
                d="M12 28.5H20"
                className="cl-logo-draw"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              {/* 极简中心播放折线 */}
              <path
                d="M13.5 12.5L19.5 16L13.5 19.5V12.5Z"
                className="cl-logo-play"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-lg font-extrabold tracking-tight text-content group-hover:text-accent transition-colors font-mono">
                cl<span className="text-accent">.tv</span>
              </span>
            </div>
          </Link>

          {/* 桌面端单行大导航（在 lg: 1024px 及以上大屏展示，严格防折行与挤压） */}
          <Suspense fallback={null}>
            <DesktopChannelNav />
          </Suspense>

          {/* 右侧功能入口组：ml-auto 永久居右对齐，与左侧频道形成安全呼吸间隔 */}
          <nav className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
            {/* 全局 Spotlight 搜索触发胶囊：释放顶栏空间，点击或 ⌘K 唤出居中浮窗 */}
            <button
              type="button"
              onClick={() => setSpotlightOpen(true)}
              className="flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-3 py-1.5 rounded-xl bg-surface hover:bg-hover border border-line hover:border-accent/40 text-muted hover:text-content text-xs transition-all cursor-pointer group shrink-0"
              title="全局搜索 (⌘K / Ctrl+K)"
              aria-label="全局搜索 (⌘K)"
            >
              <Icon name="search" className="w-3.5 h-3.5 text-muted group-hover:text-accent transition-colors shrink-0" />
              <span className="text-muted/80 group-hover:text-content transition-colors font-medium hidden xl:inline whitespace-nowrap">
                搜索影片...
              </span>
              <span className="text-muted/80 group-hover:text-content transition-colors font-medium hidden lg:inline xl:hidden whitespace-nowrap">
                搜索
              </span>
              <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-surface-raised border border-line text-[10px] font-mono text-faint group-hover:border-accent/40">
                <span>⌘</span>K
              </kbd>
            </button>
            <LanguageToggle />
            <ThemeToggle />
            <div className="hidden md:inline-flex">
              <IconButton label={t('nav.history', '观看历史')} onClick={() => setHistoryOpen(true)}>
                <Icon name="clock" />
              </IconButton>
            </div>
            <div className="hidden xl:inline-flex">
              <IconButton label={t('nav.downloads', '下载管理')} onClick={requestShowDownloadManager}>
                <Icon name="download" />
              </IconButton>
            </div>

            {/* 设置与偏好：对所有用户开放 */}
            <div className="hidden md:inline-flex">
              <IconButton label={t('nav.settings', '设置')} onClick={() => setSettingsOpen(true)}>
                <Icon name="gear" />
              </IconButton>
            </div>

            {/* 管理员专属后台入口：移动端收拢至侧边抽屉，平板与桌面展示 */}
            {isAdmin && (
              <button
                className="hidden md:inline-flex px-2 py-1 rounded-lg text-xs font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-300 hover:bg-purple-500/25 active:scale-95 transition-all items-center gap-1 shrink-0"
                onClick={openAdminModal}
                title="打开管理员后台（邀请码、用户与全局源）"
              >
                <span>👑</span>
                <span className="hidden xl:inline">{t('nav.admin', '管理中心')}</span>
              </button>
            )}

            {/* 用户状态或登录入口：移动端已登录态收拢至侧边抽屉，彻底杜绝切边 */}
            {verified ? (
              <div className="hidden md:flex items-center gap-1 pl-1 border-l border-line/60">
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
                  {t('nav.logout', '退出')}
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="btn-primary px-2.5 py-1 text-xs rounded-lg active:scale-95 shrink-0"
              >
                <span className="sm:hidden">{t('nav.login', '登录')}</span>
                <span className="hidden sm:inline">{t('nav.loginOrRegister', '登录 / 注册')}</span>
              </Link>
            )}
          </nav>
        </div>

        {/* 平板与手机端专属独立毛玻璃频道导航栏（< lg 屏幕下渲染）：
            彻底移出 Top Bar 单行，杜绝与搜索框及右侧工具按钮发生任何横向几何碰撞 */}
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
    if (t === 'short_drama') return 'short_drama';
    if (t === 'ai') return 'ai';
    if (t === 'anime') return 'anime';
    if (t === 'variety') return 'variety';
    if (t === 'documentary') return 'documentary';
    return 'catalog';
  }
  if (pathname === '/') return 'home';
  return '';
}

function DesktopChannelNav() {
  const currentId = useCurrentChannelId();
  const { t } = useTranslation();

  return (
    <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1 ml-2 xl:ml-4 shrink-0">
      {CHANNELS.map((ch) => {
        const isActive = currentId === ch.id;
        return (
          <HeaderLink key={ch.id} href={ch.href} active={isActive}>
            {t(`nav.${ch.id}`, ch.label)}
          </HeaderLink>
        );
      })}
    </nav>
  );
}

/** 平板与移动端专属频道导航栏（< lg）：手机端顺滑横滑、平板端优雅居中，完全避免挤压顶栏 */
function TabletMobileChannelBar() {
  const currentId = useCurrentChannelId();
  const { t } = useTranslation();

  return (
    <div className="lg:hidden border-t border-line/40 px-3 sm:px-6 py-1.5 sm:py-2 overflow-x-auto no-scrollbar flex items-center justify-start md:justify-center gap-1.5 sm:gap-2 bg-surface/95 backdrop-blur-sm">
      {CHANNELS.map((ch) => {
        const isActive = currentId === ch.id;
        return (
          <Link
            key={ch.id}
            href={ch.href}
            className={cn(
              'shrink-0 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all active:scale-95 touch-manipulation whitespace-nowrap',
              isActive
                ? 'bg-accent text-on-accent font-semibold shadow-xs'
                : 'text-muted hover:text-content hover:bg-hover bg-chip/40'
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

  const navItems = [
    { id: 'home', label: '首页精选', icon: '🏠', href: '/', desc: '热播大屏 · 快速搜索' },
    { id: 'movie', label: '电影大厅', icon: '🎬', href: '/catalog?type=movie', desc: '院线大片 / 全球高分' },
    { id: 'tv', label: '电视剧场', icon: '📺', href: '/catalog?type=tv', desc: '热门国产剧 / 经典美剧' },
    { id: 'short_drama', label: '微短剧场', icon: '📱', href: '/catalog?type=short_drama', desc: '热门微短剧 / 爽文全集' },
    { id: 'ai', label: 'AI 专区', icon: '🤖', href: '/catalog?type=ai', desc: 'AI短剧 / 科技脑洞 / 智能精选' },
    { id: 'anime', label: '人气动漫', icon: '✨', href: '/catalog?type=anime', desc: '连载新番 / 热血神作' },
    { id: 'variety', label: '爆笑综艺', icon: '🎤', href: '/catalog?type=variety', desc: '下饭真人秀 / 脱口秀' },
    { id: 'documentary', label: '探索纪录', icon: '🌍', href: '/catalog?type=documentary', desc: '自然历史 / 科学人文' },
    { id: 'catalog', label: '全能片库', icon: '🎞️', href: '/catalog', desc: '多维多重条件自由探索' },
    { id: 'live', label: '电视直播', icon: '📡', href: '/live', desc: '央视卫视高清在线' },
  ];

  return (
    <Drawer open={open} onClose={onClose} title="cl 导航" side="left" width="max-w-[290px]">
      <div className="space-y-4">
        {/* 抽屉内快捷搜索 */}
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

        {/* 核心频道大厅 */}
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
                    ? 'bg-accent/15 text-accent font-semibold shadow-xs'
                    : 'text-muted hover:text-content hover:bg-hover'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{item.icon}</span>
                  <div className="flex flex-col text-left">
                    <span className={cn(active ? 'text-accent font-bold' : 'text-content')}>{t(`nav.${item.id}`, item.label)}</span>
                    {item.desc && <span className="text-[10px] text-faint font-normal">{item.desc}</span>}
                  </div>
                </div>
                {active && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
              </Link>
            );
          })}
        </div>

        {/* 快捷工具与设置 */}
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
            <span>{t('nav.settings', '设置')}</span>
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
          <Link
            href="/about"
            onClick={onClose}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted hover:text-content hover:bg-hover transition-all active:scale-95"
          >
            <span className="text-sm">ℹ️</span>
            <span>关于 cl</span>
          </Link>
        </div>

        {/* 账号与权限控制 */}
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
              className="btn-primary w-full py-2 text-xs rounded-xl font-medium flex items-center justify-center cursor-pointer"
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
              className="w-full py-1.5 rounded-lg text-xs font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-300 hover:bg-purple-500/25 flex items-center justify-center gap-1 cursor-pointer"
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

function HeaderLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'px-2 xl:px-2.5 py-1 xl:py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-all touch-manipulation active:scale-95 whitespace-nowrap shrink-0',
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
