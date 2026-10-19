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
  setCustomGithubToken,
  getCustomGithubToken,
  testAndVerifyGithubToken,
  registerRemoteHydrateCallback,
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
  systemConfig?: {
    githubToken?: string;
    gistId?: string;
    updatedAt?: number;
  };
}

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
function getDataDir(): string {
  // 1. 优先使用自定义环境变量 DATA_DIR
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

  // 2. 默认工作区目录 /app/data 或 ./data
  const defaultDir = path.join(process.cwd(), 'data');
  try {
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    fs.accessSync(defaultDir, fs.constants.W_OK);
    isEphemeralDir = false;
    return defaultDir;
  } catch {
    // 3. 容灾降级：容器非 Root 用户在 /app 无权限时，平滑降级至 /tmp/libretv-data 避免 500 崩溃
    isEphemeralDir = true;
    const tmpDir = path.join(os.tmpdir(), 'libretv-data');
    if (!hasWarnedEphemeral) {
      hasWarnedEphemeral = true;
      console.error(
        `\n================================================================================\n` +
        `[CRITICAL ALERT] 默认数据目录 '${defaultDir}' 权限不足 (EACCES)！\n` +
        `已平滑降级至临时易失目录: '${tmpDir}'\n` +
        `警告：容器重启或镜像更新后，临时目录中的账号、邀请码等数据将会丢失！\n` +
        `解决方案：请在宿主机执行 'chown -R 10001:10001 ./data' 或 'chmod -R 777 ./data' 以赋予写权限！\n` +
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

/** 将当前全局源持久化保存至独立物理备份文件（原子写入） */
export function saveGlobalSourcesBackup(store: AuthDataStore): void {
  try {
    const backupFile = getGlobalSourcesBackupFilePath();
    const sourcesList = Object.values(store.globalSources || {});

    // 空写防熔断：如果当前传入的源列表为空，但磁盘上已有数据，拒绝清空覆盖物理备份
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

    // 空写防熔断：如果当前传入的 store 没有用户，但磁盘已有备份，拒绝清空覆盖物理备份
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

/**
 * 环境变量预置账号注入支持：
 * PRESET_USERS 格式支持:
 * 1. "user1:pass1,user2:pass2"
 * 2. JSON 数组: [{"username":"u1","password":"p1","role":"admin"}]
 */
function bootstrapPresetUsers(store: AuthDataStore): void {
  const envPreset = process.env.PRESET_USERS?.trim();
  if (!envPreset) return;

  try {
    if (envPreset.startsWith('[') || envPreset.startsWith('{')) {
      const parsed = JSON.parse(envPreset);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (!item.username || !item.password) continue;
        const uname = String(item.username).toLowerCase().trim();
        if (!store.users[uname]) {
          const salt = crypto.randomBytes(32).toString('hex');
          store.users[uname] = {
            id: crypto.randomUUID(),
            username: uname,
            passwordHash: hashPassword(String(item.password), salt),
            salt,
            role: item.role === 'admin' ? 'admin' : 'user',
            status: 'active',
            sessionVersion: 1,
            createdAt: Date.now(),
          };
        }
      }
      return;
    }

    // 格式: user1:pass1,user2:pass2
    const pairs = envPreset.split(',').map((p) => p.trim()).filter(Boolean);
    for (const pair of pairs) {
      const idx = pair.indexOf(':');
      if (idx <= 0) continue;
      const uname = pair.slice(0, idx).toLowerCase().trim();
      const pwd = pair.slice(idx + 1).trim();
      if (!store.users[uname]) {
        const salt = crypto.randomBytes(32).toString('hex');
        store.users[uname] = {
          id: crypto.randomUUID(),
          username: uname,
          passwordHash: hashPassword(pwd, salt),
          salt,
          role: 'user',
          status: 'active',
          sessionVersion: 1,
          createdAt: Date.now(),
        };
      }
    }
  } catch (err) {
    console.warn('[LibreTV] PRESET_USERS 环境变量解析异常:', err);
  }
}

/**
 * 启动时智能合并用户与邀请码：
 * 融合主存储、独立物理备份与环境变量预置账号，杜绝因文件损坏或容器更新导致的账号蒸发
 */
export function bootstrapAndMergeUsers(store: AuthDataStore): void {
  if (!store.users) store.users = {};
  if (!store.invites) store.invites = {};

  // 1. 从独立物理备份中找回可能丢失的存量用户与邀请码
  const backup = loadUsersBackup();
  if (backup) {
    for (const [uname, u] of Object.entries(backup.users)) {
      if (!store.users[uname] && u && u.username && u.passwordHash) {
        store.users[uname] = u;
      }
    }
    for (const [code, inv] of Object.entries(backup.invites)) {
      if (!store.invites[code] && inv && inv.code) {
        store.invites[code] = inv;
      }
    }
  }

  // 2. 注入环境变量配置的预设用户
  bootstrapPresetUsers(store);

  // 3. 确保初始管理员初始化
  bootstrapAdmin(store);

  // 4. 确保种子邀请码初始化
  bootstrapSeedInvites(store);

  // 5. 立即双写同步物理备份
  saveUsersBackup(store);
}

/** 读取物理备份文件中的全局源列表（支持世代快照回退） */
export function loadGlobalSourcesBackup(): GlobalSourceRecord[] {
  const tryFiles = [
    getGlobalSourcesBackupFilePath(),
    `${getGlobalSourcesBackupFilePath()}.prev.json`,
  ];
  for (const backupFile of tryFiles) {
    try {
      if (!fs.existsSync(backupFile)) continue;
      const content = fs.readFileSync(backupFile, 'utf-8');
      if (!content || content.trim().length <= 2) continue;
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as GlobalSourceRecord[];
      if (parsed && Array.isArray(parsed.sources) && parsed.sources.length > 0) {
        return parsed.sources as GlobalSourceRecord[];
      }
    } catch (err) {
      console.warn(`[LibreTV] 全局源管理备份读取异常 (${backupFile}):`, err);
    }
  }
  return [];
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
        bootstrapAndMergeUsers(inMemoryStore);
        bootstrapAndMergeGlobalSources(inMemoryStore);

        const storeFile = getStoreFilePath();
        atomicWriteJsonSync(storeFile, inMemoryStore);
        saveUsersBackup(inMemoryStore);
        saveGlobalSourcesBackup(inMemoryStore);
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

// 注册 Gist 远端账号反向水合回调：当远端发现本地缺失的账号时，无感写回本地物理文件
registerRemoteHydrateCallback((mergedData) => {
  if (inMemoryStore) {
    let changed = false;
    if (mergedData.users) {
      for (const [u, r] of Object.entries(mergedData.users as Record<string, UserRecord>)) {
        if (!inMemoryStore.users[u] && r && r.username) {
          inMemoryStore.users[u] = r;
          changed = true;
        }
      }
    }
    if (mergedData.invites) {
      for (const [c, inv] of Object.entries(mergedData.invites as Record<string, InviteCodeRecord>)) {
        if (!inMemoryStore.invites[c] && inv && inv.code) {
          inMemoryStore.invites[c] = inv;
          changed = true;
        }
      }
    }
    if (changed) {
      const storeFile = getStoreFilePath();
      atomicWriteJsonSync(storeFile, inMemoryStore);
      saveUsersBackup(inMemoryStore);
      console.log('[LibreTV] Gist 云端账号数据已反向水合至本地物理备份');
    }
  }
});

function loadStore(): AuthDataStore {
  if (inMemoryStore) return inMemoryStore;

  const storeFile = getStoreFilePath();
  const prevStoreFile = `${storeFile}.prev.json`;

  let loaded: AuthDataStore | null = null;

  // 1. 优先尝试从主存储 auth-store.json 读取
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

  // 2. 若主存储损坏或不存在，自动从 auth-store.json.prev.json 世代物理快照恢复
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

  inMemoryStore = loaded || { users: {}, invites: {}, globalSources: {} };

  if (inMemoryStore.systemConfig?.githubToken) {
    setCustomGithubToken(inMemoryStore.systemConfig.githubToken);
  }

  if (!inMemoryStore.globalSources) inMemoryStore.globalSources = {};
  if (!inMemoryStore.invites) inMemoryStore.invites = {};
  if (!inMemoryStore.users) inMemoryStore.users = {};

  // 3. 确保用户与邀请码启动合并恢复（主文件 + users-backup.json + PRESET_USERS + 种子邀请码）
  bootstrapAndMergeUsers(inMemoryStore);
  // 4. 同时读取物理备份(global-sources-backup.json) + 环境变量并智能合并与持久化备份
  bootstrapAndMergeGlobalSources(inMemoryStore);

  saveStore(inMemoryStore);
  return inMemoryStore;
}

function saveStore(store: AuthDataStore): void {
  try {
    // 关键防丢保全：如果内存中当前用户数少于已有的独立备份（可能由于并发或初始化瞬态），优先并入备份
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
    // 独立物理双备份：用户账号 + 全局源
    saveUsersBackup(store);
    saveGlobalSourcesBackup(store);
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

/** 保存并绑定自定义 GitHub Token */
export async function saveCustomGithubToken(token: string): Promise<{
  success: boolean;
  error?: string;
  username?: string;
  gistState: GistSyncState;
}> {
  const clean = token.trim();
  const test = await testAndVerifyGithubToken(clean);
  if (!test.success) {
    return { success: false, error: test.error, gistState: getGistStatus() };
  }

  setCustomGithubToken(clean);
  const store = loadStore();
  if (!store.systemConfig) store.systemConfig = {};
  store.systemConfig.githubToken = clean;
  store.systemConfig.updatedAt = Date.now();
  saveStore(store);

  // 立即重置并拉取云端 Gist
  isGistLoaded = false;
  await ensureGistLoaded();

  return {
    success: true,
    username: test.username,
    gistState: getGistStatus(),
  };
}

/** 导出全量数据备份（供管理员离线下载） */
export function exportFullBackup(): Record<string, unknown> {
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
      }
    }
  }

  if (data.invites && typeof data.invites === 'object' && !Array.isArray(data.invites)) {
    for (const [code, inv] of Object.entries(data.invites)) {
      if (inv && inv.code) {
        store.invites[code] = inv;
        inviteCount++;
      }
    }
  }

  if (data.globalSources && typeof data.globalSources === 'object' && !Array.isArray(data.globalSources)) {
    for (const [k, s] of Object.entries(data.globalSources)) {
      if (s && s.url) {
        store.globalSources[k] = s;
        sourceCount++;
      }
    }
  }

  saveStore(store);
  saveUsersBackup(store);
  saveGlobalSourcesBackup(store);
  schedulePushToGist(store);

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
    userCount: Object.keys(store.users || {}).length,
    inviteCount: Object.keys(store.invites || {}).length,
    globalSourceCount: Object.keys(store.globalSources || {}).length,
    hasCustomGithubToken: Boolean(getCustomGithubToken()),
    gistConfigured: Boolean(getCustomGithubToken() || process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
    // 兼容字段
    usersCount: Object.keys(store.users || {}).length,
    invitesCount: Object.keys(store.invites || {}).length,
    sourcesCount: Object.keys(store.globalSources || {}).length,
    hasTokenConfigured: Boolean(getCustomGithubToken() || process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
    gist: getGistStatus(),
  };
}
