import { Pool, PoolClient } from 'pg';
import type { UserRecord, InviteCodeRecord, GlobalSourceRecord } from './auth-store-types';

export interface UserConfigRecord {
  username: string;
  customSources: unknown[];
  selectedKeys: string[];
  subscriptions: unknown[];
  updatedAt: number;
}

export interface FullDbSnapshot {
  version: number;
  exportedAt: number;
  source: 'neon_postgres';
  users: Record<string, UserRecord>;
  invites: Record<string, InviteCodeRecord>;
  globalSources: Record<string, GlobalSourceRecord>;
  userConfigs: Record<string, UserConfigRecord>;
  appMeta?: Record<string, unknown>;
}

// 缓存全局单例 Pool，避免 Next.js 开发模式热重载频繁创建连接池
declare global {
  var __libretv_pg_pool__: Pool | undefined;
  var __libretv_schema_initialized__: boolean | undefined;
}

export function isPostgresConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && (url.startsWith('postgres://') || url.startsWith('postgresql://')));
}

/**
 * 规整 PostgreSQL 连接串，消除 pg / pg-connection-string 在 Node.js 运行时报出的：
 * "SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'"
 * 自动补全 uselibpqcompat=true，保持生产与云端兼容性并杜绝控制台警告
 */
export function normalizePostgresConnectionString(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    const sslmode = parsed.searchParams.get('sslmode')?.toLowerCase();
    if (sslmode && ['require', 'prefer', 'verify-ca'].includes(sslmode)) {
      if (!parsed.searchParams.has('uselibpqcompat')) {
        parsed.searchParams.set('uselibpqcompat', 'true');
      }
    }
    return parsed.toString();
  } catch {
    if (/([?&])sslmode=(require|prefer|verify-ca)(?:&|$)/i.test(trimmed) && !trimmed.includes('uselibpqcompat=')) {
      const joiner = trimmed.includes('?') ? '&' : '?';
      return `${trimmed}${joiner}uselibpqcompat=true`;
    }
    return trimmed;
  }
}

export function getPostgresPool(): Pool | null {
  if (!isPostgresConfigured()) return null;

  if (globalThis.__libretv_pg_pool__) {
    return globalThis.__libretv_pg_pool__;
  }

  const rawUrl = process.env.DATABASE_URL?.trim() || '';
  const connectionString = normalizePostgresConnectionString(rawUrl);
  const isSsl = connectionString.includes('sslmode=') || process.env.NODE_ENV === 'production';

  const pool = new Pool({
    connectionString,
    ssl: isSsl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('[Neon PostgreSQL] 连接池底层非致命异常:', err.message);
  });

  globalThis.__libretv_pg_pool__ = pool;
  return pool;
}

/** 幂等初始化 Neon PostgreSQL 表结构 */
export async function initPostgresSchema(): Promise<boolean> {
  const pool = getPostgresPool();
  if (!pool) return false;

  if (globalThis.__libretv_schema_initialized__) return true;

  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. 用户表
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(64) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role VARCHAR(16) NOT NULL DEFAULT 'user',
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        session_version INT NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL,
        last_login_at BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    // 2. 邀请码表
    await client.query(`
      CREATE TABLE IF NOT EXISTS invites (
        code VARCHAR(64) PRIMARY KEY,
        created_by VARCHAR(64) NOT NULL,
        max_uses INT NOT NULL DEFAULT 1,
        use_count INT NOT NULL DEFAULT 0,
        used_by JSONB NOT NULL DEFAULT '[]'::jsonb,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL
      );
    `);

    // 3. 全站搜索源表
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_sources (
        key VARCHAR(64) PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        type VARCHAR(16) NOT NULL DEFAULT 'vod',
        created_at BIGINT NOT NULL
      );
    `);

    // 4. 每个用户的专属搜索源与订阅配置表
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_configs (
        username VARCHAR(64) PRIMARY KEY,
        custom_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
        selected_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
        subscriptions JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at BIGINT NOT NULL
      );
    `);

    // 5. 应用元数据与冷备记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key VARCHAR(64) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);

    await client.query('COMMIT');
    globalThis.__libretv_schema_initialized__ = true;
    console.debug('[Neon PostgreSQL] 数据表结构幂等初始化/校验成功');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Neon PostgreSQL] 表结构初始化失败:', err);
    return false;
  } finally {
    client.release();
  }
}

/** 测试 Neon 连通性与延迟，并读取物理表真实行数 */
export async function testNeonConnection(): Promise<{
  ok: boolean;
  latencyMs?: number;
  error?: string;
  tableCounts?: {
    users: number;
    invites: number;
    globalSources: number;
    userConfigs: number;
  };
}> {
  const pool = getPostgresPool();
  if (!pool) return { ok: false, error: '未配置 DATABASE_URL 环境变量' };

  const start = Date.now();
  try {
    await initPostgresSchema();
    const countRes = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM invites) as invites_count,
        (SELECT COUNT(*) FROM global_sources) as sources_count,
        (SELECT COUNT(*) FROM user_configs) as configs_count
    `);
    const row = countRes.rows?.[0] || {};
    return {
      ok: true,
      latencyMs: Date.now() - start,
      tableCounts: {
        users: Number(row.users_count || 0),
        invites: Number(row.invites_count || 0),
        globalSources: Number(row.sources_count || 0),
        userConfigs: Number(row.configs_count || 0),
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 从 Neon 读取全部核心数据（供启动 Hydrate 缓存与冷备导出使用） */
export async function fetchAllDataFromNeon(): Promise<FullDbSnapshot | null> {
  const pool = getPostgresPool();
  if (!pool) return null;

  await initPostgresSchema();

  try {
    const [uRes, iRes, sRes, cRes, mRes] = await Promise.all([
      pool.query('SELECT * FROM users'),
      pool.query('SELECT * FROM invites'),
      pool.query('SELECT * FROM global_sources'),
      pool.query('SELECT * FROM user_configs'),
      pool.query('SELECT * FROM app_meta'),
    ]);

    const users: Record<string, UserRecord> = {};
    for (const r of uRes.rows) {
      users[r.username] = {
        id: r.id,
        username: r.username,
        passwordHash: r.password_hash,
        salt: r.salt,
        role: r.role,
        status: r.status,
        sessionVersion: Number(r.session_version) || 1,
        createdAt: Number(r.created_at),
        lastLoginAt: r.last_login_at ? Number(r.last_login_at) : undefined,
      };
    }

    const invites: Record<string, InviteCodeRecord> = {};
    for (const r of iRes.rows) {
      invites[r.code] = {
        code: r.code,
        createdBy: r.created_by,
        maxUses: Number(r.max_uses) || 1,
        useCount: Number(r.use_count) || 0,
        usedBy: Array.isArray(r.used_by) ? r.used_by : [],
        active: Boolean(r.active),
        createdAt: Number(r.created_at),
      };
    }

    const globalSources: Record<string, GlobalSourceRecord> = {};
    for (const r of sRes.rows) {
      globalSources[r.key] = {
        key: r.key,
        name: r.name,
        url: r.url,
        type: r.type,
        createdAt: Number(r.created_at),
      };
    }

    const userConfigs: Record<string, UserConfigRecord> = {};
    for (const r of cRes.rows) {
      userConfigs[r.username] = {
        username: r.username,
        customSources: Array.isArray(r.custom_sources) ? r.custom_sources : [],
        selectedKeys: Array.isArray(r.selected_keys) ? r.selected_keys : [],
        subscriptions: Array.isArray(r.subscriptions) ? r.subscriptions : [],
        updatedAt: Number(r.updated_at),
      };
    }

    const appMeta: Record<string, unknown> = {};
    for (const r of mRes.rows) {
      appMeta[r.key] = r.value;
    }

    return {
      version: 2,
      exportedAt: Date.now(),
      source: 'neon_postgres',
      users,
      invites,
      globalSources,
      userConfigs,
      appMeta,
    };
  } catch (err) {
    console.error('[Neon PostgreSQL] 读取全量数据异常:', err);
    return null;
  }
}

/** 事务性全量/增量写回 Neon（用于从 Gist 容灾恢复） */
export async function restoreAllDataToNeon(snapshot: {
  users?: Record<string, UserRecord>;
  invites?: Record<string, InviteCodeRecord>;
  globalSources?: Record<string, GlobalSourceRecord>;
  userConfigs?: Record<string, UserConfigRecord>;
}): Promise<{
  success: boolean;
  error?: string;
  stats: { users: number; invites: number; sources: number; userConfigs: number };
}> {
  const pool = getPostgresPool();
  if (!pool) return { success: false, error: '未配置 DATABASE_URL', stats: { users: 0, invites: 0, sources: 0, userConfigs: 0 } };

  await initPostgresSchema();
  const client = await pool.connect();

  const stats = { users: 0, invites: 0, sources: 0, userConfigs: 0 };

  try {
    await client.query('BEGIN');

    // 1. 恢复 Users
    if (snapshot.users) {
      for (const u of Object.values(snapshot.users)) {
        if (!u.username || !u.passwordHash) continue;
        await client.query(
          `INSERT INTO users (id, username, password_hash, salt, role, status, session_version, created_at, last_login_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (username) DO UPDATE SET
             password_hash = EXCLUDED.password_hash,
             salt = EXCLUDED.salt,
             role = EXCLUDED.role,
             status = EXCLUDED.status,
             session_version = EXCLUDED.session_version,
             last_login_at = EXCLUDED.last_login_at`,
          [
            u.id || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            u.username,
            u.passwordHash,
            u.salt || '',
            u.role || 'user',
            u.status || 'active',
            u.sessionVersion || 1,
            u.createdAt || Date.now(),
            u.lastLoginAt || null,
          ]
        );
        stats.users++;
      }
    }

    // 2. 恢复 Invites
    if (snapshot.invites) {
      for (const inv of Object.values(snapshot.invites)) {
        if (!inv.code) continue;
        await client.query(
          `INSERT INTO invites (code, created_by, max_uses, use_count, used_by, active, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (code) DO UPDATE SET
             max_uses = EXCLUDED.max_uses,
             use_count = EXCLUDED.use_count,
             used_by = EXCLUDED.used_by,
             active = EXCLUDED.active`,
          [
            inv.code,
            inv.createdBy || 'admin',
            inv.maxUses || 1,
            inv.useCount || 0,
            JSON.stringify(inv.usedBy || []),
            inv.active ?? true,
            inv.createdAt || Date.now(),
          ]
        );
        stats.invites++;
      }
    }

    // 3. 恢复 Global Sources
    if (snapshot.globalSources) {
      for (const s of Object.values(snapshot.globalSources)) {
        if (!s.key || !s.url) continue;
        await client.query(
          `INSERT INTO global_sources (key, name, url, type, created_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (key) DO UPDATE SET
             name = EXCLUDED.name,
             url = EXCLUDED.url,
             type = EXCLUDED.type`,
          [s.key, s.name || s.key, s.url, s.type || 'vod', s.createdAt || Date.now()]
        );
        stats.sources++;
      }
    }

    // 4. 恢复 User Configs
    if (snapshot.userConfigs) {
      for (const [uname, conf] of Object.entries(snapshot.userConfigs)) {
        if (!uname) continue;
        await client.query(
          `INSERT INTO user_configs (username, custom_sources, selected_keys, subscriptions, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (username) DO UPDATE SET
             custom_sources = EXCLUDED.custom_sources,
             selected_keys = EXCLUDED.selected_keys,
             subscriptions = EXCLUDED.subscriptions,
             updated_at = EXCLUDED.updated_at`,
          [
            uname,
            JSON.stringify(conf.customSources || []),
            JSON.stringify(conf.selectedKeys || []),
            JSON.stringify(conf.subscriptions || []),
            conf.updatedAt || Date.now(),
          ]
        );
        stats.userConfigs++;
      }
    }

    await client.query('COMMIT');
    return { success: true, stats };
  } catch (err) {
    await client.query('ROLLBACK');
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Neon PostgreSQL] 容灾还原事务回滚:', msg);
    return { success: false, error: msg, stats };
  } finally {
    client.release();
  }
}

/** 单条写入/更新 User */
export async function dbUpsertUser(u: UserRecord): Promise<void> {
  const pool = getPostgresPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO users (id, username, password_hash, salt, role, status, session_version, created_at, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       salt = EXCLUDED.salt,
       role = EXCLUDED.role,
       status = EXCLUDED.status,
       session_version = EXCLUDED.session_version,
       last_login_at = EXCLUDED.last_login_at`,
    [u.id, u.username, u.passwordHash, u.salt, u.role, u.status, u.sessionVersion, u.createdAt, u.lastLoginAt || null]
  );
}

/** 更新用户会话版本号（顶号互踢） */
export async function dbUpdateSessionVersion(username: string, sessionVersion: number): Promise<void> {
  const pool = getPostgresPool();
  if (!pool) return;
  await pool.query('UPDATE users SET session_version = $1 WHERE username = $2', [sessionVersion, username]);
}

/** 单条写入/更新 Invite */
export async function dbUpsertInvite(inv: InviteCodeRecord): Promise<void> {
  const pool = getPostgresPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO invites (code, created_by, max_uses, use_count, used_by, active, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (code) DO UPDATE SET
       max_uses = EXCLUDED.max_uses,
       use_count = EXCLUDED.use_count,
       used_by = EXCLUDED.used_by,
       active = EXCLUDED.active`,
    [
      inv.code,
      inv.createdBy,
      inv.maxUses,
      inv.useCount,
      JSON.stringify(inv.usedBy || []),
      inv.active,
      inv.createdAt,
    ]
  );
}

/** 单条写入/更新 Global Source */
export async function dbUpsertGlobalSource(s: GlobalSourceRecord): Promise<void> {
  const pool = getPostgresPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO global_sources (key, name, url, type, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (key) DO UPDATE SET
       name = EXCLUDED.name,
       url = EXCLUDED.url,
       type = EXCLUDED.type`,
    [s.key, s.name, s.url, s.type, s.createdAt]
  );
}

/** 删除 Global Source */
export async function dbDeleteGlobalSource(key: string): Promise<void> {
  const pool = getPostgresPool();
  if (!pool) return;
  await pool.query('DELETE FROM global_sources WHERE key = $1', [key]);
}

/** 保存用户的搜索源与订阅个性化配置 */
export async function dbSaveUserConfig(
  username: string,
  config: { customSources?: unknown[]; selectedKeys?: string[]; subscriptions?: unknown[] }
): Promise<void> {
  const pool = getPostgresPool();
  if (!pool) return;
  const now = Date.now();
  await pool.query(
    `INSERT INTO user_configs (username, custom_sources, selected_keys, subscriptions, updated_at)
     VALUES ($1, COALESCE($2::jsonb, '[]'::jsonb), COALESCE($3::jsonb, '[]'::jsonb), COALESCE($4::jsonb, '[]'::jsonb), $5)
     ON CONFLICT (username) DO UPDATE SET
       custom_sources = CASE WHEN $2::jsonb IS NOT NULL THEN $2::jsonb ELSE user_configs.custom_sources END,
       selected_keys = CASE WHEN $3::jsonb IS NOT NULL THEN $3::jsonb ELSE user_configs.selected_keys END,
       subscriptions = CASE WHEN $4::jsonb IS NOT NULL THEN $4::jsonb ELSE user_configs.subscriptions END,
       updated_at = $5`,
    [
      username.toLowerCase().trim(),
      config.customSources !== undefined ? JSON.stringify(config.customSources) : null,
      config.selectedKeys !== undefined ? JSON.stringify(config.selectedKeys) : null,
      config.subscriptions !== undefined ? JSON.stringify(config.subscriptions) : null,
      now,
    ]
  );
}

/** 读取用户的搜索源与订阅配置 */
export async function dbGetUserConfig(username: string): Promise<UserConfigRecord | null> {
  const pool = getPostgresPool();
  if (!pool) return null;
  const res = await pool.query('SELECT * FROM user_configs WHERE username = $1', [username]);
  if (!res.rows || res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    username: r.username,
    customSources: Array.isArray(r.custom_sources) ? r.custom_sources : [],
    selectedKeys: Array.isArray(r.selected_keys) ? r.selected_keys : [],
    subscriptions: Array.isArray(r.subscriptions) ? r.subscriptions : [],
    updatedAt: Number(r.updated_at),
  };
}
