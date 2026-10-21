import { expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERNAME } from './env';

/**
 * 走真实登录页完成登录并校验已跳转到首页。
 *
 * 选择器不依赖 class（class 由 Tailwind 生成、易随样式改动变化），
 * 只用 placeholder / aria / type 这类与语义绑定的属性。
 */
export async function loginViaUi(page: Page): Promise<void> {
  await page.goto('/login');
  await expect(page.getByPlaceholder('admin 或您的用户名')).toBeVisible();

  await page.getByPlaceholder('admin 或您的用户名').fill(E2E_USERNAME);
  await page.getByPlaceholder('请输入您的密码').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: '立即登录' }).click();

  // 登录成功后回到首页
  await expect(page).toHaveURL(/\/(?:\?.*)?$/);
}

/** 已登录状态下再访问时的兜底：若被踢回登录页则重新登录一次 */
export async function ensureLoggedIn(page: Page): Promise<void> {
  await page.goto('/');
  if (page.url().includes('/login')) {
    await loginViaUi(page);
  }
}
