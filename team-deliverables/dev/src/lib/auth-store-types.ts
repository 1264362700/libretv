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

export interface UserConfigRecord {
  username: string;
  customSources: unknown[];
  selectedKeys: string[];
  subscriptions: unknown[];
  updatedAt: number;
}

export interface AuthDataStore {
  adminPasswordHash?: string;
  users: Record<string, UserRecord>;
  invites: Record<string, InviteCodeRecord>;
  globalSources: Record<string, GlobalSourceRecord>;
  userConfigs?: Record<string, UserConfigRecord>;
  systemConfig?: {
    githubToken?: string;
    gistId?: string;
    updatedAt?: number;
  };
  updatedAt?: number;
}

export interface FullBackupPayload {
  version: number;
  exportedAt: number;
  meta: {
    exportedAt: number;
    usersCount: number;
    invitesCount: number;
    sourcesCount: number;
  };
  users: Record<string, UserRecord>;
  invites: Record<string, InviteCodeRecord>;
  globalSources: Record<string, GlobalSourceRecord>;
  userConfigs?: Record<string, UserConfigRecord>;
}
