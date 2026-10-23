import crypto from 'node:crypto';
import { getUser, verifyUserCredentials, syncUserSessionVersion, restoreUserSession } from './auth-store';

/**
 * 会话鉴权：httpOnly cookie + HMAC 签名。
 * 支持用户角色（admin/user）与 sessionVersion 顶号互踢拦截。
 */

export const SESSION_COOKIE = 'ltv_session';
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 天

export interface SessionPayload {
  username: string;
  role: 'admin' | 'user';
  sessionVersion: number;
  expiresAt: number;
}

export interface VerifySessionResult {
  valid: boolean;
  user?: {
    username: string;
    role: 'admin' | 'user';
  };
  reason?: 'NO_TOKEN' | 'EXPIRED' | 'SIG_INVALID' | 'USER_NOT_FOUND' | 'BANNED' | 'KICKED_OUT';
  message?: string;
}

export function getSecret(): string {
  if (process.env.PROXY_SECRET) return process.env.PROXY_SECRET;
  const seed = process.env.ADMIN_PASSWORD || process.env.PASSWORD || 'libretv-default-secret-salt-2026';
  return crypto.createHash('sha256').update(seed + ':libretv::session-salt').digest('hex');
}

function hmac(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/** 生成签名会话 token：`<base64Payload>.<hmac>` */
export function signSession(user?: {
  username?: string;
  role?: 'admin' | 'user';
  sessionVersion?: number;
}): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const username = user?.username || 'admin';
  const dbUser = getUser(username);
  const sessionVersion = user?.sessionVersion ?? dbUser?.sessionVersion ?? 1;
  const payloadObj: SessionPayload = {
    username,
    role: user?.role || dbUser?.role || 'admin',
    sessionVersion,
    expiresAt,
  };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const token = `${payload}.${hmac(payload)}`;
  return { token, expiresAt };
}

export function checkPassword(password: string): boolean {
  if (!process.env.PASSWORD && !process.env.ADMIN_PASSWORD) return false;
  return verifyUserCredentials('admin', password).success;
}

/** 校验会话 token 的签名、有效期、封禁状态与顶号版本 */
export function verifySession(token: string | undefined | null): VerifySessionResult {
  if (!token) return { valid: false, reason: 'NO_TOKEN', message: '未登录' };
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return { valid: false, reason: 'SIG_INVALID', message: '会话凭证格式异常' };

  const payloadStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(payloadStr);

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'SIG_INVALID', message: '会话签名不合法' };
  }

  // 尝试反序列化新版 SessionPayload
  try {
    const raw = Buffer.from(payloadStr, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw) as SessionPayload;

    if (!parsed || !parsed.username || !parsed.expiresAt) {
      return { valid: false, reason: 'SIG_INVALID', message: '会话内容不完整' };
    }

    if (Date.now() >= parsed.expiresAt) {
      return { valid: false, reason: 'EXPIRED', message: '登录状态已过期，请重新登录' };
    }

    let user = getUser(parsed.username);
    if (!user) {
      // 容灾设计：Render 容器重启重置临时内存时，若具备合法 HMAC 签名则平滑复原
      user = restoreUserSession(parsed.username, parsed.role || 'user', parsed.sessionVersion);
    }

    if (user.status === 'banned') {
      return { valid: false, reason: 'BANNED', message: '您的账号已被管理员封禁' };
    }

    // 核心安全逻辑：顶号互踢校验
    // 只有当客户端版本小于服务端更高版本时才断定被新设备顶下线；
    // 若客户端版本 >= 服务端版本（如容器重启重置为 1），则平滑同步为客户端最新版本，彻底根除跨部署掉签
    if (parsed.sessionVersion < user.sessionVersion) {
      return {
        valid: false,
        reason: 'KICKED_OUT',
        message: '您的账号已在其他设备登录，当前会话已下线',
      };
    }

    if (parsed.sessionVersion > user.sessionVersion) {
      syncUserSessionVersion(user.username, parsed.sessionVersion);
    }

    return {
      valid: true,
      user: {
        username: user.username,
        role: user.role,
      },
    };
  } catch {
    // 兼容历史纯时间戳 Token（迁移期平滑兼容）
    const expiresAt = parseInt(payloadStr, 10);
    if (Number.isFinite(expiresAt) && Date.now() < expiresAt) {
      return {
        valid: true,
        user: { username: 'admin', role: 'admin' },
      };
    }
    return { valid: false, reason: 'SIG_INVALID', message: '会话解析失败' };
  }
}

/** 从请求 Cookie 中解析会话并校验 */
export function sessionFromCookieHeader(cookieHeader: string | null): VerifySessionResult {
  if (!cookieHeader) return { valid: false, reason: 'NO_TOKEN', message: '未登录' };
  const cookies = cookieHeader.split(';');
  for (const c of cookies) {
    const eq = c.indexOf('=');
    if (eq === -1) continue;
    const name = c.slice(0, eq).trim();
    if (name === SESSION_COOKIE) {
      return verifySession(decodeURIComponent(c.slice(eq + 1).trim()));
    }
  }
  return { valid: false, reason: 'NO_TOKEN', message: '未登录' };
}

// —— 登录速率限制（防暴力破解） ——

const attemptMap = new Map<string, { count: number; resetAt: number }>();

/**
 * 按动作分桶：登录要严格防暴破，注册则要容忍用户反复试错的邀请码。
 * 两者共用过一个桶，出现过「试邀请码失败几次把自己的登录锁 10 分钟」的情况。
 */
export type RateLimitScope = 'login' | 'register';

const MAX_ATTEMPTS: Record<RateLimitScope, number> = { login: 10, register: 20 };
const WINDOW_MS = 10 * 60 * 1000;

function rateKey(ip: string, scope: RateLimitScope): string {
  return `${scope}:${ip}`;
}

export function checkRateLimit(ip: string, scope: RateLimitScope = 'login'): boolean {
  const key = rateKey(ip, scope);
  const now = Date.now();
  const entry = attemptMap.get(key);
  if (!entry || now > entry.resetAt) {
    attemptMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS[scope]) return false;
  entry.count += 1;
  return true;
}

/** 剩余可用次数，用于给前端「还能试几次」的提示 */
export function remainingAttempts(ip: string, scope: RateLimitScope = 'login'): number {
  const entry = attemptMap.get(rateKey(ip, scope));
  if (!entry || Date.now() > entry.resetAt) return MAX_ATTEMPTS[scope];
  return Math.max(0, MAX_ATTEMPTS[scope] - entry.count);
}

export function clearRateLimit(ip: string, scope: RateLimitScope = 'login'): void {
  attemptMap.delete(rateKey(ip, scope));
}

if (typeof setInterval === 'function') {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of attemptMap) {
      if (now > entry.resetAt) attemptMap.delete(ip);
    }
  }, 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
}
