/**
 * GitHub 私有 Gist 云端持久化引擎
 * 针对 Render/Vercel 等无状态云容器，通过 GitHub Gist API 实现全自动无感云端持久化
 */

export interface GistSyncState {
  enabled: boolean;
  gistId: string | null;
  gistUrl: string | null;
  lastSyncAt: number | null;
  lastAction: 'pull' | 'push' | 'idle' | 'error';
  lastError: string | null;
}

const GIST_FILENAME = 'cl-tv-auth-store.json';
const GIST_DESC = '[cl.tv] Auth Data Store (Permanent Cloud Backup)';

const state: GistSyncState = {
  enabled: false,
  gistId: null,
  gistUrl: null,
  lastSyncAt: null,
  lastAction: 'idle',
  lastError: null,
};

let resolvedGistId: string | null = null;
let pushTimer: NodeJS.Timeout | null = null;
let pendingStoreToPush: unknown = null;
let isPushing = false;

function getToken(): string | null {
  const t = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  return t || null;
}

function getEnvGistId(): string | null {
  const id = process.env.GIST_ID?.trim();
  return id || null;
}

export function getGistSyncState(): GistSyncState {
  const token = getToken();
  return {
    ...state,
    enabled: Boolean(token),
    gistId: resolvedGistId || getEnvGistId(),
    gistUrl: resolvedGistId ? `https://gist.github.com/${resolvedGistId}` : null,
  };
}

/**
 * 自动探测或创建专属于 cl.tv 的私有 Gist
 */
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
    'User-Agent': 'LibreTV-cl.tv-GistSync',
  };

  try {
    // 1. 查询当前用户的 Gist 列表，查找是否已经存在 cl-tv 的专属备份
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
          g.description?.includes('cl.tv Auth Data Store')
      );

      if (existing) {
        resolvedGistId = existing.id;
        console.log(`[LibreTV] 自动定位到现有私有 Gist 云存储: ${existing.id}`);
        return existing.id;
      }
    }

    // 2. 若尚未创建，自动为您新建一个私有 (Secret) Gist
    console.log('[LibreTV] 正在自动为您在 GitHub 上创建专属私有 Gist 云存储...');
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
            content: JSON.stringify(initialData || {}, null, 2),
          },
        },
      }),
    });

    if (createRes.ok) {
      const created = (await createRes.json()) as { id: string; html_url?: string };
      resolvedGistId = created.id;
      console.log(`[LibreTV] 成功创建私有 Gist 云存储! ID: ${created.id}`);
      return created.id;
    } else {
      const errText = await createRes.text();
      throw new Error(`创建 Gist 失败 (HTTP ${createRes.status}): ${errText}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastError = msg;
    state.lastAction = 'error';
    console.error('[LibreTV] Gist 自动发现/创建异常:', err);
    throw err;
  }
}

/**
 * 从 GitHub Gist 拉取全量云端数据
 */
export async function pullFromGist(fallbackLocalStore?: unknown): Promise<Record<string, unknown> | null> {
  const token = getToken();
  if (!token) return null;

  try {
    state.lastAction = 'pull';
    const gistId = await resolveOrCreateGistId(token, fallbackLocalStore);
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'LibreTV-cl.tv-GistSync',
    };

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`拉取 Gist 失败 (HTTP ${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      id: string;
      files: Record<string, { filename: string; content?: string; truncated?: boolean; raw_url?: string }>;
    };

    const targetFile = data.files?.[GIST_FILENAME] || data.files?.['auth-store.json'];
    if (!targetFile) {
      console.warn(`[LibreTV] Gist ${gistId} 中尚未包含 ${GIST_FILENAME}，将写入初始数据`);
      return null;
    }

    let jsonContent = targetFile.content;
    if (targetFile.truncated && targetFile.raw_url) {
      const rawRes = await fetch(targetFile.raw_url, { headers });
      if (rawRes.ok) jsonContent = await rawRes.text();
    }

    if (!jsonContent || !jsonContent.trim()) return null;

    const parsed = JSON.parse(jsonContent) as Record<string, unknown>;
    state.lastSyncAt = Date.now();
    state.lastAction = 'idle';
    state.lastError = null;
    console.log(`[LibreTV] 成功从 GitHub Gist (${gistId}) 恢复全量账号与邀请码数据!`);
    return parsed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastError = msg;
    state.lastAction = 'error';
    console.error('[LibreTV] 从 Gist 拉取数据失败 (平滑降级使用本地存储):', err);
    return null;
  }
}

/**
 * 异步回写数据到 GitHub Gist（带防抖，毫秒级静默持久化）
 */
export function schedulePushToGist(store: unknown): void {
  const token = getToken();
  if (!token) return;

  pendingStoreToPush = store;
  if (pushTimer) clearTimeout(pushTimer);

  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (pendingStoreToPush) {
      const payload = pendingStoreToPush;
      pendingStoreToPush = null;
      executePush(token, payload).catch((e) => {
        console.error('[LibreTV] 异步回写 Gist 发生未捕获异常:', e);
      });
    }
  }, 600);
}

async function executePush(token: string, store: unknown): Promise<boolean> {
  if (isPushing) {
    // 若当前正在推送，等下次调度
    schedulePushToGist(store);
    return false;
  }

  isPushing = true;
  state.lastAction = 'push';
  try {
    const gistId = await resolveOrCreateGistId(token, store);
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'LibreTV-cl.tv-GistSync',
    };

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        description: GIST_DESC,
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(store, null, 2),
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`回写 Gist 失败 (HTTP ${res.status}): ${errText}`);
    }

    state.lastSyncAt = Date.now();
    state.lastAction = 'idle';
    state.lastError = null;
    console.log(`[LibreTV] 成功回写数据至 GitHub Gist (${gistId})，云端已同步!`);
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastError = msg;
    state.lastAction = 'error';
    console.error('[LibreTV] 回写 GitHub Gist 失败 (已保留本地磁盘数据):', err);
    return false;
  } finally {
    isPushing = false;
  }
}

/**
 * 立即强制推送到 Gist（管理后台手动触发）
 */
export async function forcePushToGist(store: unknown): Promise<{ success: boolean; error?: string }> {
  const token = getToken();
  if (!token) return { success: false, error: '未配置 GITHUB_TOKEN' };

  try {
    const ok = await executePush(token, store);
    return { success: ok, error: state.lastError || undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
