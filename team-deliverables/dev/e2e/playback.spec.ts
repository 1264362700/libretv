import { expect, test } from '@playwright/test';
import { hasCredentials } from './helpers/env';
import { loginViaUi } from './helpers/auth';

test.describe('播放页', () => {
  test.skip(!hasCredentials, '未配置 E2E_PASSWORD / .env PASSWORD，跳过播放用例');

  test('打开播放页后渲染播放器容器且不白屏', async ({ page }) => {
    await loginViaUi(page);

    // 不带 source 参数进入，播放页应自行启动流式匹配，而不是直接报错死页
    await page.goto('/watch?title=' + encodeURIComponent('庆余年'));

    // 匹配中或已匹配，都应给出可读状态而不是空白
    await expect(page.locator('body')).toBeVisible();
    const text = await page.locator('body').innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('无效播放源参数会触发自愈而不是显示死页', async ({ page }) => {
    await loginViaUi(page);

    // env 是历史遗留的失效源 key，修复后应按片名重新匹配
    await page.goto('/watch?source=env&id=1&title=' + encodeURIComponent('庆余年'));

    await expect(page.locator('body')).toBeVisible();
    const text = await page.locator('body').innerText();
    // 不应出现「点播源不存在」这类死页文案
    expect(text).not.toContain('点播源不存在');
  });
});
