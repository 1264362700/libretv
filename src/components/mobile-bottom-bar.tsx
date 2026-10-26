'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './auth';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export const SHOW_HISTORY_EVENT = 'libretv:show-history';
export const SHOW_SETTINGS_EVENT = 'libretv:show-settings';

export function requestShowHistory(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHOW_HISTORY_EVENT));
  }
}

export function requestShowSettings(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHOW_SETTINGS_EVENT));
  }
}

export function MobileBottomBar() {
  const pathname = usePathname();
  const { verified, isAdmin } = useAuth();
  const { t } = useTranslation();

  // 播放页隐藏底栏，确保全屏或手机横屏/竖屏观看时沉浸无遮挡
  if (pathname.startsWith('/watch')) {
    return null;
  }

  const isHome = pathname === '/';
  const isCatalog = pathname.startsWith('/catalog');
  const isLogin = pathname.startsWith('/login');

  return (
    <nav
      aria-label="移动端专属底部金刚导航栏"
      className="fixed bottom-0 inset-x-0 z-40 bg-surface/92 backdrop-blur-lg border-t border-line/70 px-2 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom,0px))] md:hidden flex items-center justify-around shadow-lg select-none"
    >
      {/* 首页 */}
      <Link
        href="/"
        className={cn(
          'flex flex-1 flex-col items-center justify-center py-0.5 rounded-xl text-[10px] font-medium transition-all touch-manipulation',
          isHome ? 'text-accent font-semibold' : 'text-muted hover:text-content'
        )}
      >
        <svg className="w-5 h-5 mb-0.5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isHome ? '2.2' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>{t('nav.home', '首页')}</span>
      </Link>

      {/* 片库 */}
      <Link
        href="/catalog"
        className={cn(
          'flex flex-1 flex-col items-center justify-center py-0.5 rounded-xl text-[10px] font-medium transition-all touch-manipulation',
          isCatalog ? 'text-accent font-semibold' : 'text-muted hover:text-content'
        )}
      >
        <svg className="w-5 h-5 mb-0.5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isCatalog ? '2.2' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 3v18" />
          <path d="M3 7.5h4" />
          <path d="M3 12h18" />
          <path d="M3 16.5h4" />
          <path d="M17 3v18" />
          <path d="M17 7.5h4" />
          <path d="M17 16.5h4" />
        </svg>
        <span>{t('nav.catalog', '片库')}</span>
      </Link>

      {/* 观看历史 */}
      <button
        type="button"
        onClick={requestShowHistory}
        className="flex flex-1 flex-col items-center justify-center py-0.5 rounded-xl text-[10px] font-medium text-muted hover:text-content transition-all touch-manipulation cursor-pointer"
      >
        <svg className="w-5 h-5 mb-0.5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>{t('nav.history', '历史')}</span>
      </button>

      {/* 管理员专属：源管理 */}
      {isAdmin ? (
        <button
          type="button"
          onClick={requestShowSettings}
          className="flex flex-1 flex-col items-center justify-center py-0.5 rounded-xl text-[10px] font-medium text-muted hover:text-content transition-all active:scale-90 touch-manipulation cursor-pointer"
          title="源管理 (管理员专属)"
        >
          <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>{t('nav.sourceManager', '源管理')}</span>
        </button>
      ) : verified ? (
        <button
          type="button"
          onClick={requestShowSettings}
          className="flex flex-1 flex-col items-center justify-center py-0.5 rounded-xl text-[10px] font-medium text-muted hover:text-content transition-all active:scale-90 touch-manipulation cursor-pointer"
        >
          <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>{t('nav.settings', '设置')}</span>
        </button>
      ) : (
        <Link
          href="/login"
          className={cn(
            'flex flex-1 flex-col items-center justify-center py-0.5 rounded-xl text-[10px] font-medium transition-all active:scale-90 touch-manipulation',
            isLogin ? 'text-accent font-semibold' : 'text-muted hover:text-content'
          )}
        >
          <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isLogin ? '2.2' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>{t('nav.login', '登录')}</span>
        </Link>
      )}
    </nav>
  );
}
