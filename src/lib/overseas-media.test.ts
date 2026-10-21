import { describe, expect, it } from 'vitest';
import {
  anilistToItem,
  cinemetaToItem,
  extractYear,
  makeOverseasId,
  normalizeAniListScore,
  normalizeGenres,
  normalizeNames,
  normalizeRating,
  parseOverseasId,
  stripHtml,
  tvmazeToItem,
} from './overseas-media';

describe('normalizeRating', () => {
  it('字符串与数字统一保留一位小数', () => {
    expect(normalizeRating('9.3')).toBe('9.3');
    expect(normalizeRating(8)).toBe('8.0');
    expect(normalizeRating(7.25)).toBe('7.3');
  });

  it('空字符串与非法值返回 undefined', () => {
    // catalog 端点的 imdbRating 常为空字符串，是首要防护点
    expect(normalizeRating('')).toBeUndefined();
    expect(normalizeRating(0)).toBeUndefined();
    expect(normalizeRating(10.5)).toBeUndefined();
    expect(normalizeRating('暂无评分')).toBeUndefined();
    expect(normalizeRating(null)).toBeUndefined();
    expect(normalizeRating(undefined)).toBeUndefined();
  });
});

describe('normalizeAniListScore', () => {
  it('0-100 制转 0-10 制', () => {
    expect(normalizeAniListScore(91)).toBe('9.1');
    expect(normalizeAniListScore(100)).toBe('10.0');
  });

  it('0 分与非法值返回 undefined', () => {
    expect(normalizeAniListScore(0)).toBeUndefined();
    expect(normalizeAniListScore(null)).toBeUndefined();
    expect(normalizeAniListScore(Number.NaN)).toBeUndefined();
  });
});

describe('extractYear', () => {
  it('从多种格式中取年份', () => {
    expect(extractYear('1994')).toBe('1994');
    expect(extractYear('2008–2013')).toBe('2008');
    expect(extractYear('2024-01-05')).toBe('2024');
  });

  it('无年份返回 undefined', () => {
    expect(extractYear('unknown')).toBeUndefined();
    expect(extractYear(2024)).toBeUndefined();
    expect(extractYear(undefined)).toBeUndefined();
  });
});

describe('normalizeGenres / normalizeNames', () => {
  it('去空、去重并保序', () => {
    expect(normalizeGenres(['Drama', 'Drama', '  ', 'Action'])).toEqual(['Drama', 'Action']);
    expect(normalizeNames(['A', 'B', 'A'])).toEqual(['A', 'B']);
  });

  it('非数组或全空返回 undefined', () => {
    expect(normalizeGenres('Drama')).toBeUndefined();
    expect(normalizeGenres([])).toBeUndefined();
    expect(normalizeNames(null)).toBeUndefined();
  });

  it('超过上限时截断', () => {
    expect(normalizeGenres(Array.from({ length: 20 }, (_, i) => `g${i}`), 5)).toHaveLength(5);
  });
});

describe('makeOverseasId / parseOverseasId', () => {
  it('统一 id 可往返解析', () => {
    const id = makeOverseasId('cinemeta', 'tt0111161');
    expect(id).toBe('cinemeta:tt0111161');
    expect(parseOverseasId(id)).toEqual({ source: 'cinemeta', sourceId: 'tt0111161' });
  });

  it('非法 id 返回 null', () => {
    expect(parseOverseasId('')).toBeNull();
    expect(parseOverseasId('nosource')).toBeNull();
    expect(parseOverseasId('cinemeta:')).toBeNull();
    expect(parseOverseasId(':tt123')).toBeNull();
    expect(parseOverseasId('CINEMETA:tt123')).toBeNull();
  });
});

describe('stripHtml', () => {
  it('去除标签与实体并压缩空白', () => {
    expect(stripHtml('<p>Hello <b>World</b></p>')).toBe('Hello World');
    expect(stripHtml('a<br/>b')).toBe('a b');
    expect(stripHtml('x &amp; y')).toBe('x y');
  });
});

describe('cinemetaToItem', () => {
  it('归一化 meta 端点的电影条目（genres 复数）', () => {
    const item = cinemetaToItem(
      {
        id: 'tt0111161',
        name: 'The Shawshank Redemption',
        poster: 'https://images.metahub.space/poster/small/tt0111161/img',
        description: 'After a banker is sentenced...',
        releaseInfo: '1994',
        imdbRating: '9.3',
        genres: ['Drama'],
        runtime: '142 min',
        director: ['Frank Darabont'],
        cast: ['Tim Robbins', 'Morgan Freeman'],
        country: 'United States',
      },
      'movie'
    );
    expect(item).toMatchObject({
      id: 'cinemeta:tt0111161',
      source: 'cinemeta',
      sourceId: 'tt0111161',
      title: 'The Shawshank Redemption',
      year: '1994',
      rating: '9.3',
      type: 'movie',
      runtime: '142 min',
      directors: ['Frank Darabont'],
      cast: ['Tim Robbins', 'Morgan Freeman'],
      country: 'United States',
    });
    expect(item?.genres).toEqual(['Drama']);
  });

  it('catalog 端点的 genre 单数字段同样要归一化', () => {
    // 只认 genres 会静默丢失类型，这是实测踩到的坑
    const item = cinemetaToItem(
      {
        imdb_id: 'tt34384900',
        name: 'Love of Your Life',
        genre: ['Drama', 'Romance'],
        released: '2026-10-14T00:00:00.000Z',
        year: '2026',
        imdbRating: '',
        runtime: '109 min',
      },
      'movie'
    );
    expect(item?.genres).toEqual(['Drama', 'Romance']);
    expect(item?.year).toBe('2026');
    expect(item?.rating).toBeUndefined();
    expect(item?.id).toBe('cinemeta:tt34384900');
  });

  it('director 为字符串时归一化为数组', () => {
    expect(cinemetaToItem({ id: 'tt1', name: 'X', director: 'Solo Director' }, 'movie')?.directors).toEqual([
      'Solo Director',
    ]);
  });

  it('缺 id 或标题返回 undefined', () => {
    expect(cinemetaToItem({ name: 'X' }, 'movie')).toBeUndefined();
    expect(cinemetaToItem({ id: 'tt1' }, 'movie')).toBeUndefined();
  });

  it('year 为数字类型时正常归一化', () => {
    expect(cinemetaToItem({ id: 'tt1', name: 'X', year: 2024 }, 'movie')?.year).toBe('2024');
  });
});

describe('tvmazeToItem', () => {
  it('归一化剧集条目，含电视台与档期', () => {
    const item = tvmazeToItem({
      id: 169,
      name: 'Breaking Bad',
      type: 'Scripted',
      language: 'English',
      genres: ['Drama', 'Crime'],
      status: 'Ended',
      averageRuntime: 60,
      premiered: '2008-01-20',
      schedule: { time: '22:00', days: ['Sunday'] },
      rating: { average: 9.2 },
      network: { name: 'AMC' },
      image: { original: 'https://static.tvmaze.com/original.jpg' },
      summary: 'A chemistry teacher...',
    });
    expect(item).toMatchObject({
      id: 'tvmaze:169',
      source: 'tvmaze',
      sourceId: '169',
      title: 'Breaking Bad',
      year: '2008',
      rating: '9.2',
      type: 'series',
      runtime: '60 min',
      status: 'Ended',
      network: 'AMC',
      language: 'English',
    });
  });

  it('webChannel 可作为电视台回退', () => {
    expect(tvmazeToItem({ id: 2, name: 'Y', webChannel: { name: 'BBC' } })?.network).toBe('BBC');
  });

  it('非法 id 或缺标题返回 undefined', () => {
    // TVMaze show id 从 1 开始，0 与负数均非法
    expect(tvmazeToItem({ id: 0, name: 'X' })).toBeUndefined();
    expect(tvmazeToItem({ id: -1, name: 'X' })).toBeUndefined();
    expect(tvmazeToItem({ id: 1 })).toBeUndefined();
    expect(tvmazeToItem({} as never)).toBeUndefined();
  });
});

describe('anilistToItem', () => {
  it('归一化动漫条目，评分转为 0-10 制', () => {
    const item = anilistToItem({
      id: 154587,
      title: { romaji: 'Sousou no Frieren', english: 'Frieren: Beyond Journey' },
      description: '<p>After the party...</p>',
      coverImage: { large: 'https://s4.anilist.co/cover.jpg' },
      averageScore: 91,
      genres: ['Adventure', 'Drama'],
      status: 'FINISHED',
      startDate: { year: 2023 },
      duration: 24,
      countryOfOrigin: 'JP',
    });
    expect(item).toMatchObject({
      id: 'anilist:154587',
      source: 'anilist',
      sourceId: '154587',
      title: 'Frieren: Beyond Journey',
      originalTitle: 'Sousou no Frieren',
      rating: '9.1',
      year: '2023',
      type: 'anime',
      status: 'FINISHED',
      runtime: '24 min',
      country: 'JP',
    });
    expect(item?.description).toBe('After the party...');
    expect(item?.genres).toEqual(['Adventure', 'Drama']);
  });

  it('缺 id 或无任何标题返回 undefined', () => {
    expect(anilistToItem({ title: { romaji: 'X' } })).toBeUndefined();
    expect(anilistToItem({ id: 1, title: {} })).toBeUndefined();
  });

  it('仅 native 标题时可回退', () => {
    expect(anilistToItem({ id: 2, title: { native: 'ネイティブ' } })?.title).toBe('ネイティブ');
  });
});

describe('纯函数确定性', () => {
  it('相同入参产出相同结果（适配层不引入随机性）', () => {
    const raw = { id: 'tt1', name: 'Same', imdbRating: 7.5 };
    expect(cinemetaToItem(raw, 'movie')).toEqual(cinemetaToItem(raw, 'movie'));
    const show = { id: 5, name: 'Show', rating: { average: 8 } };
    expect(tvmazeToItem(show)).toEqual(tvmazeToItem(show));
  });
});
