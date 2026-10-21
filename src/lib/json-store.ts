import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * JSON 文件存储的基础设施（从 auth-store.ts 抽出的存储层）。
 *
 * 抽出的理由：这三件事与业务无关，但此前混在 1300 行的 auth-store 里，
 * 既难以单独测试，也让「存储层」和「用户/邀请码业务」互相纠缠。
 * 容灾三件套都在这里：
 *   1. atomicWriteJsonSync —— 临时文件 + rename，杜绝截断写入
 *   2. .prev.json 世代快照 —— 每次覆盖前滚动保留上一代
 *   3. DATA_DIR 不可写时降级到临时目录，并置 isEphemeralDir 供上层告警
 */

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
