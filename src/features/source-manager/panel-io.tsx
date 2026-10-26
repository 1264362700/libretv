'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';

import { SectionTitle } from '@/components/settings-shared';

import { useAppStore, type SourceSubscription } from '@/lib/store';
import type { SourceConfig } from '@/lib/types';
import { useToast } from '@/components/toast';
import { useTranslation } from '@/lib/i18n';

import { exportConfig, importConfig } from '@/lib/db';
import { PERSIST_KEY } from '@/lib/persist-storage';

import { useAuth } from '@/components/auth';
import { useUserSourcesSync } from '@/components/use-user-sources-sync';
import { api } from '@/lib/client-api';

export function ConfigIoPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { verified, user, openLogin } = useAuth();
  const { syncing, lastSyncedAt, syncError, triggerManualSave } = useUserSourcesSync();
  const [pending, setPending] = useState<{ file: File; summary: string } | null>(null);
  const [pullingCloud, setPullingCloud] = useState(false);

  const handlePullFromCloud = async () => {
    if (!verified) {
      openLogin();
      return;
    }
    setPullingCloud(true);
    try {
      const res = await api.user.getSources();
      if (res.success && res.config) {
        if (res.config.updatedAt) {
          useAppStore.setState({
            customAPIs: (res.config.customSources || []) as SourceConfig[],
            selectedKeys: res.config.selectedKeys || [],
            subscriptions: (res.config.subscriptions || []) as SourceSubscription[],
          });
          toast(t('admin.synced'), 'success');
        } else {
          toast(t('admin.noCloudSources'), 'info');
        }
      } else {
        toast(res.error || t('admin.pullFailed'), 'error');
      }
    } catch {
      toast(t('admin.pullError'), 'error');
    } finally {
      setPullingCloud(false);
    }
  };

  const doExport = async () => {
    if (verified === false) {
      openLogin();
      return;
    }
    try {
      const json = await exportConfig();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LibreTV-Settings_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t('admin.configExported'), 'success');
    } catch {
      toast(t('admin.exportFailed2'), 'error');
    }
  };

  const pickImport = async (file: File) => {
    try {
      const summary = summarizeConfig(await file.text(), t);
      setPending({ file, summary });
    } catch (err) {
      toast(err instanceof Error ? err.message : t('admin.configImportFailed'), 'error');
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    try {
      await importConfig(await pending.file.text());
      setPending(null);
      toast(t('admin.configImported'), 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast(err instanceof Error ? err.message : t('admin.configImportFailed'), 'error');
    }
  };

  return (
    <section>
      <SectionTitle title={t('admin.panelConfigIo')} hint={t('admin.panelConfigIoDesc')} />
      <div className="flex gap-2">
        <button className="btn-ghost flex-1 text-xs" onClick={doExport}>
          {t('admin.panelExport')}
        </button>
        <label className="btn-ghost flex-1 text-xs cursor-pointer">
          {t('admin.panelImport')}
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickImport(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {/* 重操作：导入会覆盖全部配置，先确认并展示将导入的内容概要 */}
      <ConfirmDialog
        open={pending !== null}
        danger
        title={t('admin.panelImportConfirm')}
        message={pending ? t('admin.panelImportMessage', { summary: pending.summary }) : undefined}
        confirmLabel={t('admin.panelImportOverwrite')}
        onCancel={() => setPending(null)}
        onConfirm={confirmImport}
      />

      {/* Neon 数据库实时云端同步状态卡片 */}
      {verified && user && (
        <div className="mt-5 p-3.5 bg-chip/40 border border-line/60 rounded-xl space-y-2.5 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 font-semibold text-content">
              <span>☁️</span>
              <span>{t('admin.panelCloudSync')}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success font-medium">
                {syncing ? t('admin.panelSyncing') : t('admin.subSyncEnabled')}
              </span>
            </div>
            {lastSyncedAt && (
              <span className="text-[11px] text-faint">
                {t('admin.panelLastSync')}{new Date(lastSyncedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <p className="text-[11px] text-faint leading-relaxed">
            {t('admin.panelCloudDesc', { username: user.username })}<strong>{user.username}</strong>无论在手机、平板还是其他浏览器登录均无缝自动还原。
          </p>
          <div className="flex gap-2 pt-0.5">
            <button
              type="button"
              disabled={syncing}
              className="btn-secondary flex-1 py-1.5 text-xs active:scale-95 transition-all disabled:opacity-50"
              onClick={async () => {
                const ok = await triggerManualSave();
                if (ok) toast(t('admin.pushed'), 'success');
              }}
            >
              {syncing ? t('admin.syncing') : t('admin.syncNeonBtn')}
            </button>
            <button
              type="button"
              disabled={pullingCloud}
              className="btn-ghost flex-1 py-1.5 text-xs active:scale-95 transition-all disabled:opacity-50"
              onClick={handlePullFromCloud}
            >
              {pullingCloud ? t('admin.pulling') : t('admin.syncNeon')}
            </button>
          </div>
          {syncError && <p className="text-[11px] text-danger">⚠️ 同步提示: {syncError}</p>}
        </div>
      )}
    </section>
  );
}

/** 解析配置文件概要（宽松，仅用于导入前预览） */
function summarizeConfig(text: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  let cfg: { name?: string; data?: Record<string, unknown> };
  try {
    cfg = JSON.parse(text) as { name?: string; data?: Record<string, unknown> };
  } catch {
    throw new Error(t('admin.fileNotJson'));
  }
  if (cfg.name !== 'LibreTV-Settings') throw new Error(t('admin.notLibretvConfig'));

  const parts: string[] = [];
  const settingsRaw = cfg.data?.[PERSIST_KEY];
  if (typeof settingsRaw === 'string') {
    try {
      const state = (JSON.parse(settingsRaw) as { state?: Record<string, unknown> }).state ?? {};
      const vod = Array.isArray(state.customAPIs) ? state.customAPIs.length : 0;
      const live = Array.isArray(state.liveSubscriptions) ? state.liveSubscriptions.length : 0;
      const subs = Array.isArray(state.subscriptions) ? state.subscriptions.length : 0;
      parts.push(`${vod} 个点播源`, `${live} 个直播源`, `${subs} 个订阅`);
    } catch {
      /* 设置片段损坏时忽略该部分统计 */
    }
  }
  const historyRaw = cfg.data?.['viewingHistory'];
  if (typeof historyRaw === 'string') {
    try {
      const h = JSON.parse(historyRaw);
      if (Array.isArray(h)) parts.push(`${h.length} 条观看历史`);
    } catch {
      /* 忽略 */
    }
  }
  return parts.length > 0 ? t('admin.fileContains', { parts: parts.join('、') }) : t('admin.fileNoData');
}
