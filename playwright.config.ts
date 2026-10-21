import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080';

/**
 * 端到端测试配置
 *
 * 与单元测试（vitest，src/**\/*.test.ts）完全分离：
 * - 用例放在 e2e/ 下，文件名 *.spec.ts
 * - vitest 的 include 已限定为 src/**\/*.test.ts，不会误收这里的用例
 *
 * 运行：
 *   npx playwright install chromium   # 首次需要下载浏览器
 *   npm run test:e2e
 *
 * 登录凭据从环境变量读取，优先级 E2E_USERNAME/E2E_PASSWORD > 根目录 .env 的 PASSWORD。
 * 未配置时登录相关用例会自动跳过（skip），避免本地无密码时误报失败。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // 规范要求的 375px 宽度基线
      name: 'mobile-375',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
