import { NextResponse } from 'next/server';
import { sessionFromCookieHeader, type VerifySessionResult } from './auth';

/** API Route 共享守卫：未登录返回 401，被顶号返回 401 KICKED_OUT，被封禁返回 403 BANNED */
export function guardRequest(req: Request): NextResponse | null {
  const session = sessionFromCookieHeader(req.headers.get('cookie'));
  if (!session.valid) {
    if (session.reason === 'KICKED_OUT') {
      return NextResponse.json(
        { error: session.message || '您的账号已在其他设备登录，当前会话已下线', code: 'KICKED_OUT' },
        { status: 401 }
      );
    }
    if (session.reason === 'BANNED') {
      return NextResponse.json(
        { error: session.message || '您的账号已被管理员封禁', code: 'BANNED' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: session.message || '未登录', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }
  return null;
}

/** 管理员专属路由守卫 */
export function guardAdminRequest(req: Request): { errorResponse: NextResponse | null; session: VerifySessionResult } {
  const session = sessionFromCookieHeader(req.headers.get('cookie'));
  if (!session.valid) {
    return {
      errorResponse: NextResponse.json(
        { error: session.message || '未登录', code: session.reason || 'UNAUTHORIZED' },
        { status: 401 }
      ),
      session,
    };
  }

  if (session.user?.role !== 'admin') {
    return {
      errorResponse: NextResponse.json(
        { error: '权限不足：仅管理员可执行该操作', code: 'FORBIDDEN' },
        { status: 403 }
      ),
      session,
    };
  }

  return { errorResponse: null, session };
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
