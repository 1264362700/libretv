'use client';

import { useTranslation } from '@/lib/i18n';

export function LanguageToggle() {
  const { lang, toggleLang } = useTranslation();

  return (
    <button
      type="button"
      onClick={toggleLang}
      className="p-1.5 rounded-lg text-muted hover:text-content hover:bg-hover active:scale-90 transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold select-none"
      title={lang === 'zh' ? 'Switch to English' : '切换为简体中文'}
      aria-label="切换语言 / Switch Language"
    >
      <span className="text-xs">🌐</span>
      <span className="font-mono uppercase text-[11px] tracking-wide">{lang === 'zh' ? 'EN' : '中'}</span>
    </button>
  );
}
