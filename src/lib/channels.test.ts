import { describe, expect, it } from 'vitest';
import { CHANNELS, DRAWER_NAV, HEADER_NAV, QUICK_CHANNELS, channelHref, getChannel, isChannelType } from './channels';

describe('channels: 频道定义单一来源', () => {
  it('频道 ID 唯一且仅保留五大核心频道（无短剧/AI漫剧/影视解说）', () => {
    const ids = CHANNELS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['movie', 'tv', 'anime', 'variety', 'documentary']);
  });

  it('每个频道的筛选条件都以「全部」打头', () => {
    for (const c of CHANNELS) {
      expect(c.regions[0], `${c.id} regions`).toBe('全部');
      expect(c.genres[0], `${c.id} genres`).toBe('全部');
    }
  });

  it('三个导航入口覆盖全部频道，不会漏配', () => {
    for (const c of CHANNELS) {
      const href = channelHref(c.id);
      expect(HEADER_NAV.some((n) => n.href === href), `顶栏缺 ${c.id}`).toBe(true);
      expect(DRAWER_NAV.some((n) => n.href === href), `抽屉缺 ${c.id}`).toBe(true);
      expect(QUICK_CHANNELS.some((n) => n.href === href), `快捷弹窗缺 ${c.id}`).toBe(true);
    }
  });

  it('导航项数量为频道数 + 固定项（顶栏 +2、抽屉 +3、快捷 +1）', () => {
    expect(HEADER_NAV.length).toBe(CHANNELS.length + 2);
    expect(DRAWER_NAV.length).toBe(CHANNELS.length + 3);
    expect(QUICK_CHANNELS.length).toBe(CHANNELS.length + 1);
  });

  it('顶栏导航以首页开头、直播结尾', () => {
    expect(HEADER_NAV[0].href).toBe('/');
    expect(HEADER_NAV[HEADER_NAV.length - 1].href).toBe('/live');
  });

  it('channelHref / getChannel / isChannelType 行为一致', () => {
    expect(channelHref('movie')).toBe('/catalog?type=movie');
    expect(getChannel('tv')?.label).toBe('电视剧');
    expect(getChannel('short_drama')).toBeUndefined();
    expect(getChannel('ai_comic')).toBeUndefined();
    expect(getChannel('movie_commentary')).toBeUndefined();
    expect(isChannelType('movie')).toBe(true);
    expect(isChannelType('short_drama')).toBe(false);
  });
});
