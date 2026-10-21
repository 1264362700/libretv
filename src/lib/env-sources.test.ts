import { afterEach, describe, expect, it } from 'vitest';
import { getEnvSources } from './env-sources';
import { CUSTOMER_SOURCES_LIST } from './customer-sites';

const ORIG_DEFAULT_SOURCES = process.env.DEFAULT_SOURCES;
const ORIG_USE_BUILTIN = process.env.USE_BUILTIN_SOURCES;

afterEach(() => {
  if (ORIG_DEFAULT_SOURCES === undefined) delete process.env.DEFAULT_SOURCES;
  else process.env.DEFAULT_SOURCES = ORIG_DEFAULT_SOURCES;
  if (ORIG_USE_BUILTIN === undefined) delete process.env.USE_BUILTIN_SOURCES;
  else process.env.USE_BUILTIN_SOURCES = ORIG_USE_BUILTIN;
});

describe('getEnvSources', () => {
  it('USE_BUILTIN_SOURCES=1 时强制返回内置源，忽略 DEFAULT_SOURCES', () => {
    process.env.DEFAULT_SOURCES = JSON.stringify([
      { name: '自定义源', url: 'https://example.com/api.php/provide/vod' },
    ]);
    process.env.USE_BUILTIN_SOURCES = '1';

    const list = getEnvSources();
    expect(list).toEqual(CUSTOMER_SOURCES_LIST);
    // 内置源 key 是有意义的英文名，不是 env_序号
    expect(list.some((s) => s.key.startsWith('env_'))).toBe(false);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.name && s.url)).toBe(true);
  });

  it('未开启开关时仍按 DEFAULT_SOURCES 生成 env_序号 key', () => {
    delete process.env.USE_BUILTIN_SOURCES;
    process.env.DEFAULT_SOURCES = JSON.stringify([
      { name: '甲源', url: 'https://a.example.com/api.php/provide/vod' },
      { name: '乙源', url: 'https://b.example.com/api.php/provide/vod' },
    ]);

    const list = getEnvSources();
    expect(list.map((s) => s.key)).toEqual(['env_0', 'env_1']);
    expect(list.map((s) => s.name)).toEqual(['甲源', '乙源']);
  });

  it('未配置 DEFAULT_SOURCES 时返回内置源', () => {
    delete process.env.DEFAULT_SOURCES;
    delete process.env.USE_BUILTIN_SOURCES;
    expect(getEnvSources()).toEqual(CUSTOMER_SOURCES_LIST);
  });

  it('DEFAULT_SOURCES 为空串时返回内置源', () => {
    delete process.env.USE_BUILTIN_SOURCES;
    process.env.DEFAULT_SOURCES = '   ';
    expect(getEnvSources()).toEqual(CUSTOMER_SOURCES_LIST);
  });

  it('DEFAULT_SOURCES 非法 JSON 时兜底内置源', () => {
    delete process.env.USE_BUILTIN_SOURCES;
    process.env.DEFAULT_SOURCES = '{ 不是数组';
    expect(getEnvSources()).toEqual(CUSTOMER_SOURCES_LIST);
  });

  it('开关取值非 1 时不生效，仍读 DEFAULT_SOURCES', () => {
    process.env.USE_BUILTIN_SOURCES = 'true';
    process.env.DEFAULT_SOURCES = JSON.stringify([
      { name: '甲源', url: 'https://a.example.com/api.php/provide/vod' },
    ]);
    expect(getEnvSources().map((s) => s.key)).toEqual(['env_0']);
  });

  it('内置源全部具备可用的 name 与 url', () => {
    delete process.env.USE_BUILTIN_SOURCES;
    delete process.env.DEFAULT_SOURCES;
    const list = getEnvSources();
    expect(list.length).toBe(76);
    for (const s of list) {
      expect(s.key).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.url).toMatch(/^https?:\/\//);
    }
  });
});
