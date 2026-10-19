/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  saveUsersBackup,
  loadUsersBackup,
  getUsersBackupFilePath,
  bootstrapAndMergeUsers,
  exportFullBackup,
  importFullBackup,
  getStorageDiagnostics,
} from './auth-store';

describe('Users Backup and Recovery Engine', () => {
  let testDataDir: string;
  let originalDataDir: string | undefined;
  let originalPresetUsers: string | undefined;

  beforeEach(() => {
    testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'libretv-users-test-'));
    originalDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = testDataDir;
    originalPresetUsers = process.env.PRESET_USERS;
  });

  afterEach(() => {
    if (originalDataDir !== undefined) process.env.DATA_DIR = originalDataDir;
    else delete process.env.DATA_DIR;

    if (originalPresetUsers !== undefined) process.env.PRESET_USERS = originalPresetUsers;
    else delete process.env.PRESET_USERS;

    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('能独立持久化与读取用户及邀请码物理备份文件', () => {
    const mockStore: any = {
      users: {
        testuser: {
          id: 'u1',
          username: 'testuser',
          passwordHash: 'hash123',
          salt: 'salt123',
          role: 'user',
          status: 'active',
          sessionVersion: 1,
          createdAt: Date.now(),
        },
      },
      invites: {
        'LTV-TEST-8888': {
          code: 'LTV-TEST-8888',
          createdBy: 'admin',
          maxUses: 10,
          useCount: 1,
          usedBy: ['testuser'],
          active: true,
          createdAt: Date.now(),
        },
      },
      globalSources: {},
    };

    saveUsersBackup(mockStore);

    const backupFile = getUsersBackupFilePath();
    expect(fs.existsSync(backupFile)).toBe(true);

    const backupData = loadUsersBackup();
    expect(backupData).not.toBeNull();
    expect(backupData?.users['testuser']?.username).toBe('testuser');
    expect(backupData?.invites['LTV-TEST-8888']?.code).toBe('LTV-TEST-8888');
  });

  it('启动合并能从物理备份中自愈找回丢失的用户与邀请码', () => {
    // 模拟存量物理备份文件（在主 auth-store.json 丢失或新容器启动时）
    const backupFile = getUsersBackupFilePath();
    fs.writeFileSync(
      backupFile,
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        users: {
          vipuser: {
            id: 'vip-1',
            username: 'vipuser',
            passwordHash: 'viphop',
            salt: 'vipsalt',
            role: 'user',
            status: 'active',
            sessionVersion: 1,
            createdAt: 1000,
          },
        },
        invites: {
          'VIP-CODE-999': {
            code: 'VIP-CODE-999',
            createdBy: 'admin',
            maxUses: 5,
            useCount: 0,
            usedBy: [],
            active: true,
            createdAt: 1000,
          },
        },
      }),
      'utf-8'
    );

    // 全新或空的 store
    const emptyStore: any = {
      users: {},
      invites: {},
      globalSources: {},
    };

    bootstrapAndMergeUsers(emptyStore);

    expect(emptyStore.users['vipuser']).toBeDefined();
    expect(emptyStore.users['vipuser'].username).toBe('vipuser');
    expect(emptyStore.invites['VIP-CODE-999']).toBeDefined();
    expect(emptyStore.users['admin']).toBeDefined(); // 默认管理员也自动初始化
  });

  it('支持通过 PRESET_USERS 环境变量在冷启动时注入预置账号', () => {
    process.env.PRESET_USERS = 'preset_alice:AliceSecret123,preset_bob:BobSecret456';

    const emptyStore: any = {
      users: {},
      invites: {},
      globalSources: {},
    };

    bootstrapAndMergeUsers(emptyStore);

    expect(emptyStore.users['preset_alice']).toBeDefined();
    expect(emptyStore.users['preset_alice'].username).toBe('preset_alice');
    expect(emptyStore.users['preset_bob']).toBeDefined();
    expect(emptyStore.users['preset_bob'].username).toBe('preset_bob');
  });

  it('exportFullBackup 和 importFullBackup 能完成全量离线备份与灾备恢复', () => {
    const backup = exportFullBackup();
    expect(backup).toBeDefined();
    expect(backup.version).toBe(1);
    expect(backup.users).toBeDefined();
    expect(backup.invites).toBeDefined();
    expect(backup.meta.exportedAt).toBeGreaterThan(0);

    const testPayload = {
      version: 1,
      users: {
        offline_user: {
          id: 'off-1',
          username: 'offline_user',
          passwordHash: 'hash-off',
          salt: 'salt-off',
          role: 'user',
          status: 'active',
          sessionVersion: 1,
          createdAt: Date.now(),
        },
      },
      invites: {
        'OFFLINE-CODE': {
          code: 'OFFLINE-CODE',
          createdBy: 'admin',
          maxUses: 1,
          useCount: 0,
          usedBy: [],
          active: true,
          createdAt: Date.now(),
        },
      },
      globalSources: {
        'vod:https://test.com': {
          key: 'vod:https://test.com',
          name: '离线测试源',
          url: 'https://test.com',
          type: 'vod',
          createdAt: Date.now(),
        },
      },
    };

    const importRes = importFullBackup(testPayload);
    expect(importRes.success).toBe(true);
    expect(importRes.userCount).toBeGreaterThanOrEqual(1);

    const diag = getStorageDiagnostics();
    expect(diag.userCount).toBeGreaterThanOrEqual(2); // admin + offline_user
    expect(diag.inviteCount).toBeGreaterThanOrEqual(1);
    expect(diag.globalSourceCount).toBeGreaterThanOrEqual(1);

    // 非法数据安全防御
    const badRes1 = importFullBackup(null);
    expect(badRes1.success).toBe(false);

    const badRes2 = importFullBackup({ invalid: true });
    expect(badRes2.success).toBe(false);
  });
});
