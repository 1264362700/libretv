import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  checkRateLimit,
  sessionFromCookieHeader,
  signSession,
  clearRateLimit,
  type RateLimitScope,
} from '@/lib/auth';
import {
  verifyUserCredentials,
  registerWithInvite,
  ensureGistLoaded,
} from '@/lib/auth-store';

export const runtime = 'nodejs';

function setSessionCookie(res: NextResponse, token: string, expiresAt: number, req: Request) {
  const secure =
    process.env.COOKIE_SECURE === 'true'
      ? true
      : process.env.COOKIE_SECURE === 'false'
        ? false
        : (req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'http') === 'https';

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: Math.floor((expiresAt - Date.now()) / 1000),
    path: '/',
  });
}

export async function POST(req: Request) {
  await ensureGistLoaded();
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  let body: { action?: string; username?: string; password?: string; inviteCode?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: '请求数据格式不正确' }, { status: 400 });
  }

  const action = body.action || 'login';
  // 注册与登录分开计数：试邀请码失败不该把用户的登录也锁住
  const scope: RateLimitScope = action === 'register' ? 'register' : 'login';

  if (!checkRateLimit(ip, scope)) {
    return NextResponse.json(
      { success: false, error: '尝试过于频繁，请 10 分钟后再试', retryAfterSec: 600 },
      { status: 429 }
    );
  }

  // 1. 邀请码注册流程
  if (action === 'register') {
    const username = String(body.username ?? '');
    const password = String(body.password ?? '');
    const inviteCode = String(body.inviteCode ?? '');

    const regResult = registerWithInvite(username, password, inviteCode);
    if (!regResult.success || !regResult.user) {
      return NextResponse.json(
        { success: false, error: regResult.error || '注册失败', field: regResult.field },
        { status: 400 }
      );
    }

    clearRateLimit(ip, 'register');
    const { token, expiresAt } = signSession(regResult.user);
    const res = NextResponse.json({
      success: true,
      user: { username: regResult.user.username, role: regResult.user.role },
      message: '注册成功并已自动登入',
    });
    setSessionCookie(res, token, expiresAt, req);
    return res;
  }

  // 2. 账号登录流程
  const rawUsername = String(body.username ?? '').trim();
  const password = String(body.password ?? '');

  // 兼容逻辑：若未传 username，默认尝试 admin 账号登录
  const username = rawUsername || 'admin';

  const verifyResult = verifyUserCredentials(username, password);
  if (!verifyResult.success || !verifyResult.user) {
    return NextResponse.json(
      { success: false, error: verifyResult.error || '用户名或密码错误' },
      { status: 401 }
    );
  }

  clearRateLimit(ip, 'login');
  const { token, expiresAt } = signSession(verifyResult.user);
  const res = NextResponse.json({
    success: true,
    user: { username: verifyResult.user.username, role: verifyResult.user.role },
  });
  setSessionCookie(res, token, expiresAt, req);
  return res;
}

/** GET：查询当前会话状态（支持顶号检测） */
export async function GET(req: Request) {
  const session = sessionFromCookieHeader(req.headers.get('cookie'));
  return NextResponse.json({
    success: true,
    verified: session.valid,
    user: session.user,
    code: session.reason,
    message: session.message,
  });
}

/** DELETE：退出登录 */
export async function DELETE() {
  const res = NextResponse.json({ success: true, message: '已安全登出' });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
  return res;
}
