'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { api } from '@/lib/client-api';
import { useToast } from './toast';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { PersistenceTab } from '@/features/admin/persistence-tab';
import type { StorageDiagnostics } from '@/features/admin/admin-types';

interface InviteItem {
  code: string;
  createdBy: string;
  maxUses: number;
  useCount: number;
  usedBy: string[];
  active: boolean;
  createdAt: number;
}

interface UserItem {
  id: string;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'banned';
  sessionVersion: number;
  createdAt: number;
  lastLoginAt?: number;
  isSuperAdmin?: boolean;
}

interface SourceItem {
  key: string;
  name: string;
  url: string;
  type: 'vod' | 'live';
  createdAt: number;
}


export function AdminModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [tab, setTab] = useState<'invites' | 'users' | 'sources' | 'persistence'>('invites');

  // 邀请码状态
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [inviteCount, setInviteCount] = useState(1);
  const [inviteMaxUses, setInviteMaxUses] = useState(1);
  const [generating, setGenerating] = useState(false);

  // 用户状态
  const [users, setUsers] = useState<UserItem[]>([]);
  const [resettingUser, setResettingUser] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // 全局源状态
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceType, setSourceType] = useState<'vod' | 'live'>('vod');

  // Neon PostgreSQL 主库状态与连通性
  const [neonStatus, setNeonStatus] = useState<{
    configured: boolean;
    ok: boolean;
    latencyMs?: number;
    error?: string;
    tableCounts?: {
      users: number;
      invites: number;
      globalSources: number;
      userConfigs: number;
    };
  } | null>(null);
  const [testingNeon, setTestingNeon] = useState(false);
  const [pushingToNeon, setPushingToNeon] = useState(false);
  const [exportingGist, setExportingGist] = useState(false);
  const [restoringGist, setRestoringGist] = useState(false);

  // Gist 云持久化与存储健康度状态
  const [gistStatus, setGistStatus] = useState<{
    enabled: boolean;
    gistId: string | null;
    gistUrl: string | null;
    lastSyncAt: number | null;
    lastAction: 'pull' | 'push' | 'idle' | 'error';
    lastError: string | null;
  } | null>(null);
  const [storageDiagnostics, setStorageDiagnostics] = useState<StorageDiagnostics | null>(null);
  const [customToken, setCustomToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 全局源物理备份状态与操作锁
  const [sourcesBackup, setSourcesBackup] = useState<{
    exists: boolean;
    path: string;
    count: number;
    updatedAt?: number;
  } | null>(null);
  const [backingUpSources, setBackingUpSources] = useState(false);
  const [restoringSources, setRestoringSources] = useState(false);

  const [loading, setLoading] = useState(false);

  const fetchInvites = useCallback(async () => {
    try {
      const res = await api.admin.getInvites();
      if (res.success) setInvites(res.invites);
    } catch {
      toast(t('admin.getInvitesFailed'), 'error');
    }
  }, [toast, t]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.admin.getUsers();
      if (res.success) setUsers(res.users);
    } catch {
      toast(t('admin.getUsersFailed'), 'error');
    }
  }, [toast, t]);

  const fetchSources = useCallback(async () => {
    try {
      const res = await api.admin.getSources();
      if (res.success) {
        setSources(res.sources);
        if (res.backup) setSourcesBackup(res.backup);
      }
    } catch {
      toast(t('admin.getSourcesFailed'), 'error');
    }
  }, [toast, t]);

  const fetchStorageInfo = useCallback(async () => {
    try {
      const res = await api.admin.getStorageInfo();
      if (res.success) {
        setStorageDiagnostics(res.diagnostics);
        setGistStatus(res.gistStatus);
        if (res.neon) {
          setNeonStatus(res.neon);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const handleTestNeon = async () => {
    setTestingNeon(true);
    try {
      const res = await api.admin.testNeon();
      if (res.ok) {
        setNeonStatus({ configured: true, ok: true, latencyMs: res.latencyMs, tableCounts: res.tableCounts });
        toast(t('admin.neonOk', { latency: res.latencyMs ?? 0 }), 'success');
      } else {
        setNeonStatus({ configured: Boolean(storageDiagnostics?.database?.configured), ok: false, error: res.error });
        toast(res.error || t('admin.probeFailed'), 'error');
      }
      fetchStorageInfo();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('admin.probeError'), 'error');
    } finally {
      setTestingNeon(false);
    }
  };

  const handlePushToNeon = async () => {
    setPushingToNeon(true);
    try {
      const res = await api.admin.pushToNeon();
      if (res.success) {
        toast(
          t('admin.pushOk', { users: res.stats.users, invites: res.stats.invites, sources: res.stats.sources, userConfigs: res.stats.userConfigs }),
          'success'
        );
        fetchStorageInfo();
        handleTestNeon();
      } else {
        toast(res.error || t('admin.pushFailed'), 'error');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t('admin.pushError'), 'error');
    } finally {
      setPushingToNeon(false);
    }
  };

  const handleExportNeonToGist = async () => {
    setExportingGist(true);
    try {
      const res = await api.admin.backupToGist();
      if (res.success) {
        const stats = res.stats;
        toast(
          t('admin.gistBackupOk', { users: stats?.usersCount ?? 0, invites: stats?.invitesCount ?? 0, sources: stats?.sourcesCount ?? 0 }),
          'success'
        );
        fetchStorageInfo();
      } else {
        toast(res.error || t('admin.exportFailed'), 'error');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t('admin.exportError'), 'error');
    } finally {
      setExportingGist(false);
    }
  };

  const handleRestoreGistToNeon = async () => {
    if (!window.confirm(t('admin.restoreConfirm'))) return;
    setRestoringGist(true);
    try {
      const res = await api.admin.restoreFromGist();
      if (res.success) {
        toast(t('admin.restoreSuccess'), 'success');
        fetchStorageInfo();
        fetchUsers();
        fetchSources();
      } else {
        toast(res.error || t('admin.restoreFailed3'), 'error');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t('admin.restoreError'), 'error');
    } finally {
      setRestoringGist(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    if (tab === 'invites') fetchInvites().finally(() => setLoading(false));
    if (tab === 'users') fetchUsers().finally(() => setLoading(false));
    if (tab === 'sources') fetchSources().finally(() => setLoading(false));
    if (tab === 'persistence') fetchStorageInfo().finally(() => setLoading(false));
  }, [open, tab, fetchInvites, fetchUsers, fetchSources, fetchStorageInfo]);

  const handleSaveToken = async () => {
    if (!customToken.trim()) {
      toast(t('admin.token.placeholder'), 'warning');
      return;
    }
    setSavingToken(true);
    try {
      const res = await api.admin.saveGithubToken(customToken.trim());
      if (res.success) {
        toast(t('admin.token.saved'), 'success');
        setCustomToken('');
        setShowTokenInput(false);
        fetchStorageInfo();
        fetchUsers();
        fetchInvites();
      } else {
        toast(res.error || t('admin.token.invalid'), 'error');
      }
    } catch {
      toast(t('admin.token.saveFailed'), 'error');
    } finally {
      setSavingToken(false);
    }
  };

  const handleExportBackup = () => {
    window.open(api.admin.exportBackupUrl, '_blank');
    toast(t('admin.downloadBackup'), 'info');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingBackup(true);
    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        toast(t('admin.backupCorrupt'), 'error');
        setImportingBackup(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const res = await api.admin.importBackup(data);
      if (res.success) {
        toast(
          t('admin.importOk', { users: res.userCount ?? 0, invites: res.inviteCount ?? 0, sources: res.sourceCount ?? 0 }),
          'success'
        );
        fetchStorageInfo();
        fetchUsers();
        fetchInvites();
        fetchSources();
      } else {
        toast(res.error || t('admin.importFailed'), 'error');
      }
    } catch {
      toast(t('admin.readFailed'), 'error');
    } finally {
      setImportingBackup(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 生成邀请码
  const handleGenerateInvites = async () => {
    setGenerating(true);
    try {
      const res = await api.admin.createInvites({ count: inviteCount, maxUses: inviteMaxUses });
      if (res.success) {
        toast(t('admin.genInvitesOk', { count: res.codes.length }), 'success');
        fetchInvites();
      }
    } catch {
      toast(t('admin.generateFailed'), 'error');
    } finally {
      setGenerating(false);
    }
  };

  // 作废邀请码
  const handleRevokeInvite = async (code: string) => {
    try {
      const res = await api.admin.revokeInvite(code);
      if (res.success) {
        toast(t('admin.revokedInvite'), 'info');
        fetchInvites();
      }
    } catch {
      toast(t('admin.revokeFailed'), 'error');
    }
  };

  const getInviteUrl = (code: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/login?invite=${encodeURIComponent(code)}`;
  };

  // 复制邀请直达链接
  const handleCopyInviteLink = async (code: string) => {
    const url = getInviteUrl(code);
    const ok = await copyToClipboard(url);
    if (ok) toast(t('admin.linkCopied'), 'success');
  };

  // 复制带链接的完整邀请口令
  const handleCopyInvite = async (code: string) => {
    const url = getInviteUrl(code);
    const text = t('admin.inviteMessage', { url, code });
    const ok = await copyToClipboard(text);
    if (ok) toast(t('admin.inviteCopied'), 'success');
  };

  // 用户操作
  const handleBanToggle = async (user: UserItem) => {
    try {
      if (user.status === 'active') {
        await api.admin.banUser(user.username);
        toast(t('admin.userBanned', { username: user.username }), 'info');
      } else {
        await api.admin.unbanUser(user.username);
        toast(t('admin.userUnbanned', { username: user.username }), 'success');
      }
      fetchUsers();
    } catch {
      toast(t('admin.actionFailed'), 'error');
    }
  };

  const handleKickUser = async (username: string) => {
    try {
      await api.admin.kickUser(username);
      toast(t('admin.userKicked', { username }), 'success');
      fetchUsers();
    } catch {
      toast(t('admin.kickFailed'), 'error');
    }
  };

  const handleResetPassword = async () => {
    if (!resettingUser || !newPassword.trim()) return;
    try {
      const res = await api.admin.resetPassword(resettingUser, newPassword);
      if (res.success) {
        toast(t('admin.userReset', { username: resettingUser }), 'success');
        setResettingUser(null);
        setNewPassword('');
        fetchUsers();
      } else {
        toast(res.error || t('admin.resetFailed'), 'error');
      }
    } catch {
      toast(t('admin.resetFailed'), 'error');
    }
  };

  // 全局源添加
  const handleAddSource = async () => {
    if (!sourceName.trim() || !sourceUrl.trim()) {
      toast(t('admin.addApiIncomplete'), 'warning');
      return;
    }
    try {
      const res = await api.admin.addSource({ name: sourceName, url: sourceUrl, type: sourceType });
      if (res.success) {
        toast(t('admin.globalPublished'), 'success');
        setSourceName('');
        setSourceUrl('');
        fetchSources();
      }
    } catch {
      toast(t('admin.addFailed'), 'error');
    }
  };

  const handleRemoveSource = async (key: string) => {
    try {
      await api.admin.removeSource(key);
      toast(t('admin.globalRemoved'), 'info');
      fetchSources();
    } catch {
      toast(t('admin.deleteFailed'), 'error');
    }
  };

  const handleBackupSources = async () => {
    setBackingUpSources(true);
    try {
      const res = await api.admin.backupSources();
      if (res.success) {
        toast(t('admin.sourceBackupOk', { count: res.count }), 'success');
        fetchSources();
      } else {
        toast(res.error || t('admin.backupFailed'), 'error');
      }
    } catch {
      toast(t('admin.backupFailed'), 'error');
    } finally {
      setBackingUpSources(false);
    }
  };

  const handleRestoreSources = async () => {
    setRestoringSources(true);
    try {
      const res = await api.admin.restoreSources();
      if (res.success) {
        toast(t('admin.mergeRestoreOk', { count: res.count }), 'success');
        fetchSources();
      } else {
        toast(res.error || t('admin.mergeFailed'), 'error');
      }
    } catch {
      toast(t('admin.mergeFailed'), 'error');
    } finally {
      setRestoringSources(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3 sm:p-6 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-surface-raised rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-line animate-slide-up overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-chip/30">
          <div className="flex items-center gap-2">
            <span className="text-xl">👑</span>
            <h2 className="text-base sm:text-lg font-bold text-content">管理员综合控制台</h2>
          </div>
          <button
            className="p-1.5 rounded-lg text-muted hover:text-content hover:bg-hover active:scale-90 transition-all"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* 选项卡导航栏（防塌陷与贴合对齐） */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 border-b border-line bg-surface/95 shrink-0 overflow-x-auto no-scrollbar whitespace-nowrap">
          <TabButton
            active={tab === 'invites'}
            onClick={() => setTab('invites')}
            icon="🎟️"
            label={t('admin.tabInvites')}
            badge={invites.length > 0 ? invites.length : undefined}
          />
          <TabButton
            active={tab === 'users'}
            onClick={() => setTab('users')}
            icon="👥"
            label={t('admin.tabUsers')}
            badge={users.length > 0 ? users.length : undefined}
          />
          <TabButton
            active={tab === 'sources'}
            onClick={() => setTab('sources')}
            icon="📡"
            label={t('admin.tabSources')}
            badge={sources.length > 0 ? sources.length : undefined}
          />
          <TabButton
            active={tab === 'persistence'}
            onClick={() => setTab('persistence')}
            icon="🛡️"
            label={t('admin.tabPersistence')}
            badge={neonStatus?.ok ? 'Neon' : storageDiagnostics?.database?.configured ? 'Neon' : undefined}
            badgeColor={neonStatus?.ok ? 'bg-success/20 text-success font-bold' : undefined}
          />
        </div>

        {/* 主内容区 */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* —— 选项卡 1：邀请码管理 —— */}
          {tab === 'invites' && (
            <div className="space-y-4">
              {/* 生成面板 */}
              <div className="bg-chip/50 border border-line/60 rounded-xl p-3.5 sm:p-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-faint">生成数量:</span>
                  <select
                    className="input py-1 px-2 text-xs"
                    value={inviteCount}
                    onChange={(e) => setInviteCount(Number(e.target.value))}
                  >
                    <option value={1}>1 个</option>
                    <option value={3}>3 个</option>
                    <option value={5}>5 个</option>
                    <option value={10}>10 个</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-faint">可使用次数:</span>
                  <select
                    className="input py-1 px-2 text-xs"
                    value={inviteMaxUses}
                    onChange={(e) => setInviteMaxUses(Number(e.target.value))}
                  >
                    <option value={1}>单次使用 (推荐)</option>
                    <option value={3}>限 3 次</option>
                    <option value={10}>限 10 次</option>
                    <option value={9999}>无限制</option>
                  </select>
                </div>
                <button
                  className="btn-primary py-1.5 px-4 text-xs ml-auto active:scale-95"
                  onClick={handleGenerateInvites}
                  disabled={generating}
                >
                  {generating ? t('admin.generating') : t('admin.addInvite')}
                </button>
              </div>

              {/* 列表 */}
              {loading ? (
                <p className="text-center text-xs text-faint py-8">正在拉取邀请码列表...</p>
              ) : invites.length === 0 ? (
                <p className="text-center text-xs text-faint py-8">暂无已下发的邀请码，请点击上方按钮生成</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {invites.map((inv) => (
                    <div
                      key={inv.code}
                      className={cn(
                        'border rounded-xl p-3 flex flex-col justify-between transition-all',
                        inv.active ? 'border-line bg-card' : 'border-line/40 bg-chip/30 opacity-60'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm sm:text-base font-bold text-accent tracking-wide select-all">
                          {inv.code}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-medium',
                            inv.active && inv.useCount < inv.maxUses
                              ? 'bg-success/15 text-success'
                              : 'bg-chip text-faint'
                          )}
                        >
                          {inv.active
                            ? inv.useCount >= inv.maxUses
                              ? t('admin.usedUp')
                              : t('admin.inviteAvailable', { used: inv.useCount, max: inv.maxUses })
                            : t('admin.revoked')}
                        </span>
                      </div>

                      {inv.usedBy.length > 0 && (
                        <p className="text-[11px] text-faint truncate mt-1">
                          已注册用户: <span className="text-content font-medium">{inv.usedBy.join(', ')}</span>
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-2 mt-2 border-t border-line/40 text-xs">
                        <span className="text-[10px] text-faint">
                          {new Date(inv.createdAt).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            className="px-2 py-0.5 rounded bg-accent/15 hover:bg-accent/25 text-accent font-semibold text-[11px] active:scale-95"
                            onClick={() => handleCopyInviteLink(inv.code)}
                            title={t('admin.copyInviteLink')}
                          >
                            🔗 复制链接
                          </button>
                          <button
                            className="px-2 py-0.5 rounded bg-chip hover:bg-hover text-muted hover:text-content text-[11px] active:scale-95"
                            onClick={() => handleCopyInvite(inv.code)}
                            title={t('admin.copyInviteCode')}
                          >
                            复制口令
                          </button>
                          {inv.active && (
                            <button
                              className="px-2 py-0.5 rounded bg-danger/10 hover:bg-danger/20 text-danger text-[11px] active:scale-95"
                              onClick={() => handleRevokeInvite(inv.code)}
                            >
                              作废
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* —— 选项卡 2：用户管理 —— */}
          {tab === 'users' && (
            <div className="space-y-4">
              {/* 超级管理员提示条 */}
              <div className="bg-chip/40 border border-line/60 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-faint">
                  <span className="text-base">🛡️</span>
                  <span>
                    {t('admin.superAdminHint')}<strong className="text-content font-mono font-bold text-accent">{storageDiagnostics?.superAdminUsername || 'admin'}</strong>{t('admin.superAdminEnvPrefix')}<code className="text-accent">ADMIN_USERNAME</code>{t('admin.superAdminEnvSuffix')}
                  </span>
                </div>
                {storageDiagnostics?.isDefaultPassword && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-danger/15 text-danger font-semibold flex items-center gap-1 border border-danger/30">
                    ⚠️ 超级管理员正在使用默认弱密码 (admin888)
                  </span>
                )}
              </div>

              {loading ? (
                <p className="text-center text-xs text-faint py-8">正在拉取用户列表...</p>
              ) : (
                <div className="overflow-x-auto border border-line rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-chip/60 border-b border-line text-faint">
                      <tr>
                        <th className="p-3">用户名</th>
                        <th className="p-3">角色</th>
                        <th className="p-3">状态</th>
                        <th className="p-3">会话版本</th>
                        <th className="p-3">注册时间</th>
                        <th className="p-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/40">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-chip/30">
                          <td className="p-3 font-medium text-content">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{u.username}</span>
                              {u.isSuperAdmin && (
                                <span
                                  className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30 flex items-center gap-0.5"
                                  title={t('admin.superAdminTitle')}
                                >
                                  <span>👑</span>
                                  <span>超级管理员</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                u.role === 'admin'
                                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300'
                                  : 'bg-chip text-muted'
                              )}
                            >
                              {u.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser')}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                u.status === 'active' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                              )}
                            >
                              {u.status === 'active' ? t('admin.statusActive') : t('admin.banned')}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-faint">v{u.sessionVersion}</td>
                          <td className="p-3 text-faint">{new Date(u.createdAt).toLocaleDateString()}</td>
                          <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                            {u.role !== 'admin' && !u.isSuperAdmin && (
                              <>
                                <button
                                  className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] active:scale-95"
                                  onClick={() => handleKickUser(u.username)}
                                  title={t('admin.kickTitle')}
                                >
                                  {t('admin.kickOffline')}
                                </button>
                                <button
                                  className={cn(
                                    'px-2 py-1 rounded text-[11px] active:scale-95',
                                    u.status === 'active'
                                      ? 'bg-danger/10 hover:bg-danger/20 text-danger'
                                      : 'bg-success/10 hover:bg-success/20 text-success'
                                  )}
                                  onClick={() => handleBanToggle(u)}
                                >
                                  {u.status === 'active' ? t('admin.ban') : t('admin.unban')}
                                </button>
                              </>
                            )}
                            <button
                              className="px-2 py-1 rounded bg-chip hover:bg-hover text-muted hover:text-content text-[11px] active:scale-95"
                              onClick={() => setResettingUser(u.username)}
                            >
                              改密
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 改密小面板 */}
              {resettingUser && (
                <div className="bg-chip/50 border border-line rounded-xl p-3 flex items-center gap-2 animate-fade-in">
                  <span className="text-xs text-content font-medium">重置 [{resettingUser}] 密码:</span>
                  <input
                    type="password"
                    placeholder={t('admin.resetPasswordPlaceholder')}
                    className="input py-1 px-2 text-xs flex-1 max-w-xs"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button className="btn-primary py-1 px-3 text-xs active:scale-95" onClick={handleResetPassword}>
                    确认修改并下线
                  </button>
                  <button
                    className="px-2 py-1 text-xs text-faint hover:text-content"
                    onClick={() => {
                      setResettingUser(null);
                      setNewPassword('');
                    }}
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          )}

          {/* —— 选项卡 3：全局源管理 —— */}
          {tab === 'sources' && (
            <div className="space-y-4">
              {/* 全局源物理备份与启动合并引擎状态条 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-surface border border-line/60 rounded-xl">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">💾</span>
                    <span className="text-xs font-bold text-content">{t('admin.sourcesEngineLabel')}</span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-mono',
                        sourcesBackup?.exists ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
                      )}
                    >
                      {sourcesBackup?.exists ? t('admin.backupReady', { count: sourcesBackup.count }) : t('admin.noBackup')}
                    </span>
                  </div>
                  <p className="text-[11px] text-faint">
                    {t('admin.sourcesHint')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={backingUpSources}
                    className="px-2.5 py-1 text-xs rounded-lg border border-line bg-chip hover:bg-hover text-muted hover:text-content active:scale-95 transition-all disabled:opacity-50"
                    onClick={handleBackupSources}
                    title={t('admin.backupSourcesTitle')}
                  >
                    {backingUpSources ? t('admin.backingUp') : t('admin.writeBackup')}
                  </button>
                  <button
                    type="button"
                    disabled={restoringSources}
                    className="px-2.5 py-1 text-xs rounded-lg border border-accent/40 bg-accent/10 hover:bg-accent/20 text-accent font-medium active:scale-95 transition-all disabled:opacity-50"
                    onClick={handleRestoreSources}
                    title={t('admin.restoreSourcesTitle')}
                  >
                    {restoringSources ? t('admin.mergeInProgress') : t('admin.restoreInProgress')}
                  </button>
                </div>
              </div>

              {/* 添加全局源 */}
              <div className="bg-chip/50 border border-line/60 rounded-xl p-3.5 space-y-3">
                <h3 className="text-xs font-semibold text-content">发布全局公共源（全员自动同步）</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    placeholder={t('admin.sourceNamePlaceholder')}
                    className="input py-1.5 px-3 text-xs"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                  />
                  <input
                    placeholder={t('admin.sourceUrlPlaceholder')}
                    className="input py-1.5 px-3 text-xs sm:col-span-2"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-faint">类型:</span>
                    <select
                      className="input py-1 px-2 text-xs"
                      value={sourceType}
                      onChange={(e) => setSourceType(e.target.value as 'vod' | 'live')}
                    >
                      <option value="vod">影视采集站 (VOD)</option>
                      <option value="live">电视直播 M3U (Live)</option>
                    </select>
                  </div>
                  <button className="btn-primary py-1.5 px-4 text-xs active:scale-95" onClick={handleAddSource}>
                    + 确认发布下发全员
                  </button>
                </div>
              </div>

              {/* 源列表 */}
              {loading ? (
                <p className="text-center text-xs text-faint py-8">正在拉取全局源...</p>
              ) : sources.length === 0 ? (
                <p className="text-center text-xs text-faint py-8">暂无管理员添加的全局源</p>
              ) : (
                <div className="space-y-2">
                  {sources.map((s) => (
                    <div
                      key={s.key}
                      className="border border-line rounded-xl p-3 flex items-center justify-between gap-3 bg-card"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-content">{s.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-chip text-muted">
                            {s.type === 'vod' ? t('admin.movie') : t('admin.live')}
                          </span>
                        </div>
                        <p className="text-[11px] text-faint truncate mt-0.5 font-mono">{s.url}</p>
                      </div>
                      <button
                        className="px-2.5 py-1 rounded bg-danger/10 hover:bg-danger/20 text-danger text-xs active:scale-95 shrink-0"
                        onClick={() => handleRemoveSource(s.key)}
                      >
                        {t('admin.delete')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* —— 选项卡 4：持久化与数据安全 —— */}
          {tab === 'persistence' && (
            <PersistenceTab
              fileInputRef={fileInputRef}
              storageDiagnostics={storageDiagnostics}
              neonStatus={neonStatus}
              gistStatus={gistStatus}
              testingNeon={testingNeon}
              pushingToNeon={pushingToNeon}
              exportingGist={exportingGist}
              restoringGist={restoringGist}
              savingToken={savingToken}
              importingBackup={importingBackup}
              customToken={customToken}
              showTokenInput={showTokenInput}
              invites={invites}
              users={users}
              sources={sources}
              fetchStorageInfo={fetchStorageInfo}
              handleTestNeon={handleTestNeon}
              handlePushToNeon={handlePushToNeon}
              handleExportNeonToGist={handleExportNeonToGist}
              handleRestoreGistToNeon={handleRestoreGistToNeon}
              handleExportBackup={handleExportBackup}
              handleFileChange={handleFileChange}
              handleSaveToken={handleSaveToken}
              setCustomToken={setCustomToken}
              setShowTokenInput={setShowTokenInput}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeColor,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  badge?: string | number;
  badgeColor?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        'shrink-0 whitespace-nowrap px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer select-none',
        active
          ? 'bg-accent text-on-accent shadow-xs'
          : 'text-muted hover:text-content hover:bg-hover bg-chip/40'
      )}
      onClick={onClick}
    >
      <span className="text-sm shrink-0">{icon}</span>
      <span className="shrink-0">{label}</span>
      {badge !== undefined && (
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-mono shrink-0 font-medium',
            active
              ? 'bg-white/25 text-on-accent font-bold'
              : badgeColor || 'bg-surface text-faint border border-line/60'
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
