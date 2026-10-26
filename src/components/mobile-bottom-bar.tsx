'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './auth';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

/** 桌面端 Header 按钮触发抽屉（移动端底栏已改为 Link 导航） */
export const SHOW_HISTORY_EVENT = 'libretv:show-history';
export const SHOW_SETTINGS_EVENT = 'libretv:show-settings';

export function requestShowHistory(): void {
  if (typeof window !== 'undefined' && window.location) {
    window.location.href = '/history';
  }
}

export function requestShowSettings(): void {
  if (typeof window !== 'undefined' && window.location) {
    window.location.href = '/settings';
  }
}

export function MobileBottomBar() {
  const pathname = usePathname();
  const { verified, isAdmin } = useAuth();
  const { t } = useTranslation();
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  // 播放页隐藏底栏，确保全屏或手机横屏/竖屏观看时沉浸无遮挡
  const isHome = pathname === '/';
  const isCatalog = pathname.startsWith('/catalog');
  const isHistory = pathname.startsWith('/history');
  const isSettings = pathname.startsWith('/settings');
  const isLogin = pathname.startsWith('/login');
  const activeId = isHome ? 'home' : isCatalog ? 'catalog' : isHistory ? 'history' : isSettings ? 'settings' : isLogin ? 'login' : '';

  useEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator || !activeId) return;
    const active = nav.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    if (!active) return;
    const left = active.offsetLeft;
    const width = active.offsetWidth;
    const previousLeft = Number(indicator.dataset.left ?? left);
    const previousWidth = Number(indicator.dataset.width ?? width);
    indicator.style.opacity = '1';
    indicator.style.left = `${left}px`;
    indicator.style.width = `${width}px`;
    if (typeof indicator.animate === 'function' && indicator.dataset.ready === 'true') {
      const movingRight = left >= previousLeft;
      indicator.style.transformOrigin = movingRight ? 'left center' : 'right center';
      indicator.animate([
        { transform: `translateX(${previousLeft - left}px) scaleX(${previousWidth / Math.max(width, 1)})` },
        { transform: `translateX(${(left - previousLeft) * 0.08}px) scaleX(1.14)`, offset: 0.62 },
        { transform: `translateX(${(left - previousLeft) * -0.025}px) scaleX(0.97)`, offset: 0.84 },
        { transform: 'translateX(0) scaleX(1)' }
      ], { duration: 560, easing: 'cubic-bezier(.18,.9,.25,1)', fill: 'both' });
    }
    indicator.dataset.left = String(left);
    indicator.dataset.width = String(width);
    indicator.dataset.ready = 'true';
  }, [activeId]);

  if (pathname.startsWith('/watch')) return null;

  return (
    <nav
      aria-label="移动端专属底部金刚导航栏"
      ref={navRef} className="lg-glass lg-bar lg-tabbar xl:hidden select-none"
    >
      <span ref={indicatorRef} className="lg-tab-indicator" aria-hidden="true" />
      {/* 首页 */}
      <Link
        href="/"
        data-tab-id="home"
        aria-current={isHome ? 'page' : undefined}
        className={cn(
          'lg-tab-item',
          isHome ? 'text-accent font-semibold' : 'text-muted hover:text-content'
        )}
      >
        <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isHome ? '2.2' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>{t('nav.home', '首页')}</span>
      </Link>

      {/* 片库 */}
      <Link
        href="/catalog"
        data-tab-id="catalog"
        aria-current={isCatalog ? 'page' : undefined}
        className={cn(
          'lg-tab-item',
          isCatalog ? 'text-accent font-semibold' : 'text-muted hover:text-content'
        )}
      >
        <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isCatalog ? '2.2' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
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
      <Link
        href="/history"
        data-tab-id="history"
        aria-current={isHistory ? 'page' : undefined}
        className={cn(
          'lg-tab-item',
          isHistory ? 'text-accent font-semibold' : 'text-muted hover:text-content'
        )}
      >
        <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isHistory ? '2.2' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>{t('nav.history', '历史')}</span>
      </Link>

      {/* 管理员：源管理 / 普通用户：设置 */}
      {isAdmin || verified ? (
        <Link
          href="/settings"
          data-tab-id="settings"
          aria-current={isSettings ? 'page' : undefined}
          className={cn(
            'lg-tab-item',
            isSettings ? 'text-accent font-semibold' : 'text-muted hover:text-content'
          )}
          title={isAdmin ? '源管理 (管理员专属)' : '设置'}
        >
          <svg className="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isSettings ? '2.2' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>{isAdmin ? t('nav.sourceManager', '源管理') : t('nav.settings', '设置')}</span>
        </Link>
      ) : (
        <Link
          href="/login"
          data-tab-id="login"
          aria-current={isLogin ? 'page' : undefined}
          className={cn(
            'lg-tab-item',
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
