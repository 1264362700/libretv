'use client';

import { useEffect, useState } from 'react';
import { Drawer } from './drawer';
import { type IconName } from './icon';
import { TabRow } from '@/features/source-manager/tab-row';
import { VodSourcesPanel } from '@/features/source-manager/panel-vod';
import { PlaybackPanel, ImagePanel, HomePanel } from '@/features/source-manager/panel-prefs';
import { SourceSubscriptions } from '@/features/source-manager/panel-subs';
import { ConfigIoPanel } from '@/features/source-manager/panel-io';

/**
 * 设置抽屉：顶部两级导航。
 * - 一级按性质分组：源管理 / 偏好设置 / 数据；
 * - 二级为该分组下的具体面板，每次只渲染一类内容，避免源很多时长距离滚动。
 * 选中位置记忆到 localStorage，再次打开回到上次所在面板。
 */

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

export function SourceManagerDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    <Drawer
      open={open}
      onClose={onClose}
      title="设置"
      resetScrollKey={current}
      subheader={
        <div className="space-y-2">
          <TabRow tabs={PRIMARY_TABS} value={primary} onChange={setPrimary} variant="primary" ariaLabel="设置分类" />
          {/* 分组下只有一项时无需二级导航，直接展示该面板 */}
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
      }
    >
      {current === 'vod' && <VodSourcesPanel />}
      {current === 'playback' && <PlaybackPanel />}
      {current === 'image' && <ImagePanel />}
      {current === 'home' && <HomePanel />}
      {current === 'subs' && <SourceSubscriptions />}
      {current === 'io' && <ConfigIoPanel />}
    </Drawer>
  );
}

/** 一级/二级导航条（role=tablist，左右方向键切换） */
