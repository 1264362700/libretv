/**
 * GitHub Gist 独立容灾冷备模块 (Decoupled Cold-Backup & Disaster Recovery)
 *
 * 职责：
 * 1. 彻底从日常读写中剥离，不再每次写操作网络阻塞调用 GitHub；
 * 2. 提供 exportNeonToGist()：将 Neon 数据库全量数据导出为 JSON 并推送到私有 Gist；
 * 3. 提供 restoreGistToNeon()：发生数据故障或迁移时，一键从 Gist 容灾还原至 Neon 主库；
 * 4. 维护独立的备份状态与元数据记录。
 */

import { fetchAllDataFromNeon, restoreAllDataToNeon, isPostgresConfigured, FullDbSnapshot } from './db-postgres';
import type { AuthDataStore } from './auth-store-types';

export interface GistBackupState {
  enabled: boolean;
  gistId: string | null;
  gistUrl: string | null;
  lastBackupAt: number | null;
  lastRestoreAt: number | null;
  lastStatus: 'idle' | 'backing_up' | 'restoring' | 'success' | 'error';
  lastError: string | null;
  stats?: {
    usersCount: number;
    invitesCount: number;
    sourcesCount: number;
    userConfigsCount: number;
  };
}

const GIST_FILENAME = 'cl-tv-auth-store.json';
const GIST_DESC = '[cl.tv] Neon PostgreSQL Cold-Backup (Disaster Recovery)';

const backupState: GistBackupState = {
  enabled: false,
  gistId: null,
  gistUrl: null,
  lastBackupAt: null,
  lastRestoreAt: null,
  lastStatus: 'idle',
  lastError: null,
};

let inMemoryCustomToken: string | null = null;
let resolvedGistId: string | null = null;

export function setCustomGithubToken(token: string | null): void {
  const clean = token?.trim() || null;
  if (clean !== inMemoryCustomToken) {
    inMemoryCustomToken = clean;
    resolvedGistId = null;
  }
}

export function getCustomGithubToken(): string | null {
  return inMemoryCustomToken;
}

function getToken(): string | null {
  if (inMemoryCustomToken) return inMemoryCustomToken;
  const t = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  return t || null;
}

function getEnvGistId(): string | null {
  const id = process.env.GIST_ID?.trim();
  return id || null;
}

export function getGistBackupStatus(): GistBackupState {
  const token = getToken();
  return {
    ...backupState,
    enabled: Boolean(token),
    gistId: resolvedGistId || getEnvGistId(),
    gistUrl: (resolvedGistId || getEnvGistId()) ? `https://gist.github.com/${resolvedGistId || getEnvGistId()}` : null,
  };
}

/** 校验 GitHub Token 有效性与 Gist 权限 */
export async function testAndVerifyGithubToken(token: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'LibreTV-GistBackup',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return { ok: false, error: `GitHub API 返回 HTTP ${res.status}` };
    }

    const data = (await res.json()) as { login: string };
    const scopes = res.headers.get('x-oauth-scopes') || '';
    if (!scopes.includes('gist') && !scopes.includes('repo')) {
      return { ok: false, username: data.login, error: 'Token 缺少 "gist" 读写权限，请在 GitHub PAT 中勾选 gist 权限' };
    }

    return { ok: true, username: data.login };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 查找或新建用于容灾备份的专属 Gist */
async function resolveOrCreateGistId(token: string, initialData?: unknown): Promise<string> {
  if (resolvedGistId) return resolvedGistId;
  const envId = getEnvGistId();
  if (envId) {
    resolvedGistId = envId;
    return envId;
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'LibreTV-GistBackup',
  };

  try {
    const listRes = await fetch('https://api.github.com/gists?per_page=50', {
      headers,
      cache: 'no-store',
    });

    if (listRes.ok) {
      const gists = (await listRes.json()) as Array<{
        id: string;
        description: string;
        files: Record<string, { filename: string }>;
      }>;

      const existing = gists.find(
        (g) =>
          g.files?.[GIST_FILENAME] ||
          g.description === GIST_DESC ||
          g.description?.includes('cl.tv') ||
          g.description?.includes('LibreTV')
      );

      if (existing) {
        resolvedGistId = existing.id;
        console.log(`[Gist Backup] 发现既有容灾备份 Gist: ${existing.id}`);
        return existing.id;
      }
    }

    console.log('[Gist Backup] 正在 GitHub 自动创建专属私有容灾 Gist...');
    const createRes = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: GIST_DESC,
        public: false,
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(initialData || { version: 2, createdAt: Date.now() }, null, 2),
          },
        },
      }),
    });

    if (createRes.ok) {
      const created = (await createRes.json()) as { id: string };
      resolvedGistId = created.id;
      console.log(`[Gist Backup] 专属私有容灾 Gist 创建成功: ${created.id}`);
      return created.id;
    } else {
      const errText = await createRes.text();
      throw new Error(`创建 Gist 失败 (HTTP ${createRes.status}): ${errText}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    backupState.lastError = msg;
    backupState.lastStatus = 'error';
    console.error('[Gist Backup] 发现/新建 Gist 异常:', err);
    throw err;
  }
}

/**
 * 将数据（优先从 Neon 主库，未配置时从本地 Store）导出为 JSON 快照并持久化推送到 GitHub Gist
 */
export async function exportNeonToGist(fallbackLocalStore?: AuthDataStore): Promise<{
  success: boolean;
  gistId?: string;
  gistUrl?: string;
  stats?: GistBackupState['stats'];
  error?: string;
}> {
  const token = getToken();
  if (!token) {
    return { success: false, error: '未配置 GITHUB_TOKEN，无法推送云端冷备' };
  }

  backupState.lastStatus = 'backing_up';

  try {
    let payload: FullDbSnapshot | (AuthDataStore & { version: number; exportedAt: number; source: string });

    if (isPostgresConfigured()) {
      const neonData = await fetchAllDataFromNeon();
      if (!neonData) {
        throw new Error('从 Neon 主库读取全量数据失败');
      }
      payload = neonData;
    } else if (fallbackLocalStore) {
      payload = {
        version: 2,
        exportedAt: Date.now(),
        source: 'local_fallback',
        users: fallbackLocalStore.users || {},
        invites: fallbackLocalStore.invites || {},
        globalSources: fallbackLocalStore.globalSources || {},
        userConfigs: fallbackLocalStore.userConfigs || {},
      };
    } else {
      throw new Error('无可用的数据源进行冷备导出');
    }

    const gistId = await resolveOrCreateGistId(token, payload);
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'LibreTV-GistBackup',
    };

    const stats = {
      usersCount: Object.keys(payload.users || {}).length,
      invitesCount: Object.keys(payload.invites || {}).length,
      sourcesCount: Object.keys(payload.globalSources || {}).length,
      userConfigsCount: Object.keys(payload.userConfigs || {}).length,
    };

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        description: `${GIST_DESC} [更新于 ${new Date().toISOString()}]`,
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(payload, null, 2),
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`PATCH Gist 失败 (HTTP ${res.status}): ${errText}`);
    }

    const now = Date.now();
    backupState.lastBackupAt = now;
    backupState.lastStatus = 'success';
    backupState.lastError = null;
    backupState.stats = stats;
    resolvedGistId = gistId;

    const gistUrl = `https://gist.github.com/${gistId}`;
    console.log(`[Gist Backup] 成功导出全量冷备至 GitHub Gist (${gistUrl})，包含 ${stats.usersCount} 个用户, ${stats.invitesCount} 个邀请码, ${stats.sourcesCount} 个全局源`);

    return {
      success: true,
      gistId,
      gistUrl,
      stats,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    backupState.lastStatus = 'error';
    backupState.lastError = msg;
    console.error('[Gist Backup] 导出冷备失败:', msg);
    return { success: false, error: msg };
  }
}

/**
 * 从 GitHub Gist 拉取冷备 JSON 并容灾写回 Neon 主库（支持事务幂等还原）
 */
export async function restoreGistToNeon(): Promise<{
  success: boolean;
  restoredStats?: { users: number; invites: number; sources: number; userConfigs: number };
  error?: string;
  gistUrl?: string;
}> {
  const token = getToken();
  if (!token) {
    return { success: false, error: '未配置 GITHUB_TOKEN，无法访问 Gist' };
  }

  backupState.lastStatus = 'restoring';

  try {
    const gistId = await resolveOrCreateGistId(token);
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'LibreTV-GistBackup',
    };

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`拉取 Gist 备份失败 (HTTP ${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      id: string;
      files: Record<string, { filename: string; content?: string; truncated?: boolean; raw_url?: string }>;
    };

    const targetFile = data.files?.[GIST_FILENAME] || data.files?.['auth-store.json'];
    if (!targetFile) {
      throw new Error(`Gist 中未找到备份文件 ${GIST_FILENAME}`);
    }

    let jsonContent = targetFile.content;
    if (targetFile.truncated && targetFile.raw_url) {
      const rawRes = await fetch(targetFile.raw_url, { headers });
      if (rawRes.ok) jsonContent = await rawRes.text();
    }

    if (!jsonContent || !jsonContent.trim()) {
      throw new Error('Gist 中的备份文件内容为空');
    }

    const parsed = JSON.parse(jsonContent);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('备份文件格式解析失败');
    }

    // 容灾还原到 Neon 主库
    if (isPostgresConfigured()) {
      const restoreResult = await restoreAllDataToNeon({
        users: parsed.users,
        invites: parsed.invites,
        globalSources: parsed.globalSources,
        userConfigs: parsed.userConfigs,
      });

      if (!restoreResult.success) {
        throw new Error(restoreResult.error || '还原写入 Neon 失败');
      }

      backupState.lastRestoreAt = Date.now();
      backupState.lastStatus = 'success';
      backupState.lastError = null;

      console.log(`[Gist Backup] 容灾恢复成功！恢复了 ${restoreResult.stats.users} 个用户, ${restoreResult.stats.invites} 个邀请码, ${restoreResult.stats.sources} 个全站源, ${restoreResult.stats.userConfigs} 个用户源配置`);

      return {
        success: true,
        restoredStats: restoreResult.stats,
        gistUrl: `https://gist.github.com/${gistId}`,
      };
    } else {
      // 未配置 Neon 时的兼容模式返回解析数据
      return {
        success: true,
        restoredStats: {
          users: Object.keys(parsed.users || {}).length,
          invites: Object.keys(parsed.invites || {}).length,
          sources: Object.keys(parsed.globalSources || {}).length,
          userConfigs: Object.keys(parsed.userConfigs || {}).length,
        },
        gistUrl: `https://gist.github.com/${gistId}`,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    backupState.lastStatus = 'error';
    backupState.lastError = msg;
    console.error('[Gist Backup] 容灾恢复失败:', msg);
    return { success: false, error: msg };
  }
}
