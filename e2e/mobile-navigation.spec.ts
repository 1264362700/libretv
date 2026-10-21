import { expect, test } from '@playwright/test';
import { hasCredentials } from './helpers/env';
import { loginViaUi } from './helpers/auth';

/**
 * 375px 宽度下的移动端回归：规范只要求覆盖 375px 这一条基线，
 * 因此这些用例只在 mobile-375 项目下运行。
 */
test.describe('375px 移动端导航', () => {
  test.skip(!hasCredentials, '未配置 E2E_PASSWORD / .env PASSWORD，跳过移动端用例');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-375', '仅 375px 项目执行');
    await page.setViewportSize({ width: 375, height: 812 });
    await loginViaUi(page);
  });

  test('页面无横向溢出', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    // 允许 1px 以内的取整误差
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('可打开侧边导航并访问片库', async ({ page }) => {
    await page.goto('/');
    const menuButton = page.getByRole('button', { name: '打开侧边导航' });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    // 侧栏里应能进入片库大厅
    const catalogLink = page.locator('a[href*="/catalog"]').first();
    await expect(catalogLink).toBeVisible();
    await catalogLink.click();
    await expect(page).toHaveURL(/\/catalog/);
  });

  test('片库页在 375px 下同样无横向溢出', async ({ page }) => {
    await page.goto('/catalog?type=movie_commentary');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
