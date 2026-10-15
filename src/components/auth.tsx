'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, onUnauthorized, STATUS_QUERY_KEY } from '@/lib/client-api';
import { applyEnvPresets } from '@/lib/subscription-sync';
import type { AuthStatusResponse } from '@/lib/types';
import { useToast } from './toast';
import { AdminModal } from './admin-modal';
import { cn } from '@/lib/utils';

export interface CurrentUser {
  username: string;
  role: 'admin' | 'user';
}

interface AuthContextValue {
  checked: boolean;
  verified: boolean;
  user: CurrentUser | null;
  isAdmin: boolean;
  setupRequired: boolean;
  version: string | null;
  kickNotice: string | null;
  openLogin: () => void;
  openAdminModal: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  checked: false,
  verified: false,
  user: null,
  isAdmin: false,
  setupRequired: false,
  version: null,
  kickNotice: null,
  openLogin: () => {},
  openAdminModal: () => {},
  logout: async () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [verified, setVerified] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [kickNotice, setKickNotice] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    queryClient
      .fetchQuery({ queryKey: STATUS_QUERY_KEY, queryFn: () => api.status() })
      .then((s) => {
        if (cancelled) return;
        setVerified(s.verified);
        setUser(s.user ?? null);
        if (s.kickReason === 'KICKED_OUT') {
          setKickNotice(s.kickMessage || '您的账号已在其他设备登录，当前会话已下线');
          setModalOpen(true);
        }
        setSetupRequired(!s.passwordRequired);
        setVersion(s.version);
        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  useEffect(
    () =>
      onUnauthorized((event) => {
        const detail = (event as CustomEvent).detail;
        if (typeof detail === 'object' && detail?.code === 'KICKED_OUT') {
          setKickNotice(detail.error || '您的账号已在其他设备登录，当前会话已下线');
        } else if (typeof detail === 'string' && detail === 'setup') {
          setSetupRequired(true);
        }
        setVerified(false);
        setUser(null);
        setModalOpen(true);
      }),
    []
  );

  const openLogin = useCallback(() => {
    setKickNotice(null);
    setModalOpen(true);
  }, []);

  const openAdminModal = useCallback(() => {
    setAdminModalOpen(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setVerified(false);
      setUser(null);
      toast('已退出登录', 'info');
    }
  }, [toast]);

  const handleLoginSuccess = useCallback(
    async (loggedUser?: CurrentUser) => {
      setVerified(true);
      if (loggedUser) setUser(loggedUser);
      setSetupRequired(false);
      setKickNotice(null);
      setModalOpen(false);
      queryClient.invalidateQueries();
      toast('登入成功', 'success');

      try {
        const cached = queryClient.getQueryData<AuthStatusResponse>(STATUS_QUERY_KEY);
        const status =
          cached ??
          (await queryClient.fetchQuery<AuthStatusResponse>({
            queryKey: STATUS_QUERY_KEY,
            queryFn: () => api.status(),
            staleTime: 0,
          }));
        if (status) await applyEnvPresets(status);
      } catch {
        // 忽略补拉
      }
    },
    [toast, queryClient]
  );

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        checked,
        verified,
        user,
        isAdmin,
        setupRequired,
        version,
        kickNotice,
        openLogin,
        openAdminModal,
        logout,
      }}
    >
      {children}
      {modalOpen && (
        <AuthModal
          kickNotice={kickNotice}
          onSuccess={handleLoginSuccess}
          onClose={() => setModalOpen(false)}
        />
      )}
      {isAdmin && <AdminModal open={adminModalOpen} onClose={() => setAdminModalOpen(false)} />}
    </AuthContext.Provider>
  );
}

/** 现代化双 Tab 门禁弹窗（账号登录 / 邀请码注册） */
function AuthModal({
  kickNotice,
  onSuccess,
  onClose,
}: {
  kickNotice: string | null;
  onSuccess: (user?: CurrentUser) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // 登录表单
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // 注册表单
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPassword.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.login({
        username: loginUsername.trim() || 'admin',
        password: loginPassword,
      });
      if (res.success) {
        onSuccess(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '用户名或密码不正确');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regPassword.trim() || !inviteCode.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.register({
        username: regUsername.trim(),
        password: regPassword,
        inviteCode: inviteCode.trim(),
      });
      if (res.success) {
        onSuccess(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请核对邀请码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-surface-raised rounded-2xl w-full max-w-sm shadow-2xl border border-line overflow-hidden animate-slide-up"
        role="dialog"
        aria-modal="true"
      >
        {/* 顶号互踢告警横幅 */}
        {kickNotice && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <span>⚠️</span>
            <span>{kickNotice}</span>
          </div>
        )}

        {/* 标题与选项卡 */}
        <div className="p-6 pb-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-content flex items-center gap-2">
              <span className="text-accent text-xl">🎬</span>
              <span>星芒影院 访问中心</span>
            </h2>
            <button
              className="text-faint hover:text-content text-sm p-1 rounded-md active:scale-90"
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          <div className="flex border-b border-line">
            <button
              className={cn(
                'flex-1 py-2 text-xs font-semibold border-b-2 transition-all',
                tab === 'login'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-content'
              )}
              onClick={() => {
                setTab('login');
                setError('');
              }}
            >
              账号登录
            </button>
            <button
              className={cn(
                'flex-1 py-2 text-xs font-semibold border-b-2 transition-all',
                tab === 'register'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-content'
              )}
              onClick={() => {
                setTab('register');
                setError('');
              }}
            >
              邀请码注册
            </button>
          </div>
        </div>

        {/* 表单内容 */}
        <div className="p-6 pt-3">
          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-[11px] text-faint mb-1">用户名 / 账号</label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="input w-full py-2 text-xs"
                  placeholder="admin 或 注册用户名"
                  autoComplete="username"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] text-faint mb-1">密码</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="input w-full py-2 text-xs"
                  placeholder="登录密码"
                  autoComplete="current-password"
                />
              </div>

              {error && <p className="text-xs text-danger pt-1">{error}</p>}

              <button
                type="submit"
                className="btn-primary w-full py-2 mt-2 text-xs font-semibold active:scale-95"
                disabled={loading || !loginPassword.trim()}
              >
                {loading ? '正在验证...' : '登入系统'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-[11px] text-faint mb-1">设置用户名</label>
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  className="input w-full py-2 text-xs"
                  placeholder="3-20 位中英文、数字"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] text-faint mb-1">设置密码</label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="input w-full py-2 text-xs"
                  placeholder="至少 6 位密码"
                />
              </div>
              <div>
                <label className="block text-[11px] text-faint mb-1">专属邀请码</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="input w-full py-2 text-xs font-mono uppercase tracking-wider"
                  placeholder="如 LTV-8A9X-2M4K"
                />
              </div>

              {error && <p className="text-xs text-danger pt-1">{error}</p>}

              <button
                type="submit"
                className="btn-primary w-full py-2 mt-2 text-xs font-semibold active:scale-95"
                disabled={loading || !regUsername.trim() || !regPassword.trim() || !inviteCode.trim()}
              >
                {loading ? '正在注册...' : '激活邀请码并完成注册'}
              </button>
              <p className="text-[10px] text-faint text-center pt-1">
                还没有邀请码？请联系站点管理员索取
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
