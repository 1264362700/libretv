'use client';

import { useCallback, useEffect, useState } from 'react';
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

export function AdminModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<'invites' | 'users' | 'sources'>('invites');

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
      if (res.success) setSources(res.sources);
    } catch {
      toast('获取源列表失败', 'error');
    }
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    if (tab === 'invites') fetchInvites().finally(() => setLoading(false));
    if (tab === 'users') fetchUsers().finally(() => setLoading(false));
    if (tab === 'sources') fetchSources().finally(() => setLoading(false));
  }, [open, tab, fetchInvites, fetchUsers, fetchSources]);

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

  // 复制邀请口令
  const handleCopyInvite = async (code: string) => {
    const text = `您好，这是 cl 影视服务邀请码：${code}，请在首页注册使用！`;
    const ok = await copyToClipboard(text);
    if (ok) toast('邀请口令已复制到剪贴板', 'success');
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
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-line/60 bg-surface">
          <TabButton active={tab === 'invites'} onClick={() => setTab('invites')} icon="🎟️" label="邀请码管理" />
          <TabButton active={tab === 'users'} onClick={() => setTab('users')} icon="👥" label="用户管理" />
          <TabButton active={tab === 'sources'} onClick={() => setTab('sources')} icon="📡" label="全局源管理" />
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
                            className="px-2 py-0.5 rounded bg-chip hover:bg-hover text-muted hover:text-content text-[11px] active:scale-95"
                            onClick={() => handleCopyInvite(inv.code)}
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
