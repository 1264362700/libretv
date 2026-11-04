import { expect, test } from '@playwright/test';
import { hasCredentials } from './helpers/env';
import { loginViaUi } from './helpers/auth';

const KEYWORD = '庆余年';

test.describe('搜索与详情', () => {
  test.skip(!hasCredentials, '未配置 E2E_PASSWORD / .env PASSWORD，跳过搜索用例');

  test('首页搜索框输入关键词后跳转到搜索结果页', async ({ page }) => {
    await loginViaUi(page);

    const searchBox = page.getByPlaceholder('搜索全网海量电影、电视剧、动漫、短剧...').first();
    await searchBox.fill(KEYWORD);
    await searchBox.press('Enter');

    await expect(page).toHaveURL(/\/search|wd=|q=/);
  });

  test('搜索结果页展示卡片，点击可进入播放页', async ({ page }) => {
    await loginViaUi(page);

    await page.goto(`/search?wd=${encodeURIComponent(KEYWORD)}`);

    // 结果可能为空（依赖外部采集站可用性），为空时不应崩溃而要给出提示
    const cards = page.locator('a[href*="/watch"]');
    const count = await cards.count();

    if (count === 0) {
      // 外部源不可用时，确认页面本身仍然正常渲染（没有白屏 / 500）
      await expect(page.locator('body')).toBeVisible();
      const text = await page.locator('body').innerText();
      expect(text.trim().length).toBeGreaterThan(0);
      return;
    }

    await cards.first().click();
    await expect(page).toHaveURL(/\/watch/);
  });
});
