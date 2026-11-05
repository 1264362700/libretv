'use client';

import type { ChangeEvent, RefObject } from 'react';
import { cn } from '@/lib/utils';
import type { GistStatus, NeonStatus, StorageDiagnostics } from './admin-types';

/**
 * 管理后台「存储与持久化」标签页（从 admin-modal.tsx 抽出）。
 * 该标签页此前独占 390 行，是整个 admin-modal 里最大的单块 JSX。
 * 状态与请求逻辑仍由 AdminModal 持有，这里只做渲染，props 全部显式声明，
 * 避免出现「改了 A 却不知道 B 也在用」的隐式共享。
 */

export interface PersistenceTabProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  storageDiagnostics: StorageDiagnostics | null;
  neonStatus: NeonStatus | null;
  gistStatus: GistStatus | null;
  testingNeon: boolean;
  pushingToNeon: boolean;
  exportingGist: boolean;
  restoringGist: boolean;
  savingToken: boolean;
  importingBackup: boolean;
  customToken: string;
  showTokenInput: boolean;
  invites: unknown[];
  users: unknown[];
  sources: unknown[];
  fetchStorageInfo: () => void;
  handleTestNeon: () => void;
  handlePushToNeon: () => void;
  handleExportNeonToGist: () => void;
  handleRestoreGistToNeon: () => void;
  handleExportBackup: () => void;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleSaveToken: () => void;
  setCustomToken: (v: string) => void;
  setShowTokenInput: (v: boolean) => void;
}

export function PersistenceTab(props: PersistenceTabProps) {
  const {
    fileInputRef,
    storageDiagnostics,
    neonStatus,
    gistStatus,
    testingNeon,
    pushingToNeon,
    exportingGist,
    restoringGist,
    savingToken,
    importingBackup,
    customToken,
    showTokenInput,
    invites,
    users,
    sources,
    fetchStorageInfo,
    handleTestNeon,
    handlePushToNeon,
    handleExportNeonToGist,
    handleRestoreGistToNeon,
    handleExportBackup,
    handleFileChange,
    handleSaveToken,
    setCustomToken,
    setShowTokenInput,
  } = props;

  return (
    <>
            <div className="space-y-4">
              {/* 隐藏的备份导入文件选择器 */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* 0. 超级管理员弱密码风险提示 */}
              {storageDiagnostics?.isDefaultPassword && (
                <div className="bg-danger/10 border border-danger/30 rounded-xl p-3.5 flex items-start gap-3 animate-fade-in">
                  <span className="text-xl">⚠️</span>
                  <div className="flex-1 text-xs">
                    <div className="font-bold text-danger flex items-center gap-1.5">
                      安全红线警告：当前超级管理员使用默认初始密码 (admin888)
                    </div>
                    <p className="text-faint mt-1 leading-relaxed">
                      公网部署环境下使用默认弱密码存在被未授权扫描接管的风险！请前往【用户管理】对账号 <strong>{storageDiagnostics?.superAdminUsername || 'admin'}</strong> 进行改密，或在 Render 环境变量中通过 <code>ADMIN_PASSWORD</code> 配置高强度密码。
                    </p>
                  </div>
                </div>
              )}

              {/* 1. Neon PostgreSQL 主数据库直观状态与连通性卡片 */}
              <div className="bg-card border border-line rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">🐘</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-content">Neon PostgreSQL (生产主数据库)</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-semibold">主存储</span>
                      </div>
                      <p className="text-xs text-faint mt-0.5">
                        负责用户鉴权、邀请码、全站源池与每个用户的搜索源个性化配置 (user_configs) 的持久读写
                      </p>
                    </div>
                  </div>

                  {/* 状态徽章与 Ping 按钮 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1.5',
                        neonStatus?.ok
                          ? 'bg-success/15 text-success border border-success/30'
                          : storageDiagnostics?.database?.configured
                            ? 'bg-danger/15 text-danger border border-danger/30'
                            : 'bg-warning/15 text-warning border border-warning/30'
                      )}
                    >
                      <span className={cn('w-2 h-2 rounded-full', neonStatus?.ok ? 'bg-success animate-pulse' : storageDiagnostics?.database?.configured ? 'bg-danger' : 'bg-warning')} />
                      {neonStatus?.ok
                        ? `● 已连接 Neon 主库 (${neonStatus.latencyMs ?? 0}ms)`
                        : storageDiagnostics?.database?.configured
                          ? '✕ 连接失败 (点击右侧重试)'
                          : '○ 未配置 DATABASE_URL (本地降级)'}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary py-1 px-3 text-xs flex items-center gap-1 active:scale-95 disabled:opacity-50"
                      onClick={handleTestNeon}
                      disabled={testingNeon}
                    >
                      <span>⚡</span>
                      <span>{testingNeon ? '探测中...' : '测试连通性'}</span>
                    </button>
                  </div>
                </div>

                {/* 状态一：未配置 DATABASE_URL 引导提示 */}
                {!storageDiagnostics?.database?.configured && (
                  <div className="bg-warning/10 border border-warning/25 rounded-xl p-3 text-xs text-warning leading-relaxed space-y-1.5">
                    <div className="font-semibold flex items-center gap-1.5">
                      📌 尚未检测到 DATABASE_URL 环境变量生效（当前处于本地 JSON 保护模式）
                    </div>
                    <div className="text-faint text-[11px] space-y-1">
                      <p>如果您已经在 Render 后台填入了 <code>DATABASE_URL</code>，请检查：</p>
                      <ol className="list-decimal pl-4 space-y-0.5">
                        <li><strong>Render 是否完成重新部署</strong>：修改环境变量后 Render 需要 1-2 分钟重新构建部署容器；</li>
                        <li><strong>连接串格式</strong>：必须以 <code>postgresql://</code> 或 <code>postgres://</code> 开头，且包含 <code>?sslmode=require</code>；</li>
                        <li>部署成功后，点击上方 <strong>“测试连通性”</strong> 按钮，系统将自动建表并激活主库！</li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* 状态二：已配置但连接报错提示 */}
                {storageDiagnostics?.database?.configured && !neonStatus?.ok && neonStatus?.error && (
                  <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 text-xs text-danger space-y-1.5">
                    <div className="font-semibold flex items-center gap-1.5">
                      ⚠️ Neon PostgreSQL 连接探测失败
                    </div>
                    <p className="font-mono text-[11px] bg-chip/60 p-2 rounded break-all text-content">
                      {neonStatus.error}
                    </p>
                    <p className="text-faint text-[11px]">
                      排查建议：请检查连接串密码是否包含特殊符号（需 URL 编码），或前往 Neon 控制台确认该分支 (Branch) 是否被暂停。
                    </p>
                  </div>
                )}

                {/* 数据表统计 */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <span className="text-faint font-medium flex items-center gap-1.5">
                      <span>📊</span>
                      <span>
                        {neonStatus?.tableCounts
                          ? 'Neon PostgreSQL 物理数据表行数 (实时库表统计)'
                          : '系统核心数据项统计'}
                      </span>
                    </span>
                    {storageDiagnostics?.database?.configured && (
                      <button
                        type="button"
                        disabled={pushingToNeon}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 active:scale-95 transition-all disabled:opacity-50 self-start sm:self-auto"
                        onClick={handlePushToNeon}
                        title="将系统所有存量用户、邀请码、全局源及配置一次性全量写入 Neon 主库"
                      >
                        {pushingToNeon ? '正在全量写入 Neon...' : '⚡ 一键全量同步至 Neon 数据库'}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="bg-chip/50 p-2.5 rounded-xl border border-line/50">
                      <span className="text-faint text-[11px] block">用户账号 (users)</span>
                      <span className="text-sm font-bold text-content">
                        {neonStatus?.tableCounts?.users ?? storageDiagnostics?.userCount ?? users.length} 人
                      </span>
                    </div>
                    <div className="bg-chip/50 p-2.5 rounded-xl border border-line/50">
                      <span className="text-faint text-[11px] block">邀请码库 (invites)</span>
                      <span className="text-sm font-bold text-content">
                        {neonStatus?.tableCounts?.invites ?? storageDiagnostics?.inviteCount ?? invites.length} 条
                      </span>
                    </div>
                    <div className="bg-chip/50 p-2.5 rounded-xl border border-line/50">
                      <span className="text-faint text-[11px] block">全站源池 (global_sources)</span>
                      <span className="text-sm font-bold text-content">
                        {neonStatus?.tableCounts?.globalSources ?? storageDiagnostics?.globalSourceCount ?? sources.length} 路
                      </span>
                    </div>
                    <div className="bg-chip/50 p-2.5 rounded-xl border border-line/50">
                      <span className="text-faint text-[11px] block">用户源配置 (user_configs)</span>
                      <span className="text-sm font-bold text-content">
                        {neonStatus?.tableCounts?.userConfigs ?? storageDiagnostics?.userConfigsCount ?? 0} 份
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. GitHub Gist 独立容灾冷备面板 */}
              <div className="bg-card border border-line rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">📦</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-content">GitHub Gist 独立容灾冷备</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-chip text-muted font-semibold">独立冷备</span>
                      </div>
                      <p className="text-xs text-faint mt-0.5">
                        不承担日常高频读写，仅作为防灾备份：按需将 Neon 主库数据导出为版本化 JSON，发生故障可一键还原
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 self-start sm:self-auto',
                      gistStatus?.enabled
                        ? 'bg-success/15 text-success border border-success/30'
                        : 'bg-warning/15 text-warning border border-warning/30'
                    )}
                  >
                    {gistStatus?.enabled ? '● 已配置 GitHub 冷备' : '○ 未配置冷备 Token'}
                  </span>
                </div>

                {/* Token 配置输入区 */}
                {(!gistStatus?.enabled || showTokenInput) ? (
                  <div className="bg-chip/40 border border-line/60 rounded-xl p-3.5 space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-content">配置 GitHub Personal Access Token (PAT)</span>
                      {showTokenInput && (
                        <button
                          type="button"
                          className="text-[11px] text-faint hover:text-content"
                          onClick={() => setShowTokenInput(false)}
                        >
                          取消
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="password"
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx (需勾选 gist 读写权限)"
                        className="input py-1.5 px-3 text-xs flex-1 font-mono"
                        value={customToken}
                        onChange={(e) => setCustomToken(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-primary py-1.5 px-4 text-xs shrink-0 active:scale-95 disabled:opacity-50"
                        onClick={handleSaveToken}
                        disabled={savingToken}
                      >
                        {savingToken ? '验证连接中...' : '保存冷备 Token'}
                      </button>
                    </div>
                    <p className="text-[11px] text-faint leading-relaxed">
                      💡 前往 GitHub: <strong>Settings</strong> → <strong>Developer settings</strong> → <strong>Personal access tokens (classic)</strong>，勾选 <code>gist</code> 权限。系统将自动创建并管理私密冷备 Gist。
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-success/5 border border-success/20 rounded-xl text-xs">
                    <div className="flex items-center gap-2 text-success font-medium">
                      <span>✓ GitHub 冷备 Token 已就绪并安全保存</span>
                    </div>
                    <button
                      type="button"
                      className="px-2 py-1 rounded text-[11px] bg-chip hover:bg-hover text-muted hover:text-content active:scale-95"
                      onClick={() => setShowTokenInput(true)}
                    >
                      更换 / 重新配置 Token
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                  <div className="bg-chip/50 p-3 rounded-xl border border-line/50 space-y-1">
                    <span className="text-faint font-medium">云端私密 Gist 仓库:</span>
                    {gistStatus?.gistId ? (
                      <div className="flex items-center gap-1.5 font-mono text-accent">
                        <span className="truncate">{gistStatus.gistId}</span>
                        {gistStatus.gistUrl && (
                          <a
                            href={gistStatus.gistUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-[11px] shrink-0"
                          >
                            在 GitHub 查看 ↗
                          </a>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted font-mono">{gistStatus?.enabled ? '待首次导出时自动创建...' : '未配置 (请填入 GitHub Token)'}</p>
                    )}
                  </div>

                  <div className="bg-chip/50 p-3 rounded-xl border border-line/50 space-y-1">
                    <span className="text-faint font-medium">上次冷备导出状态:</span>
                    <div className="flex items-center gap-2">
                      <p className="text-content font-mono">
                        {gistStatus?.lastSyncAt ? new Date(gistStatus.lastSyncAt).toLocaleString() : '尚未导出'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line/40">
                  <button
                    type="button"
                    className="btn-primary py-1.5 px-3 text-xs active:scale-95 disabled:opacity-50"
                    onClick={handleExportNeonToGist}
                    disabled={!gistStatus?.enabled || exportingGist}
                  >
                    {exportingGist ? '导出冷备中...' : '📦 导出 Neon 全量冷备至 Gist'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary py-1.5 px-3 text-xs active:scale-95 disabled:opacity-50"
                    onClick={handleRestoreGistToNeon}
                    disabled={!gistStatus?.enabled || restoringGist}
                  >
                    {restoringGist ? '还原中...' : '🔄 从 Gist 容灾恢复回 Neon'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost py-1.5 px-3 text-xs ml-auto active:scale-95"
                    onClick={fetchStorageInfo}
                  >
                    🔄 刷新诊断
                  </button>
                </div>
              </div>

              {/* 2. 本地存储与容器健康度体检 */}
              <div className="bg-card border border-line rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💽</span>
                  <h3 className="text-sm font-bold text-content">本地物理存储健康度诊断</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-chip/50 p-3 rounded-xl border border-line/50 space-y-1 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="text-faint font-medium">数据存储物理目录:</span>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded font-medium',
                          storageDiagnostics?.isPersistentMounted
                            ? 'bg-success/15 text-success'
                            : 'bg-warning/15 text-warning'
                        )}
                      >
                        {storageDiagnostics?.isPersistentMounted ? '✅ 宿主机持久化卷挂载' : '⚠️ 容器临时目录 (更新易丢失)'}
                      </span>
                    </div>
                    <p className="font-mono text-content truncate text-[11px]">
                      {storageDiagnostics?.dataDir || '/app/data'}
                    </p>
                  </div>

                  <div className="bg-chip/50 p-3 rounded-xl border border-line/50 space-y-1">
                    <span className="text-faint font-medium">物理文件状态:</span>
                    <p className="font-mono text-content text-[11px]">
                      {storageDiagnostics?.exists
                        ? `就绪 (${Math.round(((storageDiagnostics.storeSize || 0) / 1024) * 10) / 10} KB)`
                        : '未初始化'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-xs pt-1">
                  <div className="bg-surface p-2.5 rounded-xl border border-line/40 text-center">
                    <span className="text-faint text-[10px]">有效账号数</span>
                    <p className="text-sm font-bold text-content font-mono mt-0.5">
                      {storageDiagnostics?.userCount ?? users.length}
                    </p>
                  </div>
                  <div className="bg-surface p-2.5 rounded-xl border border-line/40 text-center">
                    <span className="text-faint text-[10px]">邀请码总数</span>
                    <p className="text-sm font-bold text-content font-mono mt-0.5">
                      {storageDiagnostics?.inviteCount ?? invites.length}
                    </p>
                  </div>
                  <div className="bg-surface p-2.5 rounded-xl border border-line/40 text-center">
                    <span className="text-faint text-[10px]">全局公共源</span>
                    <p className="text-sm font-bold text-content font-mono mt-0.5">
                      {storageDiagnostics?.globalSourceCount ?? sources.length}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. 离线全量灾备与紧急恢复 (安全绝对防线) */}
              <div className="bg-card border border-line rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📦</span>
                  <div>
                    <h3 className="text-sm font-bold text-content">全量离线灾备与数据恢复 (安全绝对防线)</h3>
                    <p className="text-xs text-faint">
                      无需任何云服务，随时随地导出/导入纯文本 JSON 备份文件，100% 抵御容器销毁或服务器迁移风险
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    className="btn-primary py-2 px-4 text-xs active:scale-95 flex items-center gap-1.5"
                    onClick={handleExportBackup}
                  >
                    <span>⬇️</span>
                    <span>导出全量离线备份 (JSON)</span>
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg border border-line bg-chip hover:bg-hover text-content text-xs font-semibold active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importingBackup}
                  >
                    <span>⬆️</span>
                    <span>{importingBackup ? '正在恢复备份...' : '导入离线备份恢复'}</span>
                  </button>
                  <span className="text-[11px] text-faint">
                    * 导入时自动执行智能合并，永不覆盖或冲掉已有有效账号
                  </span>
                </div>
              </div>
            </div>
    </>
  );
}
