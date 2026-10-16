'use client';

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Language = 'zh' | 'en';

const STORAGE_KEY = 'ltv_language';

const DICTIONARY: Record<Language, Record<string, string>> = {
  zh: {
    // 品牌与基础导航
    'brand.name': 'cl',
    'brand.tagline': '影院级超清影视探索平台',
    'nav.home': '首页',
    'nav.movie': '电影',
    'nav.tv': '电视剧',
    'nav.anime': '动漫',
    'nav.variety': '综艺',
    'nav.documentary': '纪录片',
    'nav.catalog': '片库',
    'nav.live': '直播',
    'nav.history': '观看历史',
    'nav.downloads': '下载管理',
    'nav.settings': '偏好设置',
    'nav.sourceManager': '源管理',
    'nav.admin': '管理中心',
    'nav.about': '关于',
    'nav.login': '登录',
    'nav.register': '注册',
    'nav.loginOrRegister': '登录 / 注册',
    'nav.logout': '退出',
    'nav.searchPlaceholder': '搜索电影、电视剧、动漫、演员...',
    'nav.searchHistory': '搜索历史',
    'nav.clearAll': '清空全部',

    // 片库大厅
    'catalog.title': '片库大厅',
    'catalog.filter': '多维筛选',
    'catalog.region': '地区',
    'catalog.genre': '类型',
    'catalog.year': '年份',
    'catalog.sort': '排序',
    'catalog.all': '全部',
    'catalog.sortRecommend': '🔥 热门推荐',
    'catalog.sortTime': '⏰ 最新上映',
    'catalog.sortRank': '⭐ 豆瓣高分',
    'catalog.prevPage': '上一页',
    'catalog.nextPage': '下一页',
    'catalog.jumpTo': '跳转',
    'catalog.page': '页',
    'catalog.totalCount': '共匹配到 {count} 部作品',
    'catalog.empty': '暂无符合筛选条件的影视内容',

    // 播放页
    'watch.sources': '播放线路',
    'watch.speedPanel': '测速换源',
    'watch.episodes': '剧集列表',
    'watch.prevEpisode': '上一集',
    'watch.nextEpisode': '下一集',
    'watch.autoPlayNext': '自动连播',
    'watch.orderAsc': '正序',
    'watch.orderDesc': '倒序',
    'watch.downloadEpisode': '下载本集',
    'watch.currentSource': '当前线路',
    'watch.failedSource': '受阻线路',
    'watch.switchSourcePrompt': '立即切换至备用线路',
    'watch.noEpisodes': '暂无剧集信息',
    'watch.seekingSources': '正在全网匹配最佳线路...',

    // 登录与鉴权
    'auth.login': '账号登录',
    'auth.register': '邀请码注册',
    'auth.username': '账号名称',
    'auth.password': '登录密码',
    'auth.confirmPassword': '确认密码',
    'auth.inviteCode': '注册邀请码',
    'auth.submitLogin': '立即登录',
    'auth.submitRegister': '注册并登录',
    'auth.logoutSuccess': '已安全退出登录',
  },
  en: {
    // Brand & Navigation
    'brand.name': 'cl',
    'brand.tagline': 'Cinema-Grade Ultra HD Streaming',
    'nav.home': 'Home',
    'nav.movie': 'Movies',
    'nav.tv': 'TV Series',
    'nav.anime': 'Anime',
    'nav.variety': 'Variety',
    'nav.documentary': 'Docs',
    'nav.catalog': 'Catalog',
    'nav.live': 'Live IPTV',
    'nav.history': 'History',
    'nav.downloads': 'Downloads',
    'nav.settings': 'Preferences',
    'nav.sourceManager': 'Source Manager',
    'nav.admin': 'Admin Console',
    'nav.about': 'About',
    'nav.login': 'Sign In',
    'nav.register': 'Sign Up',
    'nav.loginOrRegister': 'Sign In / Up',
    'nav.logout': 'Sign Out',
    'nav.searchPlaceholder': 'Search movies, TV shows, anime, actors...',
    'nav.searchHistory': 'Recent Searches',
    'nav.clearAll': 'Clear All',

    // Catalog
    'catalog.title': 'Catalog',
    'catalog.filter': 'Filter',
    'catalog.region': 'Region',
    'catalog.genre': 'Genre',
    'catalog.year': 'Year',
    'catalog.sort': 'Sort',
    'catalog.all': 'All',
    'catalog.sortRecommend': '🔥 Trending',
    'catalog.sortTime': '⏰ Newest',
    'catalog.sortRank': '⭐ Top Rated',
    'catalog.prevPage': 'Previous',
    'catalog.nextPage': 'Next',
    'catalog.jumpTo': 'Go',
    'catalog.page': 'Page',
    'catalog.totalCount': '{count} titles found',
    'catalog.empty': 'No matching titles found',

    // Watch Page
    'watch.sources': 'Sources',
    'watch.speedPanel': 'Speed & Failover',
    'watch.episodes': 'Episodes',
    'watch.prevEpisode': 'Prev',
    'watch.nextEpisode': 'Next',
    'watch.autoPlayNext': 'Autoplay Next',
    'watch.orderAsc': 'Asc',
    'watch.orderDesc': 'Desc',
    'watch.downloadEpisode': 'Download',
    'watch.currentSource': 'Active',
    'watch.failedSource': 'Failed',
    'watch.switchSourcePrompt': 'Switch to backup source',
    'watch.noEpisodes': 'No episodes available',
    'watch.seekingSources': 'Matching optimal source across network...',

    // Auth
    'auth.login': 'Sign In',
    'auth.register': 'Sign Up',
    'auth.username': 'Username',
    'auth.password': 'Password',
    'auth.confirmPassword': 'Confirm Password',
    'auth.inviteCode': 'Invite Code',
    'auth.submitLogin': 'Sign In',
    'auth.submitRegister': 'Create Account',
    'auth.logoutSuccess': 'Signed out successfully',
  },
};

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (
    key: string,
    fallbackOrParams?: string | Record<string, string | number>,
    params?: Record<string, string | number>
  ) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'zh',
  setLang: () => {},
  toggleLang: () => {},
  t: (k, fallbackOrParams) => (typeof fallbackOrParams === 'string' ? fallbackOrParams : k),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('zh');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (saved === 'zh' || saved === 'en') {
        setLangState(saved);
      } else {
        const navLang = navigator.language.toLowerCase();
        if (navLang.startsWith('en')) {
          setLangState('en');
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const setLang = (next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
    } catch {
      // ignore
    }
  };

  const toggleLang = () => {
    setLang(lang === 'zh' ? 'en' : 'zh');
  };

  const t = (
    key: string,
    fallbackOrParams?: string | Record<string, string | number>,
    params?: Record<string, string | number>
  ): string => {
    let fallback: string | undefined;
    let interpolations = params;
    if (typeof fallbackOrParams === 'string') {
      fallback = fallbackOrParams;
    } else if (typeof fallbackOrParams === 'object') {
      interpolations = fallbackOrParams;
    }

    let str = DICTIONARY[lang]?.[key] || DICTIONARY.zh?.[key] || fallback || key;
    if (interpolations) {
      for (const [k, v] of Object.entries(interpolations)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return str;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
