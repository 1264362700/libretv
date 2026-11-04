/** 管理后台共享的数据形状（从 admin-modal.tsx 抽出，供各标签页复用） */

export interface StorageDiagnostics {
  dataDir: string;
  isPersistentMounted: boolean;
  storePath: string;
  exists: boolean;
  storeSize: number;
  userCount: number;
  inviteCount: number;
  globalSourceCount: number;
  userConfigsCount?: number;
  hasCustomGithubToken: boolean;
  gistConfigured: boolean;
  lastModified: number;
  database?: {
    type: string;
    configured: boolean;
  };
  superAdminUsername?: string;
  isDefaultPassword?: boolean;
}

export interface NeonStatus {
  configured: boolean;
  ok: boolean;
  latencyMs?: number;
  error?: string;
  tableCounts?: {
    users: number;
    invites: number;
    globalSources: number;
    userConfigs: number;
  };
}

export interface GistStatus {
  enabled: boolean;
  gistId: string | null;
  gistUrl: string | null;
  lastSyncAt: number | null;
  lastAction: 'pull' | 'push' | 'idle' | 'error';
  lastError: string | null;
}

export interface SourcesBackupInfo {
  exists: boolean;
  path: string;
  count: number;
  updatedAt?: number;
}
