import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  bootstrapAndMergeGlobalSources,
  saveGlobalSourcesBackup,
  loadGlobalSourcesBackup,
  getGlobalSourcesBackupFilePath,
  getGlobalSourcesBackupStatus,
} from './auth-store';
import type { AuthDataStore } from './auth-store';

describe('Global Sources Backup and Merge', () => {
  const originalEnvSources = process.env.DEFAULT_SOURCES;
  const originalEnvLive = process.env.DEFAULT_LIVE_SOURCES;
  let testDataDir: string;
  let originalDataDir: string | undefined;

  beforeEach(() => {
    testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'libretv-backup-test-'));
    originalDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = testDataDir;
  });

  afterEach(() => {
    if (originalEnvSources !== undefined) process.env.DEFAULT_SOURCES = originalEnvSources;
    else delete process.env.DEFAULT_SOURCES;

    if (originalEnvLive !== undefined) process.env.DEFAULT_LIVE_SOURCES = originalEnvLive;
    else delete process.env.DEFAULT_LIVE_SOURCES;

    if (originalDataDir !== undefined) process.env.DATA_DIR = originalDataDir;
    else delete process.env.DATA_DIR;

    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('能够独立保存与读取物理备份文件', () => {
    const mockStore: AuthDataStore = {
      adminPasswordHash: 'hash',
      users: {},
      invites: {},
      globalSources: {
        s1: {
          key: 's1',
          name: '测试秒播',
          url: 'https://test-vod.com/api.php/provide/vod',
          type: 'vod',
          createdAt: Date.now(),
        },
      },
      updatedAt: Date.now(),
    };

    saveGlobalSourcesBackup(mockStore);

    const backupFile = getGlobalSourcesBackupFilePath();
    expect(fs.existsSync(backupFile)).toBe(true);

    const backupItems = loadGlobalSourcesBackup();
    expect(backupItems.length).toBe(1);
    expect(backupItems[0].name).toBe('测试秒播');

    const status = getGlobalSourcesBackupStatus();
    expect(status.exists).toBe(true);
    expect(status.count).toBe(1);
  });

  it('启动合并引擎：同时读取物理备份与环境变量并智能去重合并', () => {
    // 1. 先准备一个物理备份文件，模拟上一容器或跨部署数据
    const backupFile = getGlobalSourcesBackupFilePath();
    fs.writeFileSync(
      backupFile,
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        count: 1,
        sources: [
          {
            key: 'backup_custom_source',
            name: '历史自定义源',
            url: 'https://legacy-vod.com/api.php/provide/vod/',
            type: 'vod',
            createdAt: 1000,
          },
        ],
      }),
      'utf-8'
    );

    // 2. 设置环境变量 DEFAULT_SOURCES 与 DEFAULT_LIVE_SOURCES
    process.env.DEFAULT_SOURCES = JSON.stringify([
      {
        name: '环境变量点播源',
        url: 'https://env-vod.com/api.php/provide/vod',
      },
      // 重复的 URL（不同斜杠与大小写），应被去重
      {
        name: '历史自定义源重复项',
        url: 'https://LEGACY-vod.com/api.php/provide/vod',
      },
    ]);

    process.env.DEFAULT_LIVE_SOURCES = JSON.stringify([
      {
        name: '央视高清',
        url: 'https://live.example.com/cctv.m3u8',
      },
    ]);

    // 3. 执行启动合并
    const store: AuthDataStore = {
      adminPasswordHash: 'hash',
      users: {},
      invites: {},
      globalSources: {},
      updatedAt: Date.now(),
    };

    bootstrapAndMergeGlobalSources(store);

    const sources = Object.values(store.globalSources);
    const urls = sources.map((s) => s.url);

    // 验证包含历史备份源
    expect(urls.some((u) => u.includes('legacy-vod.com'))).toBe(true);
    // 验证包含环境变量源
    expect(urls.some((u) => u.includes('env-vod.com'))).toBe(true);
    expect(urls.some((u) => u.includes('live.example.com'))).toBe(true);

    // 验证去重：legacy-vod.com 只有 1 个实例
    const legacyCount = sources.filter((s) => s.url.toLowerCase().includes('legacy-vod.com')).length;
    expect(legacyCount).toBe(1);

    // 验证合并后自动同步更新了物理备份文件
    const updatedBackup = loadGlobalSourcesBackup();
    expect(updatedBackup.length).toBe(sources.length);
  });
});
