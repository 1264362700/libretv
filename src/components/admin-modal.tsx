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
  hasCustomGithubToken: boolean;
  gistConfigured: boolean;
  lastModified: number;
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
  const [syncingGist, setSyncingGist] = useState(false);
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
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    if (tab === 'invites') fetchInvites().finally(() => setLoading(false));
    if (tab === 'users') fetchUsers().finally(() => setLoading(false));
    if (tab === 'sources') fetchSources().finally(() => setLoading(false));
    if (tab === 'persistence') fetchStorageInfo().finally(() => setLoading(false));
  }, [open, tab, fetchInvites, fetchUsers, fetchSources, fetchStorageInfo]);

  const handleSyncGist = async () => {
    setSyncingGist(true);
    try {
      const res = await api.admin.syncGist();
      if (res.success) {
        toast('已成功将全量数据推送同步至 GitHub Gist 云端！', 'success');
        fetchStorageInfo();
      } else {
        toast(res.error || '同步失败', 'error');
      }
    } catch {
      toast('同步网络异常', 'error');
    } finally {
      setSyncingGist(false);
    }
  };

  const handlePullGist = async () => {
    setSyncingGist(true);
    try {
      const res = await api.admin.pullGist();
      if (res.success) {
        toast('已从 GitHub Gist 强制拉取最新云端数据！', 'success');
        fetchStorageInfo();
        fetchInvites();
        fetchUsers();
      } else {
        toast(res.error || '拉取失败', 'error');
      }
    } catch {
      toast('拉取网络异常', 'error');
    } finally {
      setSyncingGist(false);
    }
  };

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

        {/* 选项卡 */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-line/60 bg-surface overflow-x-auto no-scrollbar">
          <TabButton active={tab === 'invites'} onClick={() => setTab('invites')} icon="🎟️" label="邀请码管理" />
          <TabButton active={tab === 'users'} onClick={() => setTab('users')} icon="👥" label="用户管理" />
          <TabButton active={tab === 'sources'} onClick={() => setTab('sources')} icon="📡" label="全局源管理" />
          <TabButton active={tab === 'persistence'} onClick={() => setTab('persistence')} icon="🛡️" label="持久化与数据安全" />
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
                          <td className="p-3 font-medium text-content">{u.username}</td>
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
                            {u.role !== 'admin' && (
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

              {/* 1. GitHub Gist 云端持久化状态与直配面板 */}
              <div className="bg-card border border-line rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">☁️</span>
                    <div>
                      <h3 className="text-sm font-bold text-content">GitHub Gist 云端自动备份 (强烈推荐)</h3>
                      <p className="text-xs text-faint">基于私有 Gist API 自动双向同步账号、邀请码与全局源，无论容器怎么重启重建永不丢失</p>
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
                    {gistStatus?.enabled ? '● 已连接 GitHub 云端' : '○ 未连接云端 (仅本地)'}
                  </span>
                </div>

                {/* Token 配置输入区 */}
                {(!gistStatus?.enabled || showTokenInput) ? (
                  <div className="bg-chip/40 border border-line/60 rounded-xl p-3.5 space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-content">绑定 GitHub Personal Access Token (PAT)</span>
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
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx (需勾选 gist 权限)"
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
                        {savingToken ? '验证连接中...' : '保存并连接 GitHub 云端'}
                      </button>
                    </div>
                    <p className="text-[11px] text-faint leading-relaxed">
                      💡 前往 GitHub: <strong>Settings</strong> → <strong>Developer settings</strong> → <strong>Personal access tokens (classic)</strong> → <strong>Generate new token</strong>，勾选 <code>gist</code> 权限后复制填入。系统将自动创建或绑定专属私密 Gist。
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-success/5 border border-success/20 rounded-xl text-xs">
                    <div className="flex items-center gap-2 text-success font-medium">
                      <span>✓ GitHub Token 已绑定并受密码学保护</span>
                      {storageDiagnostics?.hasCustomGithubToken && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 font-normal">存储引擎安全保存</span>
                      )}
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
                    <span className="text-faint font-medium">云端私有仓库 (Gist):</span>
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
                            在 GitHub 打开 ↗
                          </a>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted font-mono">{gistStatus?.enabled ? '初始化探测连接中...' : '未连接 (请配置 GitHub Token)'}</p>
                    )}
                  </div>

                  <div className="bg-chip/50 p-3 rounded-xl border border-line/50 space-y-1">
                    <span className="text-faint font-medium">上次云端同步状态:</span>
                    <div className="flex items-center gap-2">
                      <p className="text-content font-mono">
                        {gistStatus?.lastSyncAt ? new Date(gistStatus.lastSyncAt).toLocaleString() : '尚未同步'}
                      </p>
                      {gistStatus?.lastAction && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-chip text-faint uppercase font-mono">
                          {gistStatus.lastAction}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {gistStatus?.lastError && (
                  <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-xs text-danger">
                    云同步告警: {gistStatus.lastError}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line/40">
                  <button
                    type="button"
                    className="btn-primary py-1.5 px-3 text-xs active:scale-95 disabled:opacity-50"
                    onClick={handleSyncGist}
                    disabled={!gistStatus?.enabled || syncingGist}
                  >
                    {syncingGist ? '同步中...' : '☁️ 立即同步至 Gist'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost py-1.5 px-3 text-xs active:scale-95 disabled:opacity-50"
                    onClick={handlePullGist}
                    disabled={!gistStatus?.enabled || syncingGist}
                  >
                    📥 从云端拉取覆盖
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
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      className={cn(
        'px-3.5 py-2 rounded-t-lg text-xs font-semibold flex items-center gap-1.5 transition-all border-b-2',
        active
          ? 'border-accent text-accent bg-chip/40'
          : 'border-transparent text-muted hover:text-content hover:bg-hover'
      )}
      onClick={onClick}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
