import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isPostgresConfigured,
  testNeonConnection,
  getPostgresPool,
} from './db-postgres';
import {
  exportNeonToGist,
  restoreGistToNeon,
  getGistBackupStatus,
  setCustomGithubToken,
} from './gist-backup';
import {
  getUserSearchConfig,
  saveUserSearchConfig,
  getStorageDiagnostics,
  getSuperAdminUsername,
  listUsers,
  banUser,
} from './auth-store';

describe('Neon PostgreSQL & Decoupled Gist Architecture', () => {
  const originalDbUrl = process.env.DATABASE_URL;
  const originalGhToken = process.env.GITHUB_TOKEN;
  const originalAdminUser = process.env.ADMIN_USERNAME;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.GITHUB_TOKEN;
    delete process.env.ADMIN_USERNAME;
    setCustomGithubToken(null);
  });

  afterEach(() => {
    if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
    else delete process.env.DATABASE_URL;

    if (originalGhToken !== undefined) process.env.GITHUB_TOKEN = originalGhToken;
    else delete process.env.GITHUB_TOKEN;

    if (originalAdminUser !== undefined) process.env.ADMIN_USERNAME = originalAdminUser;
    else delete process.env.ADMIN_USERNAME;
  });

  it('未配置 DATABASE_URL 时正确识别未启用状态并安全防御', async () => {
    expect(isPostgresConfigured()).toBe(false);
    expect(getPostgresPool()).toBeNull();

    const conn = await testNeonConnection();
    expect(conn.ok).toBe(false);
    expect(conn.error).toContain('未配置 DATABASE_URL');
  });

  it('有效检测 postgres:// 或 postgresql:// 协议', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@ep-test.neon.tech/neondb?sslmode=require';
    expect(isPostgresConfigured()).toBe(true);

    process.env.DATABASE_URL = 'mysql://user:pass@host/db';
    expect(isPostgresConfigured()).toBe(false);
  });

  it('支持为用户保存与读取专属搜索源与订阅配置 (userConfigs)', () => {
    const username = `test_user_${Date.now()}`;
    const initial = getUserSearchConfig(username);
    expect(initial).toBeNull();

    const saved = saveUserSearchConfig(username, {
      customSources: [{ key: 'src_1', name: '测试源', url: 'https://test.com/vod' }],
      selectedKeys: ['src_1'],
      subscriptions: [{ url: 'https://sub.com/json', name: '测试订阅' }],
    });

    expect(saved.username).toBe(username);
    expect(saved.selectedKeys).toEqual(['src_1']);
    expect(saved.customSources).toHaveLength(1);
    expect(saved.subscriptions).toHaveLength(1);

    const loaded = getUserSearchConfig(username);
    expect(loaded).toBeDefined();
    expect(loaded?.username).toBe(username);
    expect(loaded?.selectedKeys).toEqual(['src_1']);
  });

  it('冷备模块在未配置 GitHub Token 时返回明确防御错误而非异常崩溃', async () => {
    const exportRes = await exportNeonToGist();
    expect(exportRes.success).toBe(false);
    expect(exportRes.error).toContain('未配置 GITHUB_TOKEN');

    const restoreRes = await restoreGistToNeon();
    expect(restoreRes.success).toBe(false);
    expect(restoreRes.error).toContain('未配置 GITHUB_TOKEN');

    const status = getGistBackupStatus();
    expect(status.enabled).toBe(false);
  });

  it('存储层诊断体检准确输出主库与冷备解耦状态', () => {
    const diag = getStorageDiagnostics();
    expect(diag.database).toBeDefined();
    expect(diag.database.type).toBe('local_json_fallback');
    expect(diag.database.configured).toBe(false);
    expect(diag.gist).toBeDefined();
  });

  it('超级管理员支持 ADMIN_USERNAME 自定义指定与绝对物理防封禁保护', () => {
    expect(getSuperAdminUsername()).toBe('admin');

    process.env.ADMIN_USERNAME = 'RootMaster';
    expect(getSuperAdminUsername()).toBe('rootmaster');

    // 严禁封禁超级管理员
    const banResult = banUser('rootmaster');
    expect(banResult).toBe(false);

    const users = listUsers();
    const adminUser = users.find((u) => u.username === 'rootmaster' || u.username === 'admin');
    if (adminUser) {
      expect(typeof adminUser.isSuperAdmin).toBe('boolean');
    }
  });
});
