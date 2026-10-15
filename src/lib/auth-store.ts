import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'auth-store.json');

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

function loadStore(): AuthDataStore {
  if (inMemoryStore) return inMemoryStore;

  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {
      // 容错处理
    }
  }

  if (fs.existsSync(STORE_FILE)) {
    try {
      const content = fs.readFileSync(STORE_FILE, 'utf-8');
      inMemoryStore = JSON.parse(content) as AuthDataStore;
    } catch {
      inMemoryStore = { users: {}, invites: {}, globalSources: {} };
    }
  } else {
    inMemoryStore = { users: {}, invites: {}, globalSources: {} };
  }

  // 确保管理员账号初始化
  bootstrapAdmin(inMemoryStore);
  // 确保初始种子邀请码
  bootstrapSeedInvites(inMemoryStore);

  saveStore(inMemoryStore);
  return inMemoryStore;
}

function saveStore(store: AuthDataStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
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
  return record;
}

export function removeGlobalSource(key: string): boolean {
  const store = loadStore();
  if (store.globalSources[key]) {
    delete store.globalSources[key];
    saveStore(store);
    return true;
  }
  return false;
}
