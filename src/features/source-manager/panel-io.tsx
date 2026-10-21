'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';

import { SectionTitle } from '@/components/settings-shared';

import { useAppStore, type SourceSubscription } from '@/lib/store';
import type { SourceConfig } from '@/lib/types';
import { useToast } from '@/components/toast';

import { exportConfig, importConfig } from '@/lib/db';
import { PERSIST_KEY } from '@/lib/persist-storage';

import { useAuth } from '@/components/auth';
import { useUserSourcesSync } from '@/components/use-user-sources-sync';
import { api } from '@/lib/client-api';

export function ConfigIoPanel() {
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
          toast('已成功从 Neon 数据库拉取并覆盖本设备配置！', 'success');
        } else {
          toast('云端数据库中尚无个性化源记录', 'info');
        }
      } else {
        toast(res.error || '拉取失败', 'error');
      }
    } catch {
      toast('网络拉取异常', 'error');
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
      toast('配置已导出', 'success');
    } catch {
      toast('导出失败', 'error');
    }
  };

  const pickImport = async (file: File) => {
    try {
      const summary = summarizeConfig(await file.text());
      setPending({ file, summary });
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    try {
      await importConfig(await pending.file.text());
      setPending(null);
      toast('配置导入成功，即将刷新页面', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    }
  };

  return (
    <section>
      <SectionTitle title="配置导入导出" hint="导出/导入包含数据源、订阅与偏好设置的整机配置" />
      <div className="flex gap-2">
        <button className="btn-ghost flex-1 text-xs" onClick={doExport}>
          导出配置
        </button>
        <label className="btn-ghost flex-1 text-xs cursor-pointer">
          导入配置
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
        title="导入配置并覆盖当前数据？"
        message={pending ? `${pending.summary}。导入后将立即刷新页面，当前设备上的配置与观看历史会被覆盖。` : undefined}
        confirmLabel="导入并覆盖"
        onCancel={() => setPending(null)}
        onConfirm={confirmImport}
      />

      {/* Neon 数据库实时云端同步状态卡片 */}
      {verified && user && (
        <div className="mt-5 p-3.5 bg-chip/40 border border-line/60 rounded-xl space-y-2.5 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 font-semibold text-content">
              <span>☁️</span>
              <span>Neon 数据库云端同步</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success font-medium">
                {syncing ? '正在同步...' : '自动双向同步已启用'}
              </span>
            </div>
            {lastSyncedAt && (
              <span className="text-[11px] text-faint">
                上次已同步: {new Date(lastSyncedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <p className="text-[11px] text-faint leading-relaxed">
            当前账号 [<strong>{user.username}</strong>] 的自定义源、订阅与勾选状态会自动防抖保存在主数据库，无论在手机、平板还是其他浏览器登录均无缝自动还原。
          </p>
          <div className="flex gap-2 pt-0.5">
            <button
              type="button"
              disabled={syncing}
              className="btn-secondary flex-1 py-1.5 text-xs active:scale-95 transition-all disabled:opacity-50"
              onClick={async () => {
                const ok = await triggerManualSave();
                if (ok) toast('已立即将当前配置同步推送到 Neon 数据库', 'success');
              }}
            >
              {syncing ? '同步中...' : '☁️ 立即同步至 Neon 数据库'}
            </button>
            <button
              type="button"
              disabled={pullingCloud}
              className="btn-ghost flex-1 py-1.5 text-xs active:scale-95 transition-all disabled:opacity-50"
              onClick={handlePullFromCloud}
            >
              {pullingCloud ? '拉取中...' : '🔄 从 Neon 数据库重新拉取'}
            </button>
          </div>
          {syncError && <p className="text-[11px] text-danger">⚠️ 同步提示: {syncError}</p>}
        </div>
      )}
    </section>
  );
}

/** 解析配置文件概要（宽松，仅用于导入前预览） */
function summarizeConfig(text: string): string {
  let cfg: { name?: string; data?: Record<string, unknown> };
  try {
    cfg = JSON.parse(text) as { name?: string; data?: Record<string, unknown> };
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  if (cfg.name !== 'LibreTV-Settings') throw new Error('不是 LibreTV 的配置文件');

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
  return parts.length > 0 ? `该文件包含 ${parts.join('、')}` : '该文件未包含可导入的数据';
}
