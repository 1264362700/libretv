import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { getEnvSources } from './env-sources';
import { getEnvLiveSources } from './env-live-sources';
import {
  isPostgresConfigured,
  initPostgresSchema,
  fetchAllDataFromNeon,
  dbUpsertUser,
  dbUpdateSessionVersion,
  dbUpsertInvite,
  dbUpsertGlobalSource,
  dbDeleteGlobalSource,
  dbSaveUserConfig,
  restoreAllDataToNeon,
} from './db-postgres';
import {
  exportNeonToGist,
  restoreGistToNeon,
  getGistBackupStatus,
  setCustomGithubToken,
  getCustomGithubToken,
  testAndVerifyGithubToken,
  type GistBackupState,
} from './gist-backup';
import type {
  UserRecord,
  InviteCodeRecord,
  GlobalSourceRecord,
  UserConfigRecord,
  AuthDataStore,
  FullBackupPayload,
} from './auth-store-types';

export type {
  UserRecord,
  InviteCodeRecord,
  GlobalSourceRecord,
  UserConfigRecord,
  AuthDataStore,
  FullBackupPayload,
};

// 兼容别名
export type GistSyncState = GistBackupState;

let hasWarnedEphemeral = false;
let isEphemeralDir = false;

export function isStorageEphemeral(): boolean {
  return isEphemeralDir;
}

/** 原子安全写入 JSON 文件：写入临时文件后 rename，杜绝截断与损坏，并自动生成 .prev.json 世代快照容灾 */
export function atomicWriteJsonSync(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 1. 世代滚动快照：在写入前，若目标文件存在且非空（> 10 字节），自动克隆为 .prev.json 备份
  try {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.size > 10) {
        fs.copyFileSync(filePath, `${filePath}.prev.json`);
      }
    }
  } catch (err) {
    console.warn(`[LibreTV] 世代滚动快照备份提示 (${filePath}.prev.json):`, err);
  }

  // 2. 临时文件原子 rename 写入
  const tempFile = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempFile, filePath);
}

// 支持 DATA_DIR 环境变量并针对容器环境做权限容灾兜底
export function getDataDir(): string {
  const envDir = process.env.DATA_DIR?.trim();
  if (envDir) {
    try {
      if (!fs.existsSync(envDir)) {
        fs.mkdirSync(envDir, { recursive: true });
      }
      fs.accessSync(envDir, fs.constants.W_OK);
      isEphemeralDir = false;
      return envDir;
    } catch (e) {
      console.warn(`[LibreTV] DATA_DIR '${envDir}' 不可写，尝试工作区目录:`, e);
    }
  }

  const defaultDir = path.join(process.cwd(), 'data');
  try {
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    fs.accessSync(defaultDir, fs.constants.W_OK);
    isEphemeralDir = false;
    return defaultDir;
  } catch {
    isEphemeralDir = true;
    const tmpDir = path.join(os.tmpdir(), 'libretv-data');
    if (!hasWarnedEphemeral) {
      hasWarnedEphemeral = true;
      console.error(
        `\n================================================================================\n` +
        `[CRITICAL ALERT] 默认数据目录 '${defaultDir}' 权限不足 (EACCES)！\n` +
        `已平滑降级至临时易失目录: '${tmpDir}'\n` +
        `================================================================================\n`
      );
    }
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      return tmpDir;
    } catch {
      return os.tmpdir();
    }
  }
}

export function getStoreFilePath(): string {
  return path.join(getDataDir(), 'auth-store.json');
}

/** 顶级秒播蓝光 CMS 矩阵 + IPv4 高可用直播矩阵 */
const CURATED_DEFAULT_SOURCES: { key: string; name: string; url: string; type: 'vod' | 'live' }[] = [
  { key: 'curated_tyyszy', name: '天涯资源 (蓝光秒播·短剧专区)', url: 'https://tyyszyapi.com/api.php/provide/vod', type: 'vod' },
  { key: 'curated_lzzy', name: '量子资源 (蓝光秒开)', url: 'https://cj.lziapi.com/api.php/provide/vod', type: 'vod' },
  { key: 'curated_ffzy', name: '非凡资源 (极速秒播)', url: 'https://cj.ffzyapi.com/api.php/provide/vod', type: 'vod' },
  { key: 'curated_snzy', name: '索尼资源 (高清秒播)', url: 'https://suoniapi.com/api.php/provide/vod', type: 'vod' },
  { key: 'curated_gszy', name: '光速资源 (超低延迟)', url: 'https://api.guangsuapi.com/api.php/provide/vod', type: 'vod' },
  { key: 'curated_hnzy', name: '红牛资源 (综合大片)', url: 'https://www.hongniuzy2.com/api.php/provide/vod', type: 'vod' },
  { key: 'curated_yyzy', name: '丫丫资源 (日韩动漫)', url: 'https://cj.yayazy.net/api.php/provide/vod', type: 'vod' },
  { key: 'curated_jyzy', name: '金鹰资源 (院线热映)', url: 'https://jyzyapi.com/api.php/provide/vod', type: 'vod' },
  { key: 'curated_jszy', name: '极速资源 (海外综合)', url: 'https://jszyapi.com/api.php/provide/vod', type: 'vod' },
  { key: 'curated_hhzy', name: '豪华资源 (国内外热剧)', url: 'https://hhzyapi.com/api.php/provide/vod', type: 'vod' },
  { key: 'curated_hyzy', name: '虎牙资源 (精选大片)', url: 'https://www.huyaapi.com/api.php/provide/vod', type: 'vod' },
  { key: 'curated_yhzy', name: '樱花资源 (动漫番剧)', url: 'https://m3u8.apiyhzy.com/api.php/provide/vod', type: 'vod' },
  { key: 'curated_mdzy', name: '魔都资源 (热播大厅)', url: 'https://caiji.moduapi.cc/api.php/provide/vod', type: 'vod' },
  { key: 'curated_bdzy', name: '百度资源 (高速蓝光)', url: 'https://api.apibdzy.com/api.php/provide/vod', type: 'vod' },
  { key: 'curated_live_cctv', name: '央视高清合集 (CCTV 1-17 公网稳定)', url: 'https://iptv-org.github.io/iptv/countries/cn.m3u', type: 'live' },
  { key: 'curated_live_freetv', name: '国内电视精选 (央视+卫视综合)', url: 'https://cdn.jsdelivr.net/gh/Free-TV/IPTV@master/playlists/playlist_china.m3u8', type: 'live' },
  { key: 'curated_live_special', name: '央视特色与影视专线 (高画质)', url: 'https://m3u.ibert.me/o_s_cn_cctv.m3u', type: 'live' },
  { key: 'curated_live_hk', name: '港澳台精选专区 (TVB/美亚/凤凰)', url: 'https://iptv-org.github.io/iptv/subdivisions/cn-hk.m3u', type: 'live' },
  { key: 'curated_live_movies', name: '全球电影轮播频道', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u', type: 'live' },
  { key: 'curated_live_animation', name: '全球少儿动漫频道', url: 'https://iptv-org.github.io/iptv/categories/animation.m3u', type: 'live' },
];

let inMemoryStore: AuthDataStore | null = null;

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function generateRandomCode(prefix = 'LTV'): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 8; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${rand.slice(0, 4)}-${rand.slice(4)}`;
}

function normalizeSourceUrl(u: string): string {
  return (u || '').trim().toLowerCase().replace(/\/+$/, '');
}

export function getGlobalSourcesBackupFilePath(): string {
  return path.join(getDataDir(), 'global-sources-backup.json');
}

/** 将当前全局源持久化保存至独立物理备份文件（原子写入） */
export function saveGlobalSourcesBackup(store: AuthDataStore): void {
  try {
    const backupFile = getGlobalSourcesBackupFilePath();
    const sourcesList = Object.values(store.globalSources || {});

    if (sourcesList.length === 0) {
      const existing = loadGlobalSourcesBackup();
      if (existing.length > 0) {
        console.warn('[LibreTV] 触发全局源防空写熔断：内存源为空，保留磁盘已有有效备份');
        return;
      }
    }

    atomicWriteJsonSync(backupFile, {
      version: 1,
      updatedAt: Date.now(),
      count: sourcesList.length,
      sources: sourcesList,
    });
  } catch (err) {
    console.warn('[LibreTV] 全局源管理备份写入异常:', err);
  }
}

export function getUsersBackupFilePath(): string {
  return path.join(getDataDir(), 'users-backup.json');
}

/** 将用户与邀请码持久化保存至独立物理备份文件（原子写入） */
export function saveUsersBackup(store: AuthDataStore): void {
  try {
    const backupFile = getUsersBackupFilePath();
    const currentUsersCount = Object.keys(store.users || {}).length;
    const currentInvitesCount = Object.keys(store.invites || {}).length;

    if (currentUsersCount === 0 && currentInvitesCount === 0) {
      const existing = loadUsersBackup();
      if (existing && (Object.keys(existing.users).length > 0 || Object.keys(existing.invites).length > 0)) {
        console.warn('[LibreTV] 触发用户备份防空写熔断：内存用户数为0，保留磁盘已有有效备份');
        return;
      }
    }

    atomicWriteJsonSync(backupFile, {
      version: 1,
      updatedAt: Date.now(),
      usersCount: currentUsersCount,
      invitesCount: currentInvitesCount,
      users: store.users || {},
      invites: store.invites || {},
    });
  } catch (err) {
    console.warn('[LibreTV] 用户数据独立物理备份写入异常:', err);
  }
}

/** 读取独立物理备份中的用户与邀请码数据（支持世代快照回退） */
export function loadUsersBackup(): {
  users: Record<string, UserRecord>;
  invites: Record<string, InviteCodeRecord>;
} | null {
  const tryFiles = [
    getUsersBackupFilePath(),
    `${getUsersBackupFilePath()}.prev.json`,
  ];
  for (const backupFile of tryFiles) {
    try {
      if (!fs.existsSync(backupFile)) continue;
      const content = fs.readFileSync(backupFile, 'utf-8');
      if (!content || content.trim().length <= 5) continue;
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        const users =
          parsed.users && typeof parsed.users === 'object' && !Array.isArray(parsed.users)
            ? parsed.users
            : {};
        const invites =
          parsed.invites && typeof parsed.invites === 'object' && !Array.isArray(parsed.invites)
            ? parsed.invites
            : {};
        if (Object.keys(users).length > 0 || Object.keys(invites).length > 0) {
          return { users, invites };
        }
      }
    } catch (err) {
      console.warn(`[LibreTV] 用户数据独立物理备份读取异常 (${backupFile}):`, err);
    }
  }
  return null;
}

export function loadGlobalSourcesBackup(): GlobalSourceRecord[] {
  const tryFiles = [
    getGlobalSourcesBackupFilePath(),
    `${getGlobalSourcesBackupFilePath()}.prev.json`,
  ];
  for (const backupFile of tryFiles) {
    try {
      if (!fs.existsSync(backupFile)) continue;
      const content = fs.readFileSync(backupFile, 'utf-8');
      if (!content || content.trim().length <= 5) continue;
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.sources) && parsed.sources.length > 0) {
        return parsed.sources as GlobalSourceRecord[];
      }
    } catch (err) {
      console.warn(`[LibreTV] 全局源物理备份读取异常 (${backupFile}):`, err);
    }
  }
  return [];
}

/** 环境变量预置账号注入支持 */
function bootstrapPresetUsers(store: AuthDataStore): void {
  const envPreset = process.env.PRESET_USERS?.trim();
  if (!envPreset) return;

  try {
    if (envPreset.startsWith('[') && envPreset.endsWith(']')) {
      const parsed = JSON.parse(envPreset) as Array<{ username?: string; password?: string; role?: string }>;
      for (const item of parsed) {
        if (!item.username || !item.password) continue;
        const uname = item.username.toLowerCase().trim();
        if (!store.users[uname]) {
          const salt = crypto.randomBytes(32).toString('hex');
          store.users[uname] = {
            id: crypto.randomUUID(),
            username: uname,
            passwordHash: hashPassword(item.password, salt),
            salt,
            role: item.role === 'admin' ? 'admin' : 'user',
            status: 'active',
            sessionVersion: 1,
            createdAt: Date.now(),
            lastLoginAt: Date.now(),
          };
        }
      }
      return;
    }

    const pairs = envPreset.split(',').map((p) => p.trim()).filter(Boolean);
    for (const pair of pairs) {
      const idx = pair.indexOf(':');
      if (idx > 0) {
        const uname = pair.slice(0, idx).toLowerCase().trim();
        const pwd = pair.slice(idx + 1).trim();
        if (uname && pwd && !store.users[uname]) {
          const salt = crypto.randomBytes(32).toString('hex');
          store.users[uname] = {
            id: crypto.randomUUID(),
            username: uname,
            passwordHash: hashPassword(pwd, salt),
            salt,
            role: uname === 'admin' ? 'admin' : 'user',
            status: 'active',
            sessionVersion: 1,
            createdAt: Date.now(),
            lastLoginAt: Date.now(),
          };
        }
      }
    }
  } catch (err) {
    console.warn('[LibreTV] PRESET_USERS 解析失败:', err);
  }
}

/** 用户与邀请码数据多源智能合并 */
export function bootstrapAndMergeUsers(store: AuthDataStore): void {
  if (!store.users) store.users = {};
  if (!store.invites) store.invites = {};

  const physicalBackup = loadUsersBackup();
  if (physicalBackup) {
    for (const [uname, u] of Object.entries(physicalBackup.users)) {
      if (!store.users[uname] && u && u.username) {
        store.users[uname] = u;
      }
    }
    for (const [code, inv] of Object.entries(physicalBackup.invites)) {
      if (!store.invites[code] && inv && inv.code) {
        store.invites[code] = inv;
      }
    }
  }

  bootstrapAdmin(store);
  bootstrapPresetUsers(store);
  bootstrapSeedInvites(store);
  saveUsersBackup(store);
}

/** 全局源多源智能合并 */
export function bootstrapAndMergeGlobalSources(store: AuthDataStore): void {
  if (!store.globalSources) store.globalSources = {};

  const existingMap = new Map<string, string>();
  for (const s of Object.values(store.globalSources)) {
    existingMap.set(normalizeSourceUrl(s.url), s.key);
  }

  const backupSources = loadGlobalSourcesBackup();
  for (const b of backupSources) {
    const norm = normalizeSourceUrl(b.url);
    if (!existingMap.has(norm) && !store.globalSources[b.key]) {
      store.globalSources[b.key] = b;
      existingMap.set(norm, b.key);
    }
  }

  const envVods = getEnvSources();
  for (const envSrc of envVods) {
    const norm = normalizeSourceUrl(envSrc.url);
    if (!existingMap.has(norm)) {
      const rec: GlobalSourceRecord = {
        key: envSrc.key,
        name: envSrc.name,
        url: envSrc.url,
        type: 'vod',
        createdAt: Date.now(),
      };
      store.globalSources[rec.key] = rec;
      existingMap.set(norm, rec.key);
    }
  }

  const envLives = getEnvLiveSources();
  for (const liveSrc of envLives) {
    const norm = normalizeSourceUrl(liveSrc.url);
    if (!existingMap.has(norm)) {
      const rec: GlobalSourceRecord = {
        key: liveSrc.key,
        name: liveSrc.name,
        url: liveSrc.url,
        type: 'live',
        createdAt: Date.now(),
      };
      store.globalSources[rec.key] = rec;
      existingMap.set(norm, rec.key);
    }
  }

  for (const src of CURATED_DEFAULT_SOURCES) {
    const norm = normalizeSourceUrl(src.url);
    if (!existingMap.has(norm) && !store.globalSources[src.key]) {
      const rec: GlobalSourceRecord = {
        key: src.key,
        name: src.name,
        url: src.url,
        type: src.type,
        createdAt: Date.now(),
      };
      store.globalSources[src.key] = rec;
      existingMap.set(norm, src.key);
    }
  }

  saveGlobalSourcesBackup(store);
}

// —— Neon PostgreSQL 与 Gist 容灾状态加载 ——

let isNeonLoaded = false;
let neonLoadingPromise: Promise<void> | null = null;

/** 确保 Neon PostgreSQL 主库完成连接与数据同步 */
export async function ensurePostgresLoaded(): Promise<void> {
  if (!isPostgresConfigured()) {
    loadStore();
    return;
  }
  if (isNeonLoaded) return;
  if (neonLoadingPromise) return neonLoadingPromise;

  neonLoadingPromise = (async () => {
    try {
      await initPostgresSchema();
      const neonData = await fetchAllDataFromNeon();
      if (!inMemoryStore) {
        inMemoryStore = { users: {}, invites: {}, globalSources: {}, userConfigs: {} };
      }
      if (neonData) {
        if (neonData.users && Object.keys(neonData.users).length > 0) {
          inMemoryStore.users = { ...inMemoryStore.users, ...neonData.users };
        }
        if (neonData.invites && Object.keys(neonData.invites).length > 0) {
          inMemoryStore.invites = { ...inMemoryStore.invites, ...neonData.invites };
        }
        if (neonData.globalSources && Object.keys(neonData.globalSources).length > 0) {
          inMemoryStore.globalSources = { ...inMemoryStore.globalSources, ...neonData.globalSources };
        }
        if (neonData.userConfigs && Object.keys(neonData.userConfigs).length > 0) {
          inMemoryStore.userConfigs = { ...inMemoryStore.userConfigs, ...neonData.userConfigs };
        }
      }

      // 启动自愈合并
      bootstrapAndMergeUsers(inMemoryStore);
      bootstrapAndMergeGlobalSources(inMemoryStore);

      // 若 Neon 表中缺失数据（如首次连接新库），幂等写回初始数据
      for (const u of Object.values(inMemoryStore.users)) {
        if (!neonData?.users[u.username]) {
          dbUpsertUser(u).catch(() => {});
        }
      }
      for (const inv of Object.values(inMemoryStore.invites)) {
        if (!neonData?.invites[inv.code]) {
          dbUpsertInvite(inv).catch(() => {});
        }
      }
      for (const s of Object.values(inMemoryStore.globalSources)) {
        if (!neonData?.globalSources[s.key]) {
          dbUpsertGlobalSource(s).catch(() => {});
        }
      }

      // 双保险物理备份
      const storeFile = getStoreFilePath();
      atomicWriteJsonSync(storeFile, inMemoryStore);
      saveUsersBackup(inMemoryStore);
      saveGlobalSourcesBackup(inMemoryStore);
      console.log(`[Neon PostgreSQL] 成功加载主库数据（用户: ${Object.keys(inMemoryStore.users).length}, 全局源: ${Object.keys(inMemoryStore.globalSources).length}）`);
    } catch (err) {
      console.error('[Neon PostgreSQL] 主库加载异常，已平滑回退至本地存储:', err);
      loadStore();
    } finally {
      isNeonLoaded = true;
      neonLoadingPromise = null;
    }
  })();

  return neonLoadingPromise;
}

/** 兼容性生命周期入口：确保主数据加载完毕 */
export async function ensureGistLoaded(): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePostgresLoaded();
  } else {
    loadStore();
  }
}

/** 手动导出冷备至 GitHub Gist */
export async function manualSyncGist(): Promise<{
  success: boolean;
  error?: string;
  gistId?: string;
  gistUrl?: string;
  stats?: GistBackupState['stats'];
  state: GistBackupState;
}> {
  const store = loadStore();
  const res = await exportNeonToGist(store);
  return { ...res, state: getGistBackupStatus() };
}

/** 手动从 GitHub Gist 容灾恢复回 Neon 主库 */
export async function manualPullGist(): Promise<{
  success: boolean;
  error?: string;
  restoredStats?: { users: number; invites: number; sources: number; userConfigs: number };
  gistUrl?: string;
  state: GistBackupState;
}> {
  const res = await restoreGistToNeon();
  if (res.success) {
    isNeonLoaded = false;
    await ensurePostgresLoaded();
  }
  return { ...res, state: getGistBackupStatus() };
}

export function getGistStatus(): GistBackupState {
  return getGistBackupStatus();
}

// 服务端自动拉起 Neon 初始化探针
if (typeof window === 'undefined' && isPostgresConfigured()) {
  setTimeout(() => {
    ensurePostgresLoaded().catch(() => {});
  }, 50);
}

function loadStore(): AuthDataStore {
  if (inMemoryStore) {
    bootstrapAdmin(inMemoryStore);
    return inMemoryStore;
  }

  const storeFile = getStoreFilePath();
  const prevStoreFile = `${storeFile}.prev.json`;

  let loaded: AuthDataStore | null = null;

  if (fs.existsSync(storeFile)) {
    try {
      const content = fs.readFileSync(storeFile, 'utf-8');
      if (content && content.trim().length > 10) {
        loaded = JSON.parse(content) as AuthDataStore;
      }
    } catch (err) {
      console.warn('[LibreTV] auth-store.json 解析异常，触发世代滚动快照自愈:', err);
    }
  }

  if (!loaded && fs.existsSync(prevStoreFile)) {
    try {
      const prevContent = fs.readFileSync(prevStoreFile, 'utf-8');
      if (prevContent && prevContent.trim().length > 10) {
        loaded = JSON.parse(prevContent) as AuthDataStore;
        console.log('[LibreTV] 成功从 auth-store.json.prev.json 世代快照还原数据');
      }
    } catch (err) {
      console.warn('[LibreTV] auth-store.json.prev.json 解析异常:', err);
    }
  }

  inMemoryStore = loaded || { users: {}, invites: {}, globalSources: {}, userConfigs: {} };

  if (inMemoryStore.systemConfig?.githubToken) {
    setCustomGithubToken(inMemoryStore.systemConfig.githubToken);
  }

  if (!inMemoryStore.globalSources) inMemoryStore.globalSources = {};
  if (!inMemoryStore.invites) inMemoryStore.invites = {};
  if (!inMemoryStore.users) inMemoryStore.users = {};
  if (!inMemoryStore.userConfigs) inMemoryStore.userConfigs = {};

  bootstrapAndMergeUsers(inMemoryStore);
  bootstrapAndMergeGlobalSources(inMemoryStore);

  saveStore(inMemoryStore);
  return inMemoryStore;
}

function saveStore(store: AuthDataStore): void {
  try {
    const existingBackup = loadUsersBackup();
    if (existingBackup) {
      for (const [uname, u] of Object.entries(existingBackup.users)) {
        if (!store.users[uname] && u && u.username) {
          store.users[uname] = u;
        }
      }
      for (const [code, inv] of Object.entries(existingBackup.invites)) {
        if (!store.invites[code] && inv && inv.code) {
          store.invites[code] = inv;
        }
      }
    }

    const storeFile = getStoreFilePath();
    atomicWriteJsonSync(storeFile, store);
    saveUsersBackup(store);
    saveGlobalSourcesBackup(store);
  } catch (err) {
    console.error('Failed to save auth-store.json:', err);
  }
}

export function getSuperAdminUsername(): string {
  const envName = process.env.ADMIN_USERNAME?.trim() || process.env.SUPERADMIN_USERNAME?.trim();
  return (envName || 'admin').toLowerCase();
}

export function isUsingDefaultPassword(): boolean {
  const store = loadStore();
  const adminUname = getSuperAdminUsername();
  const user = store.users[adminUname];
  if (!user) return false;
  return hashPassword('admin888', user.salt) === user.passwordHash;
}

function bootstrapAdmin(store: AuthDataStore) {
  const adminUsername = getSuperAdminUsername();
  const envPassword = process.env.ADMIN_PASSWORD || process.env.PASSWORD;
  const defaultPassword = envPassword || 'admin888';

  if (!store.users[adminUsername]) {
    const salt = crypto.randomBytes(32).toString('hex');
    store.users[adminUsername] = {
      id: crypto.randomUUID(),
      username: adminUsername,
      passwordHash: hashPassword(defaultPassword, salt),
      salt,
      role: 'admin',
      status: 'active',
      sessionVersion: 1,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    };
    if (isPostgresConfigured()) {
      dbUpsertUser(store.users[adminUsername]).catch(() => {});
    }
  } else if (envPassword && hashPassword(envPassword, store.users[adminUsername].salt) !== store.users[adminUsername].passwordHash) {
    // 若环境变量显式配置了 ADMIN_PASSWORD 或 PASSWORD 且发生变更，平滑同步管理员密码
    const salt = crypto.randomBytes(32).toString('hex');
    store.users[adminUsername].salt = salt;
    store.users[adminUsername].passwordHash = hashPassword(envPassword, salt);
    store.users[adminUsername].sessionVersion = (store.users[adminUsername].sessionVersion || 1) + 1;
    if (isPostgresConfigured()) {
      dbUpsertUser(store.users[adminUsername]).catch(() => {});
    }
  }
}

function bootstrapSeedInvites(store: AuthDataStore) {
  const envCodes = process.env.INITIAL_INVITE_CODES?.split(',').map((c) => c.trim()).filter(Boolean) || [];
  for (const code of envCodes) {
    if (!store.invites[code]) {
      store.invites[code] = {
        code,
        createdBy: 'system',
        maxUses: 9999,
        useCount: 0,
        usedBy: [],
        active: true,
        createdAt: Date.now(),
      };
    }
  }
}

// —— 外部公开方法（日常读写全面对接 Neon PostgreSQL） ——

export function getUser(username: string): UserRecord | undefined {
  const store = loadStore();
  return store.users[username.toLowerCase().trim()];
}

export function listUsers(): (Omit<UserRecord, 'passwordHash' | 'salt'> & { isSuperAdmin: boolean })[] {
  const store = loadStore();
  const superAdmin = getSuperAdminUsername();
  return Object.values(store.users).map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    sessionVersion: u.sessionVersion,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    isSuperAdmin: u.username.toLowerCase() === superAdmin,
  }));
}

export function verifyUserCredentials(username: string, password: string): {
  success: boolean;
  user?: UserRecord;
  error?: string;
  code?: 'USER_NOT_FOUND' | 'PASSWORD_WRONG' | 'USER_BANNED';
} {
  const store = loadStore();
  const uname = username.toLowerCase().trim();
  const user = store.users[uname];

  if (!user) {
    return { success: false, error: '账号不存在', code: 'USER_NOT_FOUND' };
  }

  if (user.status === 'banned') {
    return { success: false, error: '账号已被封禁', code: 'USER_BANNED' };
  }

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return { success: false, error: '密码错误', code: 'PASSWORD_WRONG' };
  }

  user.lastLoginAt = Date.now();
  user.sessionVersion += 1;
  saveStore(store);

  if (isPostgresConfigured()) {
    dbUpsertUser(user).catch((e) => console.error('[Neon] 登录更新异常:', e));
  }

  return { success: true, user };
}

export function registerWithInvite(username: string, password: string, inviteCode: string): {
  success: boolean;
  user?: UserRecord;
  error?: string;
} {
  const store = loadStore();
  const uname = username.toLowerCase().trim();
  const codeStr = inviteCode.trim();

  if (!uname || uname.length < 3 || uname.length > 20) {
    return { success: false, error: '用户名需为 3-20 位字符' };
  }
  if (!password || password.length < 6) {
    return { success: false, error: '密码长度至少需 6 位' };
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(uname)) {
    return { success: false, error: '用户名仅支持中英文、数字与下划线' };
  }

  if (store.users[uname]) {
    return { success: false, error: '该用户名已被注册' };
  }

  const invite = store.invites[codeStr];
  if (!invite || !invite.active) {
    return { success: false, error: '无效或已作废的邀请码' };
  }

  if (invite.useCount >= invite.maxUses) {
    return { success: false, error: '该邀请码已被使用完毕' };
  }

  invite.useCount += 1;
  invite.usedBy.push(uname);
  if (invite.useCount >= invite.maxUses) {
    invite.active = false;
  }

  const salt = crypto.randomBytes(32).toString('hex');
  const newUser: UserRecord = {
    id: crypto.randomUUID(),
    username: uname,
    passwordHash: hashPassword(password, salt),
    salt,
    role: 'user',
    status: 'active',
    sessionVersion: 1,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  };

  store.users[uname] = newUser;
  saveStore(store);

  if (isPostgresConfigured()) {
    dbUpsertUser(newUser).catch((e) => console.error('[Neon] 新用户写入异常:', e));
    dbUpsertInvite(invite).catch((e) => console.error('[Neon] 邀请码核销异常:', e));
  }

  return { success: true, user: newUser };
}

export function createInviteCodes(options: {
  count?: number;
  maxUses?: number;
  createdBy?: string;
  prefix?: string;
}): InviteCodeRecord[] {
  const store = loadStore();
  const count = Math.min(50, Math.max(1, options.count || 1));
  const maxUses = Math.max(1, options.maxUses || 1);
  const createdBy = options.createdBy || 'admin';
  const prefix = options.prefix || 'LTV';

  const newCodes: InviteCodeRecord[] = [];
  for (let i = 0; i < count; i++) {
    let code = generateRandomCode(prefix);
    while (store.invites[code]) {
      code = generateRandomCode(prefix);
    }
    const record: InviteCodeRecord = {
      code,
      createdBy,
      maxUses,
      useCount: 0,
      usedBy: [],
      active: true,
      createdAt: Date.now(),
    };
    store.invites[code] = record;
    newCodes.push(record);

    if (isPostgresConfigured()) {
      dbUpsertInvite(record).catch((e) => console.error('[Neon] 邀请码新增写入异常:', e));
    }
  }

  saveStore(store);
  return newCodes;
}

export function listInviteCodes(): InviteCodeRecord[] {
  const store = loadStore();
  return Object.values(store.invites).sort((a, b) => b.createdAt - a.createdAt);
}

export function revokeInviteCode(code: string): boolean {
  const store = loadStore();
  if (store.invites[code]) {
    store.invites[code].active = false;
    saveStore(store);
    if (isPostgresConfigured()) {
      dbUpsertInvite(store.invites[code]).catch((e) => console.error('[Neon] 邀请码废除异常:', e));
    }
    return true;
  }
  return false;
}

export function banUser(username: string): boolean {
  const store = loadStore();
  const uname = username.toLowerCase().trim();
  const superAdmin = getSuperAdminUsername();
  if (uname === superAdmin) return false;
  const user = store.users[uname];
  if (user && user.role !== 'admin') {
    user.status = 'banned';
    user.sessionVersion += 1;
    saveStore(store);
    if (isPostgresConfigured()) {
      dbUpsertUser(user).catch((e) => console.error('[Neon] 封禁用户写入异常:', e));
    }
    return true;
  }
  return false;
}

export function unbanUser(username: string): boolean {
  const store = loadStore();
  const uname = username.toLowerCase().trim();
  const user = store.users[uname];
  if (user) {
    user.status = 'active';
    saveStore(store);
    if (isPostgresConfigured()) {
      dbUpsertUser(user).catch((e) => console.error('[Neon] 解封用户写入异常:', e));
    }
    return true;
  }
  return false;
}

export function kickUser(username: string): boolean {
  const store = loadStore();
  const uname = username.toLowerCase().trim();
  const user = store.users[uname];
  if (user) {
    user.sessionVersion += 1;
    saveStore(store);
    if (isPostgresConfigured()) {
      dbUpdateSessionVersion(user.username, user.sessionVersion).catch((e) => console.error('[Neon] 踢出用户异常:', e));
    }
    return true;
  }
  return false;
}

export function resetUserPassword(username: string, newPassword: string): boolean {
  const store = loadStore();
  const uname = username.toLowerCase().trim();
  const user = store.users[uname];
  if (user && newPassword && newPassword.length >= 6) {
    user.salt = crypto.randomBytes(32).toString('hex');
    user.passwordHash = hashPassword(newPassword, user.salt);
    user.sessionVersion += 1;
    saveStore(store);
    if (isPostgresConfigured()) {
      dbUpsertUser(user).catch((e) => console.error('[Neon] 重置密码写入异常:', e));
    }
    return true;
  }
  return false;
}

// —— 全局源管理 ——

export function listGlobalSources(): GlobalSourceRecord[] {
  const store = loadStore();
  return Object.values(store.globalSources);
}

export function addGlobalSource(source: { name: string; url: string; type: 'vod' | 'live' }): GlobalSourceRecord {
  const store = loadStore();
  const key = `global_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const record: GlobalSourceRecord = {
    key,
    name: source.name.trim(),
    url: source.url.trim(),
    type: source.type,
    createdAt: Date.now(),
  };
  store.globalSources[key] = record;
  saveStore(store);
  saveGlobalSourcesBackup(store);

  if (isPostgresConfigured()) {
    dbUpsertGlobalSource(record).catch((e) => console.error('[Neon] 全局源写入异常:', e));
  }

  return record;
}

export function removeGlobalSource(key: string): boolean {
  const store = loadStore();
  if (store.globalSources[key]) {
    delete store.globalSources[key];
    saveStore(store);
    saveGlobalSourcesBackup(store);
    if (isPostgresConfigured()) {
      dbDeleteGlobalSource(key).catch((e) => console.error('[Neon] 全局源删除异常:', e));
    }
    return true;
  }
  return false;
}

export function getGlobalSourcesBackupStatus(): { exists: boolean; path: string; count: number; updatedAt?: number } {
  try {
    const backupFile = getGlobalSourcesBackupFilePath();
    if (!fs.existsSync(backupFile)) {
      return { exists: false, path: backupFile, count: 0 };
    }
    const content = fs.readFileSync(backupFile, 'utf-8');
    const parsed = JSON.parse(content);
    const count = Array.isArray(parsed) ? parsed.length : (parsed?.count ?? (Array.isArray(parsed?.sources) ? parsed.sources.length : 0));
    return {
      exists: true,
      path: backupFile,
      count,
      updatedAt: parsed?.updatedAt,
    };
  } catch {
    return { exists: false, path: getGlobalSourcesBackupFilePath(), count: 0 };
  }
}

export function manualBackupGlobalSources(): { success: boolean; count: number; path: string } {
  const store = loadStore();
  saveGlobalSourcesBackup(store);
  const status = getGlobalSourcesBackupStatus();
  return { success: true, count: status.count, path: status.path };
}

export function manualRestoreGlobalSources(): { success: boolean; count: number } {
  const store = loadStore();
  bootstrapAndMergeGlobalSources(store);
  saveStore(store);
  const sources = Object.values(store.globalSources || {});
  return { success: true, count: sources.length };
}

/** 跨重启会话版本平滑对齐 */
export function syncUserSessionVersion(username: string, sessionVersion: number): void {
  const store = loadStore();
  const uname = username.toLowerCase().trim();
  const user = store.users[uname];
  if (user && sessionVersion > user.sessionVersion) {
    user.sessionVersion = sessionVersion;
    saveStore(store);
    if (isPostgresConfigured()) {
      dbUpdateSessionVersion(user.username, sessionVersion).catch(() => {});
    }
  }
}

/** 跨重启合法签名用户会话平滑恢复 */
export function restoreUserSession(
  username: string,
  role: 'admin' | 'user',
  sessionVersion: number
): UserRecord {
  const store = loadStore();
  const uname = username.toLowerCase().trim();
  if (store.users[uname]) {
    if (sessionVersion > store.users[uname].sessionVersion) {
      store.users[uname].sessionVersion = sessionVersion;
      saveStore(store);
      if (isPostgresConfigured()) {
        dbUpdateSessionVersion(store.users[uname].username, sessionVersion).catch(() => {});
      }
    }
    return store.users[uname];
  }

  const salt = crypto.randomBytes(32).toString('hex');
  const record: UserRecord = {
    id: crypto.randomUUID(),
    username: uname,
    passwordHash: '',
    salt,
    role,
    status: 'active',
    sessionVersion,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  };
  store.users[uname] = record;
  saveStore(store);

  if (isPostgresConfigured()) {
    dbUpsertUser(record).catch(() => {});
  }
  return record;
}

// —— 用户专属搜索源与订阅配置支持 ——

export function getUserSearchConfig(username: string): UserConfigRecord | null {
  const store = loadStore();
  const uname = username.toLowerCase().trim();
  return store.userConfigs?.[uname] || null;
}

export function saveUserSearchConfig(
  username: string,
  config: { customSources?: unknown[]; selectedKeys?: string[]; subscriptions?: unknown[] }
): UserConfigRecord {
  const store = loadStore();
  const uname = username.toLowerCase().trim();
  if (!store.userConfigs) store.userConfigs = {};

  const existing = store.userConfigs[uname] || {
    username: uname,
    customSources: [],
    selectedKeys: [],
    subscriptions: [],
    updatedAt: 0,
  };

  const updated: UserConfigRecord = {
    username: uname,
    customSources: config.customSources !== undefined ? config.customSources : existing.customSources,
    selectedKeys: config.selectedKeys !== undefined ? config.selectedKeys : existing.selectedKeys,
    subscriptions: config.subscriptions !== undefined ? config.subscriptions : existing.subscriptions,
    updatedAt: Date.now(),
  };

  store.userConfigs[uname] = updated;
  saveStore(store);

  if (isPostgresConfigured()) {
    dbSaveUserConfig(uname, updated).catch((e) => console.error('[Neon] 用户源配置保存异常:', e));
  }

  return updated;
}

export async function saveUserSearchConfigAsync(
  username: string,
  config: { customSources?: unknown[]; selectedKeys?: string[]; subscriptions?: unknown[] }
): Promise<UserConfigRecord> {
  const updated = saveUserSearchConfig(username, config);
  if (isPostgresConfigured()) {
    try {
      await dbSaveUserConfig(username.toLowerCase().trim(), updated);
    } catch (e) {
      console.error('[Neon] 用户源配置异步保存异常:', e);
    }
  }
  return updated;
}

/** 将本地全部数据（用户、邀请码、全局源、用户配置）一次性全量推送到 Neon 主库 */
export async function pushAllLocalDataToNeon(): Promise<{
  success: boolean;
  error?: string;
  stats: { users: number; invites: number; sources: number; userConfigs: number };
}> {
  const store = loadStore();
  const res = await restoreAllDataToNeon({
    users: store.users,
    invites: store.invites,
    globalSources: store.globalSources,
    userConfigs: store.userConfigs,
  });
  return res;
}

/** 保存并绑定自定义 GitHub Token */
export async function saveCustomGithubToken(token: string): Promise<{
  success: boolean;
  error?: string;
  username?: string;
  gistState: GistBackupState;
}> {
  const clean = token.trim();
  const test = await testAndVerifyGithubToken(clean);
  if (!test.ok) {
    return { success: false, error: test.error, gistState: getGistStatus() };
  }

  setCustomGithubToken(clean);
  const store = loadStore();
  if (!store.systemConfig) store.systemConfig = {};
  store.systemConfig.githubToken = clean;
  store.systemConfig.updatedAt = Date.now();
  saveStore(store);

  return {
    success: true,
    username: test.username,
    gistState: getGistStatus(),
  };
}

/** 导出全量数据备份（供管理员离线下载） */
export function exportFullBackup(): FullBackupPayload {
  const store = loadStore();
  const now = Date.now();
  return {
    version: 1,
    exportedAt: now,
    meta: {
      exportedAt: now,
      usersCount: Object.keys(store.users || {}).length,
      invitesCount: Object.keys(store.invites || {}).length,
      sourcesCount: Object.keys(store.globalSources || {}).length,
    },
    users: store.users || {},
    invites: store.invites || {},
    globalSources: store.globalSources || {},
    userConfigs: store.userConfigs || {},
  };
}

/** 导入全量数据备份（离线恢复/灾难重建） */
export function importFullBackup(payload: unknown): {
  success: boolean;
  userCount: number;
  inviteCount: number;
  sourceCount: number;
  importedUsers: number;
  importedInvites: number;
  importedSources: number;
  error?: string;
} {
  if (!payload || typeof payload !== 'object') {
    return {
      success: false,
      userCount: 0,
      inviteCount: 0,
      sourceCount: 0,
      importedUsers: 0,
      importedInvites: 0,
      importedSources: 0,
      error: '无效的备份数据结构',
    };
  }

  const data = payload as {
    users?: Record<string, UserRecord>;
    invites?: Record<string, InviteCodeRecord>;
    globalSources?: Record<string, GlobalSourceRecord>;
    userConfigs?: Record<string, UserConfigRecord>;
  };

  if (!data.users && !data.invites && !data.globalSources) {
    return {
      success: false,
      userCount: 0,
      inviteCount: 0,
      sourceCount: 0,
      importedUsers: 0,
      importedInvites: 0,
      importedSources: 0,
      error: '备份文件中未包含任何可恢复的数据',
    };
  }

  const store = loadStore();
  let userCount = 0;
  let inviteCount = 0;
  let sourceCount = 0;

  if (data.users && typeof data.users === 'object' && !Array.isArray(data.users)) {
    for (const [uname, u] of Object.entries(data.users)) {
      if (u && u.username && u.passwordHash) {
        store.users[uname.toLowerCase().trim()] = u;
        userCount++;
        if (isPostgresConfigured()) {
          dbUpsertUser(u).catch(() => {});
        }
      }
    }
  }

  if (data.invites && typeof data.invites === 'object' && !Array.isArray(data.invites)) {
    for (const [code, inv] of Object.entries(data.invites)) {
      if (inv && inv.code) {
        store.invites[code] = inv;
        inviteCount++;
        if (isPostgresConfigured()) {
          dbUpsertInvite(inv).catch(() => {});
        }
      }
    }
  }

  if (data.globalSources && typeof data.globalSources === 'object' && !Array.isArray(data.globalSources)) {
    for (const [k, s] of Object.entries(data.globalSources)) {
      if (s && s.url) {
        store.globalSources[k] = s;
        sourceCount++;
        if (isPostgresConfigured()) {
          dbUpsertGlobalSource(s).catch(() => {});
        }
      }
    }
  }

  if (data.userConfigs && typeof data.userConfigs === 'object' && !Array.isArray(data.userConfigs)) {
    if (!store.userConfigs) store.userConfigs = {};
    for (const [u, conf] of Object.entries(data.userConfigs)) {
      if (conf && conf.username) {
        store.userConfigs[u] = conf;
        if (isPostgresConfigured()) {
          dbSaveUserConfig(u, conf).catch(() => {});
        }
      }
    }
  }

  saveStore(store);
  saveUsersBackup(store);
  saveGlobalSourcesBackup(store);

  return {
    success: true,
    userCount,
    inviteCount,
    sourceCount,
    importedUsers: userCount,
    importedInvites: inviteCount,
    importedSources: sourceCount,
  };
}

/** 获取存储层与数据持久化体检诊断信息 */
export function getStorageDiagnostics() {
  const store = loadStore();
  const dir = getDataDir();
  const filePath = getStoreFilePath();
  const fileExists = fs.existsSync(filePath);
  let fileSize = 0;
  let lastModified = 0;
  if (fileExists) {
    try {
      const stat = fs.statSync(filePath);
      fileSize = stat.size;
      lastModified = stat.mtimeMs;
    } catch {
      // ignore
    }
  }

  const isEphemeral = isStorageEphemeral();

  return {
    dataDir: dir,
    isEphemeral,
    isPersistentMounted: !isEphemeral,
    storePath: filePath,
    exists: fileExists,
    storeSize: fileSize,
    lastModified,
    database: {
      type: isPostgresConfigured() ? 'neon_postgresql' : 'local_json_fallback',
      configured: isPostgresConfigured(),
    },
    userCount: Object.keys(store.users || {}).length,
    inviteCount: Object.keys(store.invites || {}).length,
    globalSourceCount: Object.keys(store.globalSources || {}).length,
    userConfigsCount: Object.keys(store.userConfigs || {}).length,
    superAdminUsername: getSuperAdminUsername(),
    isDefaultPassword: isUsingDefaultPassword(),
    hasCustomGithubToken: Boolean(getCustomGithubToken()),
    gistConfigured: Boolean(getCustomGithubToken() || process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
    // 兼容历史字段
    usersCount: Object.keys(store.users || {}).length,
    invitesCount: Object.keys(store.invites || {}).length,
    sourcesCount: Object.keys(store.globalSources || {}).length,
    hasTokenConfigured: Boolean(getCustomGithubToken() || process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
    gist: getGistBackupStatus(),
  };
}
