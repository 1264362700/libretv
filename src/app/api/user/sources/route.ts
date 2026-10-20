import { NextResponse } from 'next/server';
import { sessionFromCookieHeader } from '@/lib/auth';
import { getUserSearchConfig, saveUserSearchConfig, ensureGistLoaded } from '@/lib/auth-store';

export const runtime = 'nodejs';

/**
 * 用户专属搜索源与订阅配置 API
 * GET: 读取当前登录用户的个性化源配置
 * POST: 保存当前登录用户的个性化源配置至 Neon 数据库
 */

export async function GET(req: Request) {
  await ensureGistLoaded();
  const session = sessionFromCookieHeader(req.headers.get('cookie'));

  if (!session.valid || !session.user) {
    return NextResponse.json({ success: false, error: '请先登录以同步您的专属配置' }, { status: 401 });
  }

  const config = getUserSearchConfig(session.user.username);
  return NextResponse.json({
    success: true,
    username: session.user.username,
    config: config || {
      customSources: [],
      selectedKeys: [],
      subscriptions: [],
      updatedAt: null,
    },
  });
}

export async function POST(req: Request) {
  await ensureGistLoaded();
  const session = sessionFromCookieHeader(req.headers.get('cookie'));

  if (!session.valid || !session.user) {
    return NextResponse.json({ success: false, error: '请先登录以保存配置' }, { status: 401 });
  }

  let body: {
    customSources?: unknown[];
    selectedKeys?: string[];
    subscriptions?: unknown[];
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: '请求数据格式不正确' }, { status: 400 });
  }

  const updated = saveUserSearchConfig(session.user.username, {
    customSources: Array.isArray(body.customSources) ? body.customSources : undefined,
    selectedKeys: Array.isArray(body.selectedKeys) ? body.selectedKeys : undefined,
    subscriptions: Array.isArray(body.subscriptions) ? body.subscriptions : undefined,
  });

  return NextResponse.json({
    success: true,
    message: '配置已同步至 Neon 数据库',
    config: updated,
  });
}
