'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client-api';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/toast';
import { applyEnvPresets } from '@/lib/subscription-sync';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg text-content flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('redirect') || searchParams.get('next') || '/';
  const kickNotice = searchParams.get('kickNotice') || '';
  const { verified, checked } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 识别 URL 中的邀请码并自动切换至注册模式
  useEffect(() => {
    const codeParam = searchParams.get('invite') || searchParams.get('code') || searchParams.get('inviteCode');
    if (codeParam) {
      setInviteCode(codeParam.trim());
      setMode('register');
    }
  }, [searchParams]);

  // 已登录用户访问自动跳转
  useEffect(() => {
    if (checked && verified) {
      router.replace(nextUrl);
    }
  }, [checked, verified, router, nextUrl]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const u = username.trim();
    if (!u) {
      setErrorMsg('请输入账号名称');
      return;
    }
    if (!password) {
      setErrorMsg('请输入登录密码');
      return;
    }

    setLoading(true);
    try {
      const res = await api.login({ username: u, password });
      if (res.success) {
        toast(`欢迎回来，${res.user?.username || u}！`, 'success');
        try {
          const s = await api.status();
          await applyEnvPresets(s);
        } catch {
          // ignore
        }
        window.location.href = nextUrl;
      } else {
        setErrorMsg(res.message || '登录失败，请检查账号密码');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '网络异常，登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const u = username.trim();
    const code = inviteCode.trim();

    if (!code) {
      setErrorMsg('请输入注册邀请码');
      return;
    }
    if (!u || u.length < 3) {
      setErrorMsg('账号名称至少需 3 个字符');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('密码长度不能少于 6 位');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const res = await api.register({ code, username: u, password });
      if (res.success) {
        toast('注册成功并已自动登录！', 'success');
        try {
          const s = await api.status();
          await applyEnvPresets(s);
        } catch {
          // ignore
        }
        window.location.href = nextUrl;
      } else {
        setErrorMsg(res.message || '注册失败，请检查邀请码');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '网络异常，注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* 极简流光背景装饰 */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* 极简 cl 品牌 Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 group mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center font-black text-xl tracking-tighter shadow-md group-hover:scale-105 transition-transform">
            cl
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-content group-hover:text-accent transition-colors">
            cl<span className="text-accent">.tv</span>
          </span>
        </Link>
        <h2 className="text-center text-xl font-bold text-content tracking-tight">
          {mode === 'login' ? '登录您的账号' : '创建新账号'}
        </h2>
        <p className="mt-1 text-center text-xs text-muted">
          影院级超清影视探索平台 · 跨端云同步
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 relative z-10">
        <div className="bg-surface-raised border border-line shadow-xl rounded-2xl p-6 sm:p-8 backdrop-blur">
          {/* 被顶号或下线提示 */}
          {kickNotice && (
            <div className="mb-5 p-3.5 bg-danger/10 border border-danger/30 rounded-xl text-danger text-xs flex items-center gap-2.5 animate-fade-in font-medium">
              <span className="text-base shrink-0">⚠️</span>
              <span>{kickNotice}</span>
            </div>
          )}

          {/* Tab 切换 */}
          <div className="flex rounded-xl bg-chip/60 p-1 mb-6 border border-line/40">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg('');
              }}
              className={cn(
                'flex-1 py-2 text-xs font-semibold rounded-lg transition-all',
                mode === 'login' ? 'bg-surface text-content shadow-xs' : 'text-muted hover:text-content'
              )}
            >
              {t('auth.login', '账号登录')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg('');
              }}
              className={cn(
                'flex-1 py-2 text-xs font-semibold rounded-lg transition-all',
                mode === 'register' ? 'bg-surface text-content shadow-xs' : 'text-muted hover:text-content'
              )}
            >
              {t('auth.register', '邀请码注册')}
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2 animate-in fade-in">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-content mb-1">{t('auth.username', '账号名称')}</label>
                <input
                  type="text"
                  autoComplete="username"
                  required
                  placeholder="admin 或您的用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input w-full text-sm py-2 px-3 rounded-xl bg-bg border border-line focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-content mb-1">{t('auth.password', '登录密码')}</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="请输入您的密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full text-sm py-2 px-3 rounded-xl bg-bg border border-line focus:border-accent"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mt-2 shadow-sm active:scale-98 transition-all"
              >
                {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('auth.submitLogin', '立即登录')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-content mb-1">{t('auth.inviteCode', '注册邀请码')}</label>
                <input
                  type="text"
                  required
                  placeholder="例如: LTV-XXXX-XXXX"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="input w-full text-sm py-2 px-3 rounded-xl bg-bg border border-line focus:border-accent font-mono"
                />
                <p className="text-[11px] text-faint mt-1">如无邀请码请联系站长或管理员获取</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-content mb-1">{t('auth.username', '账号名称')}</label>
                <input
                  type="text"
                  autoComplete="username"
                  required
                  placeholder="3-20 位字母/数字"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input w-full text-sm py-2 px-3 rounded-xl bg-bg border border-line focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-content mb-1">{t('auth.password', '设置密码')}</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="不少于 6 位"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full text-sm py-2 px-3 rounded-xl bg-bg border border-line focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-content mb-1">{t('auth.confirmPassword', '确认密码')}</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="请再次输入相同密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input w-full text-sm py-2 px-3 rounded-xl bg-bg border border-line focus:border-accent"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mt-2 shadow-sm active:scale-98 transition-all"
              >
                {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('auth.submitRegister', '注册并登录')}
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-line/60 flex items-center justify-between text-xs text-muted">
            <Link href="/" className="hover:text-accent transition-colors flex items-center gap-1">
              <span>←</span>
              <span>返回首页</span>
            </Link>
            <span className="text-[11px] text-faint">自由观影 · 极速秒播</span>
          </div>
        </div>
      </div>
    </div>
  );
}
