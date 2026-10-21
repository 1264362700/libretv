import { describe, expect, it, vi } from 'vitest';
import {
  normalizeTitleForMatch,
  resolveEpisodeBadge,
  fetchDoubanCollectionItems,
} from './media-library-service';

describe('media-library-service: normalizeTitleForMatch', () => {
  it('剥离空格、标点符号与特殊括号', () => {
    expect(normalizeTitleForMatch('庆余年 第二季')).toBe('庆余年第二季');
    expect(normalizeTitleForMatch('三体 (剧版)')).toBe('三体剧版');
    expect(normalizeTitleForMatch('【4K】流浪地球2：飞跃巅峰')).toBe('4k流浪地球2飞跃巅峰');
  });
});

describe('media-library-service: resolveEpisodeBadge 集数角标优先级', () => {
  it('优先级 1：主力采集源备注（最精准，优先命中）', () => {
    const cmsMap = new Map<string, string>([
      ['庆余年第二季', '更新至28集'],
      ['繁花', '全30集'],
    ]);

    const doubanItem = {
      title: '庆余年 第二季',
      episodes_info: '更新至20集', // 豆瓣可能滞后
      card_subtitle: '2024 / 中国大陆 / 剧情',
    };

    const badge = resolveEpisodeBadge(doubanItem, cmsMap);
    expect(badge).toBe('更新至28集');
  });

  it('优先级 2：豆瓣原生 episodes_info（无采集源更新时使用）', () => {
    const cmsMap = new Map<string, string>();
    const doubanItem = {
      title: '白夜破晓',
      episodes_info: '更新至12集',
      card_subtitle: '2024 / 中国大陆',
    };

    const badge = resolveEpisodeBadge(doubanItem, cmsMap);
    expect(badge).toBe('更新至12集');
  });

  it('优先级 3：从 card_subtitle 正则提取更新集数', () => {
    const cmsMap = new Map<string, string>();
    const doubanItem = {
      title: '凡人修仙传',
      card_subtitle: '2024 / 国产动漫 / 更新至110集',
    };

    const badge = resolveEpisodeBadge(doubanItem, cmsMap);
    expect(badge).toBe('更新至110集');
  });

  it('优先级 4：电影提取年份作为兜底标签', () => {
    const cmsMap = new Map<string, string>();
    const doubanItem = {
      title: '沙丘2',
      card_subtitle: '2024 / 美国 / 科幻',
    };

    const badge = resolveEpisodeBadge(doubanItem, cmsMap);
    expect(badge).toBe('2024 · 正片');
  });

  it('无任何集数或年份信息时兜底为热播', () => {
    const cmsMap = new Map<string, string>();
    const doubanItem = {
      title: '神秘大片',
    };

    const badge = resolveEpisodeBadge(doubanItem, cmsMap);
    expect(badge).toBe('热播');
  });
});

describe('media-library-service: fetchDoubanCollectionItems', () => {
  it('全面请求 /api/douban 开放图床并映射为直连 MediaItem 结构', async () => {
    let capturedUrl = '';
    const mockItems = [
      {
        id: '360_test_101',
        title: '抓特务',
        cover: 'https://p0.qhimg.com/d/dy_180dbcd5a8635102d926f6387993700e.jpg',
        rating: '7.8',
        year: '2026',
      },
    ];

    vi.stubGlobal('fetch', (url: string | URL | Request) => {
      capturedUrl = String(url);
      return Promise.resolve(
        new Response(JSON.stringify({ items: mockItems, total: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    const res = await fetchDoubanCollectionItems('movie_top250', 0, 14);

    expect(capturedUrl).toContain('/api/douban');
    expect(capturedUrl).toContain('type=movie');
    expect(capturedUrl).toContain('sort=rank');
    expect(capturedUrl).toContain('pageSize=14');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].cover).toBe('https://p0.qhimg.com/d/dy_180dbcd5a8635102d926f6387993700e.jpg');
    expect(res.items[0].title).toBe('抓特务');
    expect(res.items[0].typeName).toBe('电影');

    vi.unstubAllGlobals();
  });
});
