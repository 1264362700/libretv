import fs from 'node:fs';
import path from 'node:path';

/**
 * 读取根目录 .env（Playwright 不会像 Next 那样自动加载它）。
 * 只做最简单的 KEY=VALUE 解析，不做变量展开——够用且无额外依赖。
 */
function readEnvFile(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  } catch {
    // 没有 .env 就只用环境变量
  }
  return result;
}

const fileEnv = readEnvFile();

export const E2E_USERNAME = process.env.E2E_USERNAME ?? fileEnv.E2E_USERNAME ?? 'admin';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? fileEnv.PASSWORD ?? '';

/** 未配置密码时登录类用例应跳过，而不是失败 */
export const hasCredentials = Boolean(E2E_PASSWORD);
