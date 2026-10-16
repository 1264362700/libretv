'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, onUnauthorized, STATUS_QUERY_KEY } from '@/lib/client-api';
import { useToast } from './toast';
import { AdminModal } from './admin-modal';

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
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [verified, setVerified] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [kickNotice, setKickNotice] = useState<string | null>(null);
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
          const msg = s.kickMessage || '您的账号已在其他设备登录，当前会话已下线';
          setKickNotice(msg);
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            const currentUrl = window.location.pathname + window.location.search;
            const params = new URLSearchParams();
            if (currentUrl && currentUrl !== '/') params.set('redirect', currentUrl);
            params.set('kickNotice', msg);
            router.push(`/login?${params.toString()}`);
          }
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
  }, [queryClient, router]);

  useEffect(
    () =>
      onUnauthorized((event) => {
        const detail = (event as CustomEvent).detail;
        let notice = '';
        if (typeof detail === 'object' && detail?.code === 'KICKED_OUT') {
          notice = detail.error || '您的账号已在其他设备登录，当前会话已下线';
          setKickNotice(notice);
        } else if (typeof detail === 'string' && detail === 'setup') {
          setSetupRequired(true);
        }
        setVerified(false);
        setUser(null);

        // 未通过登录校验：全部统一跳转到独立登录页 /login，彻底弃用弹窗
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          const currentUrl = window.location.pathname + window.location.search;
          const params = new URLSearchParams();
          if (currentUrl && currentUrl !== '/') params.set('redirect', currentUrl);
          if (notice) params.set('kickNotice', notice);
          const qs = params.toString();
          router.push(qs ? `/login?${qs}` : '/login');
        }
      }),
    [router]
  );

  const openLogin = useCallback(() => {
    setKickNotice(null);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      const currentUrl = window.location.pathname + window.location.search;
      const params = new URLSearchParams();
      if (currentUrl && currentUrl !== '/') params.set('redirect', currentUrl);
      const qs = params.toString();
      router.push(qs ? `/login?${qs}` : '/login');
      return;
    }
    router.push('/login');
  }, [router]);

  const openAdminModal = useCallback(() => {
    setAdminModalOpen(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setVerified(false);
      setUser(null);
      queryClient.clear();
      toast('已退出登录', 'info');
      router.push('/login');
    }
  }, [toast, queryClient, router]);

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
      {isAdmin && <AdminModal open={adminModalOpen} onClose={() => setAdminModalOpen(false)} />}
    </AuthContext.Provider>
  );
}
