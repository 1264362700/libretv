import crypto from 'node:crypto';
import { getUser } from './auth-store';

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
export function signSession(user: {
  username: string;
  role: 'admin' | 'user';
  sessionVersion: number;
}): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payloadObj: SessionPayload = {
    username: user.username,
    role: user.role,
    sessionVersion: user.sessionVersion,
    expiresAt,
  };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const token = `${payload}.${hmac(payload)}`;
  return { token, expiresAt };
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

    const user = getUser(parsed.username);
    if (!user) {
      return { valid: false, reason: 'USER_NOT_FOUND', message: '账号已不存在' };
    }

    if (user.status === 'banned') {
      return { valid: false, reason: 'BANNED', message: '您的账号已被管理员封禁' };
    }

    // 核心安全逻辑：顶号互踢校验
    if (user.sessionVersion !== parsed.sessionVersion) {
      return {
        valid: false,
        reason: 'KICKED_OUT',
        message: '您的账号已在其他设备登录，当前会话已下线',
      };
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
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attemptMap.get(ip);
  if (!entry || now > entry.resetAt) {
    attemptMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

export function clearRateLimit(ip: string): void {
  attemptMap.delete(ip);
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
