'use client';

import { useCallback, useEffect, useState } from 'react';

import { SectionTitle, SelectRow, ToggleRow } from '@/components/settings-shared';
import { loadCacheSettings, saveCacheSettings, getCacheSummary, clearVideoCache, type CacheSummary } from '@/lib/video-cache';

import { useAppStore } from '@/lib/store';
import { useToast } from '@/components/toast';
import { useTranslation } from '@/lib/i18n';

export function PlaybackPanel() {
  const store = useAppStore();
  const { t } = useTranslation();
  return (
    <section>
      <SectionTitle title={t('admin.panelPlayback')} />
      <div className="space-y-3">
        <ToggleRow
          label={t('admin.panelAdFilter')}
          description={t('admin.panelAdFilterDesc')}
          checked={store.adFilter}
          onChange={(v) => store.updateSettings({ adFilter: v })}
        />
        <ToggleRow
          label={t('admin.panelAutoplay')}
          description={t('admin.panelAutoplayDesc')}
          checked={store.autoplayNext}
          onChange={(v) => store.updateSettings({ autoplayNext: v })}
        />
      </div>
      <VideoCachePanel />
    </section>
  );
}

/** 片段缓存：开启/关闭 + 用量展示 + 清理（数据在浏览器本地，独立于配置导出） */
function VideoCachePanel() {
  const [enabled, setEnabled] = useState(() => loadCacheSettings().enabled);
  const { t } = useTranslation();
  const [summary, setSummary] = useState<CacheSummary>({ segments: 0, bytes: 0, episodes: 0 });
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(() => {
    void getCacheSummary().then(setSummary);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="space-y-3 pt-3 mt-3 border-t border-line">
      <ToggleRow
        label={t('admin.panelCache')}
        description={t('admin.panelCacheDesc')}
        checked={enabled}
        onChange={(v) => {
          const next = saveCacheSettings({ enabled: v });
          setEnabled(next.enabled);
        }}
      />
      <div className="flex items-center justify-between text-xs text-faint">
        <span>
          {t('admin.panelCacheSummary', { segments: summary.segments, bytes: formatBytes(summary.bytes), episodes: summary.episodes })}
        </span>
        <button
          type="button"
          className="px-2 py-1 rounded bg-chip text-content hover:bg-hover transition-colors disabled:opacity-50"
          disabled={clearing || summary.segments === 0}
          onClick={async () => {
            setClearing(true);
            await clearVideoCache();
            refresh();
            setClearing(false);
          }}
        >
          {t('admin.panelClearCache')}
        </button>
      </div>
    </div>
  );
}

export function ImagePanel() {
  const store = useAppStore();
  const { t } = useTranslation();
  const mode = store.imageProxyMode;
  const description: Record<'direct' | 'proxy' | 'custom', string> = {
    direct: t('admin.directDesc'),
    proxy: t('admin.serverForward'),
    custom: t('admin.templateHint'),
  };
  return (
    <section>
      <SectionTitle title={t('admin.panelImage')} />
      <div className="space-y-2">
        <SelectRow
          label={t('admin.panelImageMode')}
          value={mode}
          description={description[mode]}
          onChange={(v) => store.updateSettings({ imageProxyMode: v as 'direct' | 'proxy' | 'custom' })}
          options={[
            { value: 'direct', label: t('admin.directFirst'), hint: t('admin.trafficBest') },
            { value: 'proxy', label: t('admin.builtinProxy'), hint: t('admin.stabilityBest') },
            { value: 'custom', label: t('admin.custom'), hint: t('admin.customTemplate') },
          ]}
        />
        {mode === 'custom' && <CustomProxyInput />}
      </div>
    </section>
  );
}

/**
 * 自定义代理模板输入：本地即时回显 + 300ms 防抖写 store。
 * 直接每次按键写 store 会让全站封面 URL 重算并触发一轮图片重载（模板输入时缩略图持续闪烁）。
 */
function CustomProxyInput() {
  const value = useAppStore((s) => s.customImageProxy);
  const { t } = useTranslation();
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [draft, setDraft] = useState(value);

  // 外部值变化（如导入配置）时同步回显
  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => updateSettings({ customImageProxy: draft }), 300);
    return () => clearTimeout(timer);
  }, [draft, value, updateSettings]);

  return (
    <input
      className="input w-full"
      aria-label={t('admin.panelCustomProxy')}
      placeholder={t('admin.panelCustomProxyPlaceholder')}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
    />
  );
}

export function HomePanel() {
  const store = useAppStore();
  const { toast } = useToast();
  const { t } = useTranslation();

  return (
    <section>
      <SectionTitle title={t('admin.panelHome')} />
      <div className="space-y-3">
        <ToggleRow
          label={t('admin.panelAdultFilter')}
          description={t('admin.panelAdultFilterDesc')}
          checked={store.yellowFilter}
          onChange={(v) => {
            store.updateSettings({ yellowFilter: v });
            toast(v ? t('admin.adultFilterOn') : t('admin.adultFilterOff'), 'info');
          }}
        />
      </div>
    </section>
  );
}

// —— 数据面板 ——

/**
 * 数据源订阅 / 分享：
 * - 订阅：填入远程订阅地址（LibreTV-SourceList JSON 或 TVBOX 配置 JSON，由服务端自动识别），
 *   一次拉取点播源与直播源，可随时重新同步；
 * - 分享：把当前点播源 + 直播源导出为同格式 JSON 文件，托管到任意位置即可被他人订阅。
 */
