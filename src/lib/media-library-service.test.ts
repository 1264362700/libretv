import { describe, expect, it, vi } from 'vitest';
import {
  normalizeTitleForMatch,
  resolveEpisodeBadge,
  fetchDoubanCollectionItems,
  fetchTmdbClient,
  syncRecentUpdates,
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

    const mediaItem = {
      title: '庆余年 第二季',
      episodes_info: '更新至20集',
      card_subtitle: '2024 / 中国大陆 / 剧情',
    };

    const badge = resolveEpisodeBadge(mediaItem, cmsMap);
    expect(badge).toBe('更新至28集');
  });

  it('优先级 2：原生 episodes_info（无采集源更新时使用）', () => {
    const cmsMap = new Map<string, string>();
    const mediaItem = {
      title: '白夜破晓',
      episodes_info: '更新至12集',
      card_subtitle: '2024 / 中国大陆',
    };

    const badge = resolveEpisodeBadge(mediaItem, cmsMap);
    expect(badge).toBe('更新至12集');
  });

  it('优先级 3：从 card_subtitle 正则提取更新集数', () => {
    const cmsMap = new Map<string, string>();
    const mediaItem = {
      title: '凡人修仙传',
      card_subtitle: '2024 / 国产动漫 / 更新至110集',
    };

    const badge = resolveEpisodeBadge(mediaItem, cmsMap);
    expect(badge).toBe('更新至110集');
  });

  it('优先级 4：剧集无精确集数时按年份推导连载中或完结', () => {
    const cmsMap = new Map<string, string>();
    const ongoingTv = {
      title: '狂飙2',
      isTv: true,
      year: '2025',
    };
    expect(resolveEpisodeBadge(ongoingTv, cmsMap)).toBe('连载更新中');

    const completedTv = {
      title: '琅琊榜',
      isTv: true,
      year: '2015',
    };
    expect(resolveEpisodeBadge(completedTv, cmsMap)).toBe('全集完结');
  });

  it('优先级 5：电影提取年份作为兜底标签', () => {
    const cmsMap = new Map<string, string>();
    const mediaItem = {
      title: '沙丘2',
      card_subtitle: '2024 / 美国 / 科幻',
    };

    const badge = resolveEpisodeBadge(mediaItem, cmsMap);
    expect(badge).toBe('2024 · 正片');
  });

  it('无任何集数或年份信息时兜底为热播', () => {
    const cmsMap = new Map<string, string>();
    const mediaItem = {
      title: '神秘大片',
    };

    const badge = resolveEpisodeBadge(mediaItem, cmsMap);
    expect(badge).toBe('热播');
  });
});

describe('media-library-service: fetchDoubanCollectionItems', () => {
  it('全面请求 /api/media/feed 官方接口并映射为直连 MediaItem 结构', async () => {
    let capturedUrl = '';
    const mockItems = [
      {
        id: 'media_movie_693134',
        title: '沙丘2',
        cover: 'https://image.tmdb.org/t/p/w500/dune2.jpg',
        rating: '8.4',
        year: '2024',
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

    expect(capturedUrl).toContain('/api/media/feed');
    expect(capturedUrl).toContain('type=movie');
    expect(capturedUrl).toContain('sort=rank');
    expect(capturedUrl).toContain('/api/media/feed?type=movie&page=1&sort=rank');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].cover).toBe('https://image.tmdb.org/t/p/w500/dune2.jpg');
    expect(res.items[0].title).toBe('沙丘2');
    expect(res.items[0].typeName).toBe('电影');

    vi.unstubAllGlobals();
  });

  it('fetchTmdbClient 与 /api/media/feed 正确对接', async () => {
    let capturedUrl = '';
    vi.stubGlobal('fetch', (url: string | URL | Request) => {
      capturedUrl = String(url);
      return Promise.resolve(
        new Response(JSON.stringify({ items: [{ id: '1', title: '热播' }], total: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    const res = await fetchTmdbClient({ type: 'trending', page: 1 });
    expect(capturedUrl).toContain('/api/media/feed?type=trending&page=1&sort=recommend');
    expect(res.items).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});

describe('media-library-service: syncRecentUpdates', () => {
  it('使用轻量 ?ac=list 接口拉取最新集数并构造 remarksMap', async () => {
    let capturedUrl = '';
    vi.stubGlobal('fetch', (url: string | URL | Request) => {
      capturedUrl = String(url);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            code: 1,
            list: [
              { vod_id: 101, vod_name: '魔道重生的女武神', vod_remarks: '第222集' },
              { vod_id: 102, vod_name: '庆余年 第二季', vod_remarks: '全36集' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });

    const res = await syncRecentUpdates({
      key: 'test_src',
      name: '测试源',
      url: 'https://zy.example.com/api.php/provide/vod/',
    });

    const decodedTargetUrl = Buffer.from(capturedUrl.split('q=')[1] || '', 'base64').toString('utf-8');
    expect(decodedTargetUrl).toContain('ac=list&pg=1');
    expect(res.remarksMap.get('魔道重生的女武神')).toBe('第222集');
    expect(res.remarksMap.get('庆余年第二季')).toBe('全36集');
    expect(res.recentList).toHaveLength(2);

    vi.unstubAllGlobals();
  });
});
