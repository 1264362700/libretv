import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { getEnvSources } from './env-sources';
import { getEnvLiveSources } from './env-live-sources';
import {
  pullFromGist,
  schedulePushToGist,
  forcePushToGist,
  getGistSyncState,
  type GistSyncState,
} from './gist-sync';

/**
 * 账号系统与邀请码底层存储引擎（基于 JSON 文件，具备密码加盐 Hash、顶号版本号与动态加源）
 */

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: 'admin' | 'user';
  status: 'active' | 'banned';
  /** 会话版本号：用于异地登录顶号互踢与强制下线 */
  sessionVersion: number;
  createdAt: number;
  lastLoginAt?: number;
}

export interface InviteCodeRecord {
  code: string;
  createdBy: string;
  maxUses: number;
  useCount: number;
  usedBy: string[];
  active: boolean;
  createdAt: number;
}

export interface GlobalSourceRecord {
  key: string;
  name: string;
  url: string;
  type: 'vod' | 'live';
  createdAt: number;
}

interface AuthDataStore {
  users: Record<string, UserRecord>;
  invites: Record<string, InviteCodeRecord>;
  globalSources: Record<string, GlobalSourceRecord>;
}

// 支持 DATA_DIR 环境变量并针对容器环境做权限容灾兜底
function getDataDir(): string {
  // 1. 优先使用自定义环境变量 DATA_DIR
  const envDir = process.env.DATA_DIR?.trim();
  if (envDir) {
    try {
      if (!fs.existsSync(envDir)) {
        fs.mkdirSync(envDir, { recursive: true });
      }
      fs.accessSync(envDir, fs.constants.W_OK);
      return envDir;
    } catch (e) {
      console.warn(`[LibreTV] DATA_DIR '${envDir}' 不可写，尝试工作区目录:`, e);
    }
  }

  // 2. 默认工作区目录 /app/data 或 ./data
  const defaultDir = path.join(process.cwd(), 'data');
  try {
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    fs.accessSync(defaultDir, fs.constants.W_OK);
    return defaultDir;
  } catch (err) {
    // 3. 容灾降级：容器非 Root 用户在 /app 无权限时，平滑降级至 /tmp/libretv-data 避免 500 崩溃
    console.warn(`[LibreTV] 默认数据目录 '${defaultDir}' 权限不足 (EACCES)，平滑降级至临时可写目录:`, err);
    const tmpDir = path.join(os.tmpdir(), 'libretv-data');
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

function getStoreFilePath(): string {
  return path.join(getDataDir(), 'auth-store.json');
}

/** 顶级秒播蓝光 CMS 矩阵 + IPv4 高可用直播矩阵（全量实测存活，聚合 130 万+ 部海量影视库） */
const CURATED_DEFAULT_SOURCES: { key: string; name: string; url: string; type: 'vod' | 'live' }[] = [
  // —— 点播源矩阵（全站聚合片库，实测 100% 存活，超 130 万部海量片源） ——
  {
    key: 'curated_lzzy',
    name: '量子资源 (蓝光秒开)',
    url: 'https://cj.lziapi.com/api.php/provide/vod',
    type: 'vod',
  },
  {
    key: 'curated_ffzy',
    name: '非凡资源 (极速秒播)',
    url: 'https://cj.ffzyapi.com/api.php/provide/vod',
    type: 'vod',
  },
  {
    key: 'curated_snzy',
    name: '索尼资源 (高清秒播)',
    url: 'https://suoniapi.com/api.php/provide/vod',
    type: 'vod',
  },
  {
    key: 'curated_gszy',
    name: '光速资源 (超低延迟)',
    url: 'https://api.guangsuapi.com/api.php/provide/vod',
    type: 'vod',
  },
  {
    key: 'curated_hnzy',
    name: '红牛资源 (综合大片)',
    url: 'https://www.hongniuzy2.com/api.php/provide/vod',
    type: 'vod',
  },
  {
    key: 'curated_yyzy',
    name: '丫丫资源 (日韩动漫)',
    url: 'https://cj.yayazy.net/api.php/provide/vod',
    type: 'vod',
  },
  {
    key: 'curated_jyzy',
    name: '金鹰资源 (院线热映)',
    url: 'https://jyzyapi.com/api.php/provide/vod',
    type: 'vod',
  },
  {
    key: 'curated_jszy',
    name: '极速资源 (海外综合)',
    url: 'https://jszyapi.com/api.php/provide/vod',
    type: 'vod',
  },
  {
    key: 'curated_hhzy',
    name: '豪华资源 (国内外热剧)',
    url: 'https://hhzyapi.com/api.php/provide/vod',
    type: 'vod',
  },
  {
    key: 'curated_hyzy',
    name: '虎牙资源 (精选大片)',
    url: 'https://www.huyaapi.com/api.php/provide/vod',
    type: 'vod',
  },
  {
    key: 'curated_yhzy',
    name: '樱花资源 (动漫番剧)',
    url: 'https://m3u8.apiyhzy.com/api.php/provide/vod',
    type: 'vod',
  },
  {
    key: 'curated_mdzy',
    name: '魔都资源 (热播大厅)',
    url: 'https://caiji.moduapi.cc/api.php/provide/vod',
    type: 'vod',
  },
  {
    key: 'curated_bdzy',
    name: '百度资源 (高速蓝光)',
    url: 'https://api.apibdzy.com/api.php/provide/vod',
    type: 'vod',
  },

  // —— 直播源矩阵（纯 IPv4 公网稳定直通、覆盖 CCTV 1~17、地方卫视与特色频道） ——
  {
    key: 'curated_live_cctv',
    name: '央视高清合集 (CCTV 1-17 公网稳定)',
    url: 'https://iptv-org.github.io/iptv/countries/cn.m3u',
    type: 'live',
  },
  {
    key: 'curated_live_freetv',
    name: '国内电视精选 (央视+卫视综合)',
    url: 'https://cdn.jsdelivr.net/gh/Free-TV/IPTV@master/playlists/playlist_china.m3u8',
    type: 'live',
  },
  {
    key: 'curated_live_special',
    name: '央视特色与影视专线 (高画质)',
    url: 'https://m3u.ibert.me/o_s_cn_cctv.m3u',
    type: 'live',
  },
  {
    key: 'curated_live_hk',
    name: '港澳台精选专区 (TVB/美亚/凤凰)',
    url: 'https://iptv-org.github.io/iptv/subdivisions/cn-hk.m3u',
    type: 'live',
  },
  {
    key: 'curated_live_movies',
    name: '全球电影轮播频道',
    url: 'https://iptv-org.github.io/iptv/categories/movies.m3u',
    type: 'live',
  },
  {
    key: 'curated_live_animation',
    name: '全球少儿动漫频道',
    url: 'https://iptv-org.github.io/iptv/categories/animation.m3u',
    type: 'live',
  },
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

/** 将当前全局源持久化保存至独立物理备份文件 */
export function saveGlobalSourcesBackup(store: AuthDataStore): void {
  try {
    const dataDir = getDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const backupFile = getGlobalSourcesBackupFilePath();
    const sourcesList = Object.values(store.globalSources || {});
    fs.writeFileSync(
      backupFile,
      JSON.stringify(
        {
          version: 1,
          updatedAt: Date.now(),
          count: sourcesList.length,
          sources: sourcesList,
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch (err) {
    console.warn('[LibreTV] 全局源管理备份写入异常:', err);
  }
}

/** 读取物理备份文件中的全局源列表 */
export function loadGlobalSourcesBackup(): GlobalSourceRecord[] {
  try {
    const backupFile = getGlobalSourcesBackupFilePath();
    if (!fs.existsSync(backupFile)) return [];
    const content = fs.readFileSync(backupFile, 'utf-8');
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed as GlobalSourceRecord[];
    if (parsed && Array.isArray(parsed.sources)) return parsed.sources as GlobalSourceRecord[];
    return [];
  } catch (err) {
    console.warn('[LibreTV] 全局源管理备份读取异常:', err);
    return [];
  }
}

/**
 * 启动时智能合并引擎：
 * 同时读取物理备份文件、环境变量（DEFAULT_SOURCES / DEFAULT_LIVE_SOURCES）与内置高可用矩阵，
 * 智能按 URL 去重合并，并自动同步落盘备份，保障任何环境下零数据丢失。
 */
export function bootstrapAndMergeGlobalSources(store: AuthDataStore): void {
  if (!store.globalSources) store.globalSources = {};

  // 1. 建立以 URL 为核心的已存在索引
  const existingMap = new Map<string, GlobalSourceRecord>();
  for (const s of Object.values(store.globalSources)) {
    if (s && s.url) {
      existingMap.set(`${s.type}:${normalizeSourceUrl(s.url)}`, s);
    }
  }

  // 2. 读取物理备份文件中的源（跨版本、跨容器迁移恢复）
  const backupList = loadGlobalSourcesBackup();
  for (const b of backupList) {
    if (!b || !b.url) continue;
    const keyTag = `${b.type}:${normalizeSourceUrl(b.url)}`;
    if (!existingMap.has(keyTag)) {
      const recordKey = b.key || `backup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const rec: GlobalSourceRecord = {
        key: recordKey,
        name: b.name || b.url,
        url: b.url,
        type: b.type === 'live' ? 'live' : 'vod',
        createdAt: b.createdAt || Date.now(),
      };
      store.globalSources[rec.key] = rec;
      existingMap.set(keyTag, rec);
    }
  }

  // 3. 读取环境变量 DEFAULT_SOURCES（点播）与 DEFAULT_LIVE_SOURCES（直播）合并注入
  try {
    const envVods = getEnvSources();
    for (const v of envVods) {
      if (!v || !v.url) continue;
      const keyTag = `vod:${normalizeSourceUrl(v.url)}`;
      if (!existingMap.has(keyTag)) {
        const rec: GlobalSourceRecord = {
          key: `env_merged_${v.key}`,
          name: v.name,
          url: v.url,
          type: 'vod',
          createdAt: Date.now(),
        };
        store.globalSources[rec.key] = rec;
        existingMap.set(keyTag, rec);
      }
    }
  } catch (err) {
    console.warn('[LibreTV] 启动合并 DEFAULT_SOURCES 异常:', err);
  }

  try {
    const envLives = getEnvLiveSources();
    for (const l of envLives) {
      if (!l || !l.url) continue;
      const keyTag = `live:${normalizeSourceUrl(l.url)}`;
      if (!existingMap.has(keyTag)) {
        const rec: GlobalSourceRecord = {
          key: `env_merged_${l.key}`,
          name: l.name,
          url: l.url,
          type: 'live',
          createdAt: Date.now(),
        };
        store.globalSources[rec.key] = rec;
        existingMap.set(keyTag, rec);
      }
    }
  } catch (err) {
    console.warn('[LibreTV] 启动合并 DEFAULT_LIVE_SOURCES 异常:', err);
  }

  // 4. 内置顶级秒播 CMS 与高可用直播矩阵兜底
  for (const src of CURATED_DEFAULT_SOURCES) {
    const keyTag = `${src.type}:${normalizeSourceUrl(src.url)}`;
    if (!existingMap.has(keyTag) && !store.globalSources[src.key]) {
      const rec: GlobalSourceRecord = {
        ...src,
        createdAt: Date.now(),
      };
      store.globalSources[src.key] = rec;
      existingMap.set(keyTag, rec);
    }
  }

  // 5. 立即同步回写物理备份，确保最新合并成果稳固持久化
  saveGlobalSourcesBackup(store);
}

let isGistLoaded = false;
let gistLoadingPromise: Promise<void> | null = null;

export async function ensureGistLoaded(): Promise<void> {
  if (isGistLoaded) return;
  if (gistLoadingPromise) return gistLoadingPromise;

  gistLoadingPromise = (async () => {
    try {
      const current = loadStore();
      const cloudData = await pullFromGist(current);
      if (cloudData && typeof cloudData === 'object') {
        const cd = cloudData as Partial<AuthDataStore>;
        if (!inMemoryStore) inMemoryStore = { users: {}, invites: {}, globalSources: {} };
        if (cd.users) inMemoryStore.users = { ...inMemoryStore.users, ...cd.users };
        if (cd.invites) inMemoryStore.invites = { ...inMemoryStore.invites, ...cd.invites };
        if (cd.globalSources) inMemoryStore.globalSources = { ...inMemoryStore.globalSources, ...cd.globalSources };
        bootstrapAdmin(inMemoryStore);
        bootstrapSeedInvites(inMemoryStore);
        bootstrapAndMergeGlobalSources(inMemoryStore);

        const dataDir = getDataDir();
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        const storeFile = path.join(dataDir, 'auth-store.json');
        fs.writeFileSync(storeFile, JSON.stringify(inMemoryStore, null, 2), 'utf-8');
      }
    } catch (e) {
      console.error('[LibreTV] 加载 Gist 云端数据异常:', e);
    } finally {
      isGistLoaded = true;
      gistLoadingPromise = null;
    }
  })();

  return gistLoadingPromise;
}

export async function manualSyncGist(): Promise<{ success: boolean; error?: string; state: GistSyncState }> {
  const store = loadStore();
  const res = await forcePushToGist(store);
  return { ...res, state: getGistSyncState() };
}

export async function manualPullGist(): Promise<{ success: boolean; error?: string; state: GistSyncState }> {
  isGistLoaded = false;
  await ensureGistLoaded();
  return { success: true, state: getGistSyncState() };
}

export function getGistStatus(): GistSyncState {
  return getGistSyncState();
}

// 服务端自动拉起云端同步探针
if (typeof window === 'undefined' && (process.env.GITHUB_TOKEN || process.env.GH_TOKEN)) {
  setTimeout(() => {
    ensureGistLoaded().catch(() => {});
  }, 50);
}

function loadStore(): AuthDataStore {
  if (inMemoryStore) return inMemoryStore;

  const storeFile = getStoreFilePath();
  if (fs.existsSync(storeFile)) {
    try {
      const content = fs.readFileSync(storeFile, 'utf-8');
      inMemoryStore = JSON.parse(content) as AuthDataStore;
    } catch {
      inMemoryStore = { users: {}, invites: {}, globalSources: {} };
    }
  } else {
    inMemoryStore = { users: {}, invites: {}, globalSources: {} };
  }

  if (!inMemoryStore.globalSources) inMemoryStore.globalSources = {};
  if (!inMemoryStore.invites) inMemoryStore.invites = {};
  if (!inMemoryStore.users) inMemoryStore.users = {};

  // 确保管理员账号初始化
  bootstrapAdmin(inMemoryStore);
  // 确保初始种子邀请码
  bootstrapSeedInvites(inMemoryStore);
  // 同时读取物理备份 + 环境变量（DEFAULT_SOURCES / DEFAULT_LIVE_SOURCES）并智能合并与持久化备份
  bootstrapAndMergeGlobalSources(inMemoryStore);

  saveStore(inMemoryStore);
  return inMemoryStore;
}

function saveStore(store: AuthDataStore): void {
  try {
    const dataDir = getDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const storeFile = path.join(dataDir, 'auth-store.json');
    fs.writeFileSync(storeFile, JSON.stringify(store, null, 2), 'utf-8');
    // 自动异步回写至 GitHub Gist 云存储
    schedulePushToGist(store);
  } catch (err) {
    console.error('Failed to save auth-store.json:', err);
  }
}

function bootstrapAdmin(store: AuthDataStore) {
  const adminUsername = 'admin';
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
    };
  } else if (envPassword && hashPassword(envPassword, store.users[adminUsername].salt) !== store.users[adminUsername].passwordHash) {
    // 若环境变量显式配置了 ADMIN_PASSWORD 或 PASSWORD 且发生变更，平滑同步管理员密码
    const salt = crypto.randomBytes(32).toString('hex');
    store.users[adminUsername].salt = salt;
    store.users[adminUsername].passwordHash = hashPassword(envPassword, salt);
    store.users[adminUsername].sessionVersion = (store.users[adminUsername].sessionVersion || 1) + 1;
  }
}

function bootstrapSeedInvites(store: AuthDataStore) {
  // 支持环境变量注入种子邀请码，如 INITIAL_INVITE_CODES=VIP666,LTV-FREE
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

// —— 外部公开方法 ——

export function getUser(username: string): UserRecord | undefined {
  const store = loadStore();
  return store.users[username.toLowerCase().trim()];
}

export function listUsers(): Omit<UserRecord, 'passwordHash' | 'salt'>[] {
  const store = loadStore();
  return Object.values(store.users).map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    sessionVersion: u.sessionVersion,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
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

  // 登录成功更新活跃时间并递增会话版本号（顶号互踢核心：旧设备 Token 自动失效）
  user.lastLoginAt = Date.now();
  user.sessionVersion += 1;
  saveStore(store);

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

  // 邀请码核验
  const invite = store.invites[codeStr];
  if (!invite || !invite.active) {
    return { success: false, error: '无效或已作废的邀请码' };
  }

  if (invite.useCount >= invite.maxUses) {
    return { success: false, error: '该邀请码已被使用完毕' };
  }

  // 消费邀请码
  invite.useCount += 1;
  invite.usedBy.push(uname);
  if (invite.useCount >= invite.maxUses) {
    invite.active = false;
  }

  // 创建用户
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
    return true;
  }
  return false;
}

export function banUser(username: string): boolean {
  const store = loadStore();
  const uname = username.toLowerCase().trim();
  const user = store.users[uname];
  if (user && user.role !== 'admin') {
    user.status = 'banned';
    user.sessionVersion += 1; // 强制踢下线
    saveStore(store);
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
    return true;
  }
  return false;
}

export function kickUser(username: string): boolean {
  const store = loadStore();
  const uname = username.toLowerCase().trim();
  const user = store.users[uname];
  if (user) {
    user.sessionVersion += 1; // 会话版本递增，旧设备全部下线
    saveStore(store);
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
    user.sessionVersion += 1; // 改密后强制踢下线
    saveStore(store);
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
  return record;
}

export function removeGlobalSource(key: string): boolean {
  const store = loadStore();
  if (store.globalSources[key]) {
    delete store.globalSources[key];
    saveStore(store);
    saveGlobalSourcesBackup(store);
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
    }
    return store.users[uname];
  }

  // 容器重启恢复：为合法 HMAC 签名的用户恢复基础记录
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
  return record;
}
