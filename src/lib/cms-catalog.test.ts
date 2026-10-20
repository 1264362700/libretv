import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveCmsTypeId, extractSubCategories, fetchCmsCatalog } from './cms-catalog';
import * as fetchUtils from './fetch-utils';

describe('extractSubCategories', () => {
  it('优先通过 type_pid 抽取父分类下的所有二级子分类', () => {
    const classes = [
      { type_id: 2, type_name: '连续剧', type_pid: 0 },
      { type_id: 13, type_name: '国产剧', type_pid: 2 },
      { type_id: 14, type_name: '欧美剧', type_pid: 2 },
      { type_id: 15, type_name: '韩剧', type_pid: 2 },
      { type_id: 99, type_name: '福利伦理剧', type_pid: 2 }, // 敏感分类应被排除
      { type_id: 1, type_name: '电影', type_pid: 0 },
      { type_id: 6, type_name: '动作片', type_pid: 1 },
    ];

    const subs = extractSubCategories('tv', classes);
    expect(subs).toEqual([
      { id: 13, name: '国产剧' },
      { id: 14, name: '欧美剧' },
      { id: 15, name: '韩剧' },
    ]);
  });

  it('当源站缺少 type_pid 时通过语义关键词智能归纳子分类', () => {
    const classes = [
      { type_id: 1, type_name: '电影' },
      { type_id: 6, type_name: '动作片' },
      { type_id: 7, type_name: '喜剧片' },
      { type_id: 8, type_name: '科幻片' },
      { type_id: 10, type_name: '国产剧' },
    ];

    const subs = extractSubCategories('movie', classes);
    expect(subs).toEqual([
      { id: 6, name: '动作片' },
      { id: 7, name: '喜剧片' },
      { id: 8, name: '科幻片' },
    ]);
  });
});

describe('resolveCmsTypeId', () => {
  const classes = [
    { type_id: 1, type_name: '电影片' },
    { type_id: 2, type_name: '连续剧' },
    { type_id: 3, type_name: '综艺节目' },
    { type_id: 4, type_name: '热血动漫' },
    { type_id: 36, type_name: '爽文微短剧' },
    { type_id: 6, type_name: '动作片', type_pid: 1 },
    { type_id: 13, type_name: '国产剧', type_pid: 2 },
  ];

  it('能精准匹配电影分类', () => {
    expect(resolveCmsTypeId('movie', classes)).toBe(1);
  });

  it('能精准匹配电视剧/剧集分类', () => {
    expect(resolveCmsTypeId('tv', classes)).toBe(2);
  });

  it('能精准匹配动漫分类', () => {
    expect(resolveCmsTypeId('anime', classes)).toBe(4);
  });

  it('能精准匹配综艺分类', () => {
    expect(resolveCmsTypeId('variety', classes)).toBe(3);
  });

  it('能精准匹配微短剧分类', () => {
    expect(resolveCmsTypeId('short_drama', classes)).toBe(36);
  });

  it('全量模式返回 undefined（不传 t 参数）', () => {
    expect(resolveCmsTypeId('all', classes)).toBeUndefined();
  });

  it('列表为空时平滑回退默认标准 ID', () => {
    expect(resolveCmsTypeId('movie', [])).toBe(1);
    expect(resolveCmsTypeId('tv', [])).toBe(2);
    expect(resolveCmsTypeId('anime', [])).toBe(4);
    expect(resolveCmsTypeId('variety', [])).toBe(3);
    expect(resolveCmsTypeId('short_drama', [])).toBe(54);
  });
});

describe('fetchCmsCatalog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('非法或 SSRF 阻断的 URL 抛出异常或安全拦截', async () => {
    await expect(
      fetchCmsCatalog({
        url: 'http://127.0.0.1:8080/api.php/provide/vod',
        type: 'movie',
      })
    ).rejects.toThrow();
  });

  it('成功解析 AppleCMS 数据流，准确映射 DoubanItem 并支持 500+ 页真分页', async () => {
    const mockData = {
      code: 1,
      msg: '数据列表',
      page: 2,
      pagecount: 520,
      total: 12480,
      limit: 24,
      list: [
        {
          vod_id: 101,
          vod_name: '流浪地球3',
          vod_pic: 'http://img.example.com/p1.jpg',
          vod_remarks: '4K蓝光',
          type_name: '科幻片',
          vod_year: '2027',
        },
        {
          vod_id: 102,
          vod_name: '狂飙 第二季',
          vod_pic: 'https://img.example.com/p2.jpg',
          vod_remarks: '更新至12集',
          type_name: '国产剧',
          vod_year: '2026',
        },
        // 应该被常规频道过滤的短剧
        {
          vod_id: 103,
          vod_name: '战神归来：龙王殿下请自重',
          vod_pic: 'https://img.example.com/p3.jpg',
          vod_remarks: '全80集',
          type_name: '微短剧',
        },
        // 应该被成人过滤器剔除的内容
        {
          vod_id: 104,
          vod_name: '敏感内容',
          vod_pic: 'https://img.example.com/p4.jpg',
          type_name: '伦理片',
        },
      ],
    };

    vi.spyOn(fetchUtils, 'fetchUpstream').mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('ac=list')) {
        return Promise.resolve(
          new Response(JSON.stringify({ class: [{ type_id: 1, type_name: '电影' }] }), { status: 200 })
        );
      }
      return Promise.resolve(new Response(JSON.stringify(mockData), { status: 200 }));
    });

    const result = await fetchCmsCatalog({
      url: 'https://api.example.com/api.php/provide/vod',
      type: 'movie',
      page: 2,
      pageSize: 24,
      sourceKey: 'test_source',
      filterAdult: true,
    });

    expect(result.page).toBe(2);
    expect(result.pagecount).toBe(520);
    expect(result.total).toBe(12480);

    // 过滤了短剧与成人内容，保留 2 条正规影片
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      id: 'cms_test_source_101',
      title: '流浪地球3',
      cover: 'https://img.example.com/p1.jpg', // 自动升为 https
      rating: '4K蓝光',
      isTv: false,
    });
    expect(result.items[1].rating).toBe('更新至12集');
  });

  it('显式传入 typeId 时直接以指定细分子类参数发起请求', async () => {
    let capturedUrl = '';
    vi.spyOn(fetchUtils, 'fetchUpstream').mockImplementation((url) => {
      capturedUrl = String(url);
      if (capturedUrl.includes('ac=list')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              class: [
                { type_id: 2, type_name: '连续剧', type_pid: 0 },
                { type_id: 13, type_name: '国产剧', type_pid: 2 },
              ],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            code: 1,
            page: 1,
            pagecount: 10,
            total: 200,
            list: [{ vod_id: 999, vod_name: '山花烂漫时', vod_pic: 'https://img.com/1.jpg', vod_remarks: '全23集' }],
          }),
          { status: 200 }
        )
      );
    });

    const result = await fetchCmsCatalog({
      url: 'https://tv.example.com/api.php/provide/vod',
      type: 'tv',
      typeId: 13,
      page: 1,
    });

    expect(capturedUrl).toContain('t=13');
    expect(result.subCategories).toEqual([{ id: 13, name: '国产剧' }]);
    expect(result.items[0].title).toBe('山花烂漫时');
  });
});
