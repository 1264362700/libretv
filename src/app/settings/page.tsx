'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { type IconName } from '@/components/icon';
import { TabRow } from '@/features/source-manager/tab-row';
import { VodSourcesPanel } from '@/features/source-manager/panel-vod';
import { PlaybackPanel, ImagePanel, HomePanel } from '@/features/source-manager/panel-prefs';
import { SourceSubscriptions } from '@/features/source-manager/panel-subs';
import { ConfigIoPanel } from '@/features/source-manager/panel-io';

type PrimaryTab = 'sources' | 'prefs' | 'data';
type SecondaryTab = 'vod' | 'subs' | 'playback' | 'image' | 'home' | 'io';

const PRIMARY_TABS: { id: PrimaryTab; label: string; icon: IconName }[] = [
  { id: 'sources', label: '源管理', icon: 'link' },
  { id: 'prefs', label: '偏好设置', icon: 'gear' },
  { id: 'data', label: '数据', icon: 'download' },
];

const SECONDARY_TABS: Record<PrimaryTab, { id: SecondaryTab; label: string }[]> = {
  sources: [
    { id: 'vod', label: '点播源' },
    { id: 'subs', label: '数据源订阅' },
  ],
  prefs: [
    { id: 'playback', label: '播放与过滤' },
    { id: 'image', label: '封面图加载' },
    { id: 'home', label: '首页与内容' },
  ],
  data: [{ id: 'io', label: '配置导入导出' }],
};

const TAB_STORAGE_KEY = 'libretv-settings-tab';

export default function SettingsPage() {
  const [primary, setPrimary] = useState<PrimaryTab>('sources');
  const [secondary, setSecondary] = useState<Record<PrimaryTab, SecondaryTab>>({
    sources: 'vod',
    prefs: 'playback',
    data: 'io',
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TAB_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        primary?: PrimaryTab;
        secondary?: Partial<Record<PrimaryTab, SecondaryTab>>;
      };
      const migratedSubs = saved.secondary?.data === 'subs';
      const targetPrimary = migratedSubs && saved.primary === 'data' ? 'sources' : saved.primary;
      if (targetPrimary && SECONDARY_TABS[targetPrimary]) setPrimary(targetPrimary);
      setSecondary((prev) => {
        const next = { ...prev };
        if (migratedSubs) next.sources = 'subs';
        for (const key of Object.keys(SECONDARY_TABS) as PrimaryTab[]) {
          const v = saved.secondary?.[key];
          if (v && SECONDARY_TABS[key].some((t) => t.id === v)) next[key] = v;
        }
        return next;
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify({ primary, secondary }));
    } catch {
      /* 隐私模式等无法写入时忽略 */
    }
  }, [primary, secondary]);

  const current = secondary[primary];

  return (
    <main className="pb-28 md:pb-12">
      {/* 页头 */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-line sticky top-0 z-10 bg-page/80 backdrop-blur-md">
        <Link
          href="/"
          className="p-1.5 rounded-lg text-muted hover:text-content hover:bg-hover transition-colors shrink-0"
          aria-label="返回"
          title="返回"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-content">设置</h1>
      </div>

      {/* 导航 + 内容 */}
      <div className="px-4 py-3">
        <div className="space-y-3">
          <TabRow tabs={PRIMARY_TABS} value={primary} onChange={setPrimary} variant="primary" ariaLabel="设置分类" />
          {SECONDARY_TABS[primary].length > 1 && (
            <TabRow
              tabs={SECONDARY_TABS[primary]}
              value={current}
              onChange={(id) => setSecondary((prev) => ({ ...prev, [primary]: id }))}
              variant="secondary"
              ariaLabel="设置项"
            />
          )}
        </div>
      </div>

      <div className="px-4">
        {current === 'vod' && <VodSourcesPanel />}
        {current === 'playback' && <PlaybackPanel />}
        {current === 'image' && <ImagePanel />}
        {current === 'home' && <HomePanel />}
        {current === 'subs' && <SourceSubscriptions />}
        {current === 'io' && <ConfigIoPanel />}
      </div>
    </main>
  );
}
