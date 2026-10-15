import { NextResponse } from 'next/server';
import { guardAdminRequest } from '@/lib/api-guard';
import {
  listInviteCodes,
  createInviteCodes,
  revokeInviteCode,
  listUsers,
  banUser,
  unbanUser,
  kickUser,
  resetUserPassword,
  listGlobalSources,
  addGlobalSource,
  removeGlobalSource,
} from '@/lib/auth-store';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { errorResponse } = guardAdminRequest(req);
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'invites';

  if (type === 'invites') {
    return NextResponse.json({ success: true, invites: listInviteCodes() });
  }

  if (type === 'users') {
    return NextResponse.json({ success: true, users: listUsers() });
  }

  if (type === 'sources') {
    return NextResponse.json({ success: true, sources: listGlobalSources() });
  }

  return NextResponse.json({ success: false, error: '未知的查询类型' }, { status: 400 });
}

export async function POST(req: Request) {
  const { errorResponse, session } = guardAdminRequest(req);
  if (errorResponse) return errorResponse;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: '请求数据格式错误' }, { status: 400 });
  }

  const action = String(body.action || '');

  // 1. 生成邀请码
  if (action === 'create_invite') {
    const count = Number(body.count) || 1;
    const maxUses = Number(body.maxUses) || 1;
    const prefix = typeof body.prefix === 'string' ? body.prefix.trim() : 'LTV';

    const codes = createInviteCodes({
      count,
      maxUses,
      createdBy: session.user?.username || 'admin',
      prefix,
    });
    return NextResponse.json({ success: true, codes });
  }

  // 2. 作废邀请码
  if (action === 'revoke_invite') {
    const code = String(body.code || '');
    const ok = revokeInviteCode(code);
    return NextResponse.json({ success: ok, error: ok ? undefined : '邀请码不存在' });
  }

  // 3. 封禁用户
  if (action === 'ban_user') {
    const username = String(body.username || '');
    const ok = banUser(username);
    return NextResponse.json({ success: ok, error: ok ? undefined : '无法封禁该账号' });
  }

  // 4. 解封用户
  if (action === 'unban_user') {
    const username = String(body.username || '');
    const ok = unbanUser(username);
    return NextResponse.json({ success: ok, error: ok ? undefined : '用户不存在' });
  }

  // 5. 强制踢下线（触发顶号互踢拦截）
  if (action === 'kick_user') {
    const username = String(body.username || '');
    const ok = kickUser(username);
    return NextResponse.json({ success: ok, error: ok ? undefined : '用户不存在' });
  }

  // 6. 重置用户密码
  if (action === 'reset_password') {
    const username = String(body.username || '');
    const newPassword = String(body.newPassword || '');
    const ok = resetUserPassword(username, newPassword);
    return NextResponse.json({ success: ok, error: ok ? undefined : '重置失败，密码至少6位' });
  }

  // 7. 添加全局源
  if (action === 'add_source') {
    const name = String(body.name || '').trim();
    const sourceUrl = String(body.url || '').trim();
    const type = body.type === 'live' ? 'live' : 'vod';

    if (!name || !sourceUrl) {
      return NextResponse.json({ success: false, error: '名称与地址不能为空' }, { status: 400 });
    }

    const source = addGlobalSource({ name, url: sourceUrl, type });
    return NextResponse.json({ success: true, source });
  }

  // 8. 移除全局源
  if (action === 'remove_source') {
    const key = String(body.key || '');
    const ok = removeGlobalSource(key);
    return NextResponse.json({ success: ok, error: ok ? undefined : '全局源不存在' });
  }

  return NextResponse.json({ success: false, error: '未支持的管理员动作' }, { status: 400 });
}
