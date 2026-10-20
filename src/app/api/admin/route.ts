import { NextResponse } from 'next/server';
import { guardAdminRequest } from '@/lib/api-guard';
import { testNeonConnection, isPostgresConfigured } from '@/lib/db-postgres';
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
  ensureGistLoaded,
  getGistStatus,
  manualSyncGist,
  manualPullGist,
  getGlobalSourcesBackupStatus,
  manualBackupGlobalSources,
  manualRestoreGlobalSources,
  getStorageDiagnostics,
  exportFullBackup,
  importFullBackup,
  saveCustomGithubToken,
} from '@/lib/auth-store';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { errorResponse } = guardAdminRequest(req);
  if (errorResponse) return errorResponse;

  await ensureGistLoaded();

  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'invites';

  if (type === 'gist_status') {
    return NextResponse.json({ success: true, status: getGistStatus() });
  }

  if (type === 'neon_status') {
    const conn = await testNeonConnection();
    return NextResponse.json({
      success: true,
      configured: isPostgresConfigured(),
      neon: conn,
    });
  }

  if (type === 'storage_info') {
    const neonConn = await testNeonConnection();
    return NextResponse.json({
      success: true,
      diagnostics: getStorageDiagnostics(),
      gistStatus: getGistStatus(),
      neon: {
        configured: isPostgresConfigured(),
        ...neonConn,
      },
    });
  }

  if (type === 'export_backup') {
    const backup = exportFullBackup();
    const filename = `libretv-backup-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  if (type === 'invites') {
    return NextResponse.json({ success: true, invites: listInviteCodes() });
  }

  if (type === 'users') {
    return NextResponse.json({ success: true, users: listUsers() });
  }

  if (type === 'sources') {
    return NextResponse.json({
      success: true,
      sources: listGlobalSources(),
      backup: getGlobalSourcesBackupStatus(),
    });
  }

  return NextResponse.json({ success: false, error: '未知的查询类型' }, { status: 400 });
}

export async function POST(req: Request) {
  const { errorResponse, session } = guardAdminRequest(req);
  if (errorResponse) return errorResponse;

  await ensureGistLoaded();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: '请求数据格式错误' }, { status: 400 });
  }

  const action = String(body.action || '');

  // 0. Gist 独立容灾导出与还原 (或旧版别名)
  if (action === 'gist_sync' || action === 'backup_to_gist') {
    const res = await manualSyncGist();
    return NextResponse.json(res);
  }
  if (action === 'gist_pull' || action === 'restore_from_gist') {
    const res = await manualPullGist();
    return NextResponse.json(res);
  }
  if (action === 'neon_test') {
    const res = await testNeonConnection();
    return NextResponse.json({ success: res.ok, ...res });
  }

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

  // 9. 手动落盘全局源物理备份
  if (action === 'backup_sources') {
    const res = manualBackupGlobalSources();
    return NextResponse.json(res);
  }

  // 10. 手动触发物理备份 + 环境变量智能合并恢复
  if (action === 'restore_sources') {
    const res = manualRestoreGlobalSources();
    return NextResponse.json(res);
  }

  // 11. 保存自定义 GitHub Token 并绑定云端 Gist
  if (action === 'save_github_token') {
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const res = await saveCustomGithubToken(token);
    return NextResponse.json(res);
  }

  // 12. 离线导入全量备份
  if (action === 'import_backup') {
    const rawData = body.data;
    const res = importFullBackup(rawData);
    return NextResponse.json(res);
  }

  return NextResponse.json({ success: false, error: '未支持的管理员动作' }, { status: 400 });
}
