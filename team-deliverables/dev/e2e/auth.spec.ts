import { expect, test } from '@playwright/test';
import { hasCredentials } from './helpers/env';
import { loginViaUi } from './helpers/auth';

test.describe('登录与首页', () => {
  test.skip(!hasCredentials, '未配置 E2E_PASSWORD / .env PASSWORD，跳过登录用例');

  test('未登录访问首页会被重定向到登录页', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByPlaceholder('请输入您的密码')).toBeVisible();
  });

  test('输入正确密码后登录成功并进入首页', async ({ page }) => {
    await loginViaUi(page);
    // 首页应渲染出搜索入口
    await expect(
      page.getByPlaceholder('搜索全网海量电影、电视剧、动漫、短剧...').first()
    ).toBeVisible();
  });

  test('密码错误时停留在登录页并给出提示', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('admin 或您的用户名').fill('admin');
    await page.getByPlaceholder('请输入您的密码').fill('definitely-wrong-password');
    await page.getByRole('button', { name: '立即登录' }).click();

    // 不应跳转到首页
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });
});
