import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTmdbCatalog, getTmdbApiKey, mapTmdbItem } from './tmdb';

const originalKey = process.env.TMDB_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = originalKey;
  vi.unstubAllGlobals();
});

describe('tmdb: 环境变量与实体映射', () => {
  it('优先从环境变量读取 TMDB_API_KEY', () => {
    process.env.TMDB_API_KEY = '  test_env_key_123  ';
    expect(getTmdbApiKey()).toBe('test_env_key_123');
  });

  it('mapTmdbItem 生成包含 4K backdrop 与评分的标准结构', () => {
    const mapped = mapTmdbItem(
      {
        id: 693134,
        title: '沙丘2',
        poster_path: '/dune2_poster.jpg',
        backdrop_path: '/dune2_backdrop_4k.jpg',
        vote_average: 8.42,
        release_date: '2024-02-27',
        genre_ids: [878, 12],
        overview: '保罗·厄崔迪与弗雷曼人联手展开复仇。',
      },
      'movie',
      '美国',
      0
    );

    expect(mapped.id).toBe('tmdb_693134');
    expect(mapped.title).toBe('沙丘2');
    expect(mapped.cover).toBe('https://image.tmdb.org/t/p/w500/dune2_poster.jpg');
    expect(mapped.backdrop).toBe('https://image.tmdb.org/t/p/original/dune2_backdrop_4k.jpg');
    expect(mapped.rating).toBe('8.4');
    expect(mapped.year).toBe('2024');
    expect(mapped.episodes_info).toBe('科幻');
    expect(mapped.hotRank).toBe(1);
  });

  it('fetchTmdbCatalog 支持类型、地区、年份、排序四维筛选参数拼接', async () => {
    process.env.TMDB_API_KEY = 'unit_test_key';
    let requestedUrl = '';

    vi.stubGlobal('fetch', (url: string | URL | Request) => {
      requestedUrl = String(url);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                id: 101,
                title: '星际穿越',
                poster_path: '/interstellar.jpg',
                backdrop_path: '/interstellar_bg.jpg',
                vote_average: 8.7,
                release_date: '2024-05-01',
                genre_ids: [878],
              },
            ],
            total_pages: 12,
            total_results: 240,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });

    const result = await fetchTmdbCatalog({
      type: 'movie',
      genre: '科幻',
      area: '美国',
      year: '2024',
      sort: 'rank',
      page: 2,
    });

    expect(requestedUrl).toContain('/discover/movie');
    expect(requestedUrl).toContain('api_key=unit_test_key');
    expect(requestedUrl).toContain('with_genres=878');
    expect(requestedUrl).toContain('with_origin_country=US');
    expect(requestedUrl).toContain('primary_release_year=2024');
    expect(requestedUrl).toContain('sort_by=vote_average.desc');
    expect(requestedUrl).toContain('page=2');
    expect(result.items).toHaveLength(1);
    expect(result.totalPages).toBe(12);
    expect(result.total).toBe(240);
  });
});
