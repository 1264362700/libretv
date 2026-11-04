import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  atomicWriteJsonSync,
  saveUsersBackup,
  loadUsersBackup,
  saveGlobalSourcesBackup,
  loadGlobalSourcesBackup,
} from './auth-store';

describe('Storage Generational Snapshot & Circuit Breaker', () => {
  const tmpDir = path.join(os.tmpdir(), `libretv-test-resilience-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

  beforeEach(() => {
    process.env.DATA_DIR = tmpDir;
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
    delete process.env.DATA_DIR;
  });

  it('atomicWriteJsonSync 自动生成 .prev.json 世代物理快照', () => {
    const testFile = path.join(tmpDir, 'test-doc.json');
    const prevFile = `${testFile}.prev.json`;

    // 第一次写入
    atomicWriteJsonSync(testFile, { generation: 1, text: 'hello v1' });
    expect(fs.existsSync(testFile)).toBe(true);
    expect(fs.existsSync(prevFile)).toBe(false);

    // 第二次写入，前序文件应当自动被克隆为 .prev.json
    atomicWriteJsonSync(testFile, { generation: 2, text: 'hello v2' });
    expect(fs.existsSync(prevFile)).toBe(true);

    const prevContent = JSON.parse(fs.readFileSync(prevFile, 'utf-8'));
    expect(prevContent.generation).toBe(1);
    expect(prevContent.text).toBe('hello v1');

    const currContent = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
    expect(currContent.generation).toBe(2);
    expect(currContent.text).toBe('hello v2');
  });

  it('loadUsersBackup 在主备份被破坏或删除时自动从 .prev.json 世代快照还原', () => {
    const backupFile = path.join(tmpDir, 'users-backup.json');

    // 1. 模拟初次保存用户
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeV1: any = {
      users: {
        admin: { username: 'admin', passwordHash: 'hash1' },
        user1: { username: 'user1', passwordHash: 'hash2' },
      },
      invites: {
        'VIP-111': { code: 'VIP-111', active: true },
      },
    };
    saveUsersBackup(storeV1);

    // 2. 模拟第二次正常保存，生成 .prev.json
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeV2: any = {
      users: {
        admin: { username: 'admin', passwordHash: 'hash1' },
        user1: { username: 'user1', passwordHash: 'hash2' },
        user2: { username: 'user2', passwordHash: 'hash3' },
      },
      invites: {
        'VIP-111': { code: 'VIP-111', active: true },
        'VIP-222': { code: 'VIP-222', active: true },
      },
    };
    saveUsersBackup(storeV2);

    expect(fs.existsSync(`${backupFile}.prev.json`)).toBe(true);

    // 3. 模拟极端事故：主文件 users-backup.json 被人为截断损坏
    fs.writeFileSync(backupFile, '{ broken json ...', 'utf-8');

    // 4. 读取备份，应自动触发世代快照回退
    const restored = loadUsersBackup();
    expect(restored).not.toBeNull();
    expect(restored?.users.user1).toBeDefined();
    expect(restored?.invites['VIP-111']).toBeDefined();
  });

  it('saveUsersBackup 触发防空写熔断：内存中为0时不破坏已有有效物理备份', () => {
    const backupFile = path.join(tmpDir, 'users-backup.json');

    // 1. 存入有效用户数据
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validStore: any = {
      users: {
        user1: { username: 'user1', passwordHash: 'h' },
      },
      invites: {},
    };
    saveUsersBackup(validStore);
    expect(fs.existsSync(backupFile)).toBe(true);

    // 2. 模拟突发异常：空内存 store 被调用保存
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emptyStore: any = {
      users: {},
      invites: {},
    };
    saveUsersBackup(emptyStore);

    // 3. 验证熔断生效，物理文件依然保留有效用户数据
    const current = loadUsersBackup();
    expect(current).not.toBeNull();
    expect(current?.users.user1).toBeDefined();
  });

  it('loadGlobalSourcesBackup 支持从 .prev.json 恢复且具备防空写熔断', () => {
    const backupFile = path.join(tmpDir, 'global-sources-backup.json');

    // 1. 初次保存源
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeV1: any = {
      globalSources: {
        s1: { key: 's1', name: '源1', url: 'https://src1.com', type: 'vod' },
      },
    };
    saveGlobalSourcesBackup(storeV1);

    // 2. 二次保存
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeV2: any = {
      globalSources: {
        s1: { key: 's1', name: '源1', url: 'https://src1.com', type: 'vod' },
        s2: { key: 's2', name: '源2', url: 'https://src2.com', type: 'vod' },
      },
    };
    saveGlobalSourcesBackup(storeV2);

    expect(fs.existsSync(`${backupFile}.prev.json`)).toBe(true);

    // 3. 损坏主文件
    fs.writeFileSync(backupFile, '{ broken', 'utf-8');

    // 4. 自动回退
    const restored = loadGlobalSourcesBackup();
    expect(restored.length).toBeGreaterThan(0);
    expect(restored[0].name).toBe('源1');

    // 5. 空写熔断检验
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    saveGlobalSourcesBackup({ globalSources: {} } as any);
    const afterEmptyWrite = loadGlobalSourcesBackup();
    expect(afterEmptyWrite.length).toBeGreaterThan(0);
  });
});
