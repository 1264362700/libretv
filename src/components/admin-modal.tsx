'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { useToast } from './toast';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';

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

interface StorageDiagnostics {
  dataDir: string;
  isPersistentMounted: boolean;
  storePath: string;
  exists: boolean;
  storeSize: number;
  userCount: number;
  inviteCount: number;
  globalSourceCount: number;
  userConfigsCount?: number;
  hasCustomGithubToken: boolean;
  gistConfigured: boolean;
  lastModified: number;
  database?: {
    type: string;
    configured: boolean;
  };
  superAdminUsername?: string;
  isDefaultPassword?: boolean;
}

export function AdminModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
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
      toast('获取邀请码失败', 'error');
    }
  }, [toast]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.admin.getUsers();
      if (res.success) setUsers(res.users);
    } catch {
      toast('获取用户列表失败', 'error');
    }
  }, [toast]);

  const fetchSources = useCallback(async () => {
    try {
      const res = await api.admin.getSources();
      if (res.success) {
        setSources(res.sources);
        if (res.backup) setSourcesBackup(res.backup);
      }
    } catch {
      toast('获取源列表失败', 'error');
    }
  }, [toast]);

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
        toast(`Neon 主库连接正常！响应延迟: ${res.latencyMs ?? 0}ms`, 'success');
      } else {
        setNeonStatus({ configured: Boolean(storageDiagnostics?.database?.configured), ok: false, error: res.error });
        toast(res.error || '主库连接探测失败', 'error');
      }
      fetchStorageInfo();
    } catch (e) {
      toast(e instanceof Error ? e.message : '探测异常', 'error');
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
          `全量数据已成功推送写入 Neon 数据库！(用户: ${res.stats.users}, 邀请码: ${res.stats.invites}, 全局源: ${res.stats.sources}, 用户配置: ${res.stats.userConfigs})`,
          'success'
        );
        fetchStorageInfo();
        handleTestNeon();
      } else {
        toast(res.error || '推送 Neon 失败', 'error');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : '推送 Neon 异常', 'error');
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
          `全量冷备已写入 GitHub Gist！包含 ${stats?.usersCount ?? 0} 用户, ${stats?.invitesCount ?? 0} 邀请码, ${stats?.sourcesCount ?? 0} 全站源`,
          'success'
        );
        fetchStorageInfo();
      } else {
        toast(res.error || '导出冷备失败', 'error');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : '导出冷备异常', 'error');
    } finally {
      setExportingGist(false);
    }
  };

  const handleRestoreGistToNeon = async () => {
    if (!window.confirm('⚠️ 容灾恢复将从 Gist 拉取备份覆盖/合并至 Neon 主库，确定执行吗？')) return;
    setRestoringGist(true);
    try {
      const res = await api.admin.restoreFromGist();
      if (res.success) {
        toast('容灾数据已成功还原至 Neon 主库！', 'success');
        fetchStorageInfo();
        fetchUsers();
        fetchSources();
      } else {
        toast(res.error || '从 Gist 容灾还原失败', 'error');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : '容灾恢复异常', 'error');
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
      toast('请输入 GitHub Classic Personal Access Token (ghp_...)', 'warning');
      return;
    }
    setSavingToken(true);
    try {
      const res = await api.admin.saveGithubToken(customToken.trim());
      if (res.success) {
        toast('GitHub Token 已验证成功并保存，数据已同步至专属私有 Gist！', 'success');
        setCustomToken('');
        setShowTokenInput(false);
        fetchStorageInfo();
        fetchUsers();
        fetchInvites();
      } else {
        toast(res.error || 'Token 验证失败，请确保具有 gist 读写权限', 'error');
      }
    } catch {
      toast('Token 保存异常，请检查网络', 'error');
    } finally {
      setSavingToken(false);
    }
  };

  const handleExportBackup = () => {
    window.open(api.admin.exportBackupUrl, '_blank');
    toast('全量离线备份文件已开始下载', 'info');
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
        toast('备份文件损坏，无法解析为 JSON', 'error');
        setImportingBackup(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const res = await api.admin.importBackup(data);
      if (res.success) {
        toast(
          `备份导入成功！已恢复 ${res.userCount ?? 0} 个用户，${res.inviteCount ?? 0} 个邀请码，${res.sourceCount ?? 0} 个全局源`,
          'success'
        );
        fetchStorageInfo();
        fetchUsers();
        fetchInvites();
        fetchSources();
      } else {
        toast(res.error || '导入备份失败', 'error');
      }
    } catch {
      toast('读取备份文件失败', 'error');
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
        toast(`成功生成 ${res.codes.length} 个邀请码`, 'success');
        fetchInvites();
      }
    } catch {
      toast('生成邀请码失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // 作废邀请码
  const handleRevokeInvite = async (code: string) => {
    try {
      const res = await api.admin.revokeInvite(code);
      if (res.success) {
        toast('已作废该邀请码', 'info');
        fetchInvites();
      }
    } catch {
      toast('作废失败', 'error');
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
    if (ok) toast('邀请直达链接已复制到剪贴板！', 'success');
  };

  // 复制带链接的完整邀请口令
  const handleCopyInvite = async (code: string) => {
    const url = getInviteUrl(code);
    const text = `您好，这是 cl 影视注册邀请直达链接：\n${url}\n（专属邀请码：${code}），点击直接进入注册！`;
    const ok = await copyToClipboard(text);
    if (ok) toast('邀请口令与链接已复制到剪贴板', 'success');
  };

  // 用户操作
  const handleBanToggle = async (user: UserItem) => {
    try {
      if (user.status === 'active') {
        await api.admin.banUser(user.username);
        toast(`已封禁用户 ${user.username}`, 'info');
      } else {
        await api.admin.unbanUser(user.username);
        toast(`已解封用户 ${user.username}`, 'success');
      }
      fetchUsers();
    } catch {
      toast('操作失败', 'error');
    }
  };

  const handleKickUser = async (username: string) => {
    try {
      await api.admin.kickUser(username);
      toast(`已强制用户 ${username} 互踢下线`, 'success');
      fetchUsers();
    } catch {
      toast('踢出失败', 'error');
    }
  };

  const handleResetPassword = async () => {
    if (!resettingUser || !newPassword.trim()) return;
    try {
      const res = await api.admin.resetPassword(resettingUser, newPassword);
      if (res.success) {
        toast(`已将 ${resettingUser} 的密码重置，该账号已被强制踢下线`, 'success');
        setResettingUser(null);
        setNewPassword('');
        fetchUsers();
      } else {
        toast(res.error || '重置失败', 'error');
      }
    } catch {
      toast('重置失败', 'error');
    }
  };

  // 全局源添加
  const handleAddSource = async () => {
    if (!sourceName.trim() || !sourceUrl.trim()) {
      toast('请完整填写名称与接口地址', 'warning');
      return;
    }
    try {
      const res = await api.admin.addSource({ name: sourceName, url: sourceUrl, type: sourceType });
      if (res.success) {
        toast('全局源已成功发布，全员免配置同步生效', 'success');
        setSourceName('');
        setSourceUrl('');
        fetchSources();
      }
    } catch {
      toast('添加失败', 'error');
    }
  };

  const handleRemoveSource = async (key: string) => {
    try {
      await api.admin.removeSource(key);
      toast('已移除该全局源', 'info');
      fetchSources();
    } catch {
      toast('删除失败', 'error');
    }
  };

  const handleBackupSources = async () => {
    setBackingUpSources(true);
    try {
      const res = await api.admin.backupSources();
      if (res.success) {
        toast(`物理备份成功，共备份 ${res.count} 个源`, 'success');
        fetchSources();
      } else {
        toast(res.error || '备份失败', 'error');
      }
    } catch {
      toast('备份失败', 'error');
    } finally {
      setBackingUpSources(false);
    }
  };

  const handleRestoreSources = async () => {
    setRestoringSources(true);
    try {
      const res = await api.admin.restoreSources();
      if (res.success) {
        toast(`智能合并恢复成功，当前共 ${res.count} 个有效源`, 'success');
        fetchSources();
      } else {
        toast(res.error || '合并恢复失败', 'error');
      }
    } catch {
      toast('合并恢复失败', 'error');
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
        <div className="flex items-center gap-2 px-4 sm:px-6 pt-3 border-b border-line bg-surface/95 overflow-x-auto no-scrollbar whitespace-nowrap">
          <TabButton
            active={tab === 'invites'}
            onClick={() => setTab('invites')}
            icon="🎟️"
            label="邀请码管理"
            badge={invites.length > 0 ? invites.length : undefined}
          />
          <TabButton
            active={tab === 'users'}
            onClick={() => setTab('users')}
            icon="👥"
            label="用户管理"
            badge={users.length > 0 ? users.length : undefined}
          />
          <TabButton
            active={tab === 'sources'}
            onClick={() => setTab('sources')}
            icon="📡"
            label="全局源管理"
            badge={sources.length > 0 ? sources.length : undefined}
          />
          <TabButton
            active={tab === 'persistence'}
            onClick={() => setTab('persistence')}
            icon="🛡️"
            label="持久化与数据安全"
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
                  {generating ? '生成中...' : '+ 立即下发邀请码'}
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
                              ? '已用完'
                              : `可用 (${inv.useCount}/${inv.maxUses})`
                            : '已作废'}
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
                            title="复制直达注册链接（包含邀请码）"
                          >
                            🔗 复制链接
                          </button>
                          <button
                            className="px-2 py-0.5 rounded bg-chip hover:bg-hover text-muted hover:text-content text-[11px] active:scale-95"
                            onClick={() => handleCopyInvite(inv.code)}
                            title="复制带链接的邀请口令"
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
                    当前超级管理员账号：<strong className="text-content font-mono font-bold text-accent">{storageDiagnostics?.superAdminUsername || 'admin'}</strong>。可在 Render 环境变量配置 <code className="text-accent">ADMIN_USERNAME</code> 随时自定义指定。
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
                                  title="超级管理员（享有系统最高权限，不可封禁）"
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
                              {u.role === 'admin' ? '管理员' : '普通用户'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                u.status === 'active' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                              )}
                            >
                              {u.status === 'active' ? '正常' : '已封禁'}
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
                                  title="递增会话版本，强制其在所有设备立刻下线"
                                >
                                  踢下线
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
                                  {u.status === 'active' ? '封禁' : '解封'}
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
                    placeholder="输入至少6位新密码"
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
                    <span className="text-xs font-bold text-content">全局源物理备份与环境变量合并引擎</span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-mono',
                        sourcesBackup?.exists ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
                      )}
                    >
                      {sourcesBackup?.exists ? `已就绪 · ${sourcesBackup.count} 个源备份` : '未检测到独立备份'}
                    </span>
                  </div>
                  <p className="text-[11px] text-faint">
                    启动时自动读取物理备份与环境变量 (DEFAULT_SOURCES / DEFAULT_LIVE_SOURCES) 智能去重合并
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={backingUpSources}
                    className="px-2.5 py-1 text-xs rounded-lg border border-line bg-chip hover:bg-hover text-muted hover:text-content active:scale-95 transition-all disabled:opacity-50"
                    onClick={handleBackupSources}
                    title="立即将当前全部源强制写入独立物理备份文件"
                  >
                    {backingUpSources ? '备份中...' : '立即写入备份'}
                  </button>
                  <button
                    type="button"
                    disabled={restoringSources}
                    className="px-2.5 py-1 text-xs rounded-lg border border-accent/40 bg-accent/10 hover:bg-accent/20 text-accent font-medium active:scale-95 transition-all disabled:opacity-50"
                    onClick={handleRestoreSources}
                    title="重新读取独立物理备份 + 环境变量进行增量智能合并"
                  >
                    {restoringSources ? '合并中...' : '智能合并恢复'}
                  </button>
                </div>
              </div>

              {/* 添加全局源 */}
              <div className="bg-chip/50 border border-line/60 rounded-xl p-3.5 space-y-3">
                <h3 className="text-xs font-semibold text-content">发布全局公共源（全员自动同步）</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    placeholder="源名称（如：官方极速站）"
                    className="input py-1.5 px-3 text-xs"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                  />
                  <input
                    placeholder="接口地址（http(s)://...）"
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
                            {s.type === 'vod' ? '影视站' : '直播源'}
                          </span>
                        </div>
                        <p className="text-[11px] text-faint truncate mt-0.5 font-mono">{s.url}</p>
                      </div>
                      <button
                        className="px-2.5 py-1 rounded bg-danger/10 hover:bg-danger/20 text-danger text-xs active:scale-95 shrink-0"
                        onClick={() => handleRemoveSource(s.key)}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* —— 选项卡 4：持久化与数据安全 —— */}
          {tab === 'persistence' && (
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
        'shrink-0 whitespace-nowrap px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all -mb-[1px] border-b-2',
        active
          ? 'border-accent text-accent bg-accent/10 shadow-sm'
          : 'border-transparent text-muted hover:text-content hover:bg-hover'
      )}
      onClick={onClick}
    >
      <span className="text-sm shrink-0">{icon}</span>
      <span className="shrink-0">{label}</span>
      {badge !== undefined && (
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-mono shrink-0',
            badgeColor || (active ? 'bg-accent/20 text-accent font-bold' : 'bg-chip text-muted')
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
