import { describe, expect, it } from 'vitest';
import { CHANNELS, DRAWER_NAV, HEADER_NAV, QUICK_CHANNELS, channelHref, getChannel, isChannelType } from './channels';

describe('channels: 频道定义单一来源', () => {
  it('频道 ID 唯一且不可为空', () => {
    const ids = CHANNELS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
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
    expect(channelHref('movie_commentary')).toBe('/catalog?type=movie_commentary');
    expect(getChannel('ai_comic')?.label).toBe('AI 漫剧');
    expect(getChannel('nope')).toBeUndefined();
    expect(isChannelType('movie')).toBe(true);
    expect(isChannelType('nope')).toBe(false);
  });

  it('解说与 AI 漫剧的图标沿用各自入口原有取值（不做无意义视觉变更）', () => {
    const commentary = getChannel('movie_commentary');
    expect(commentary?.quickIcon).toBe('🎙️');
    expect(commentary?.drawerIcon).toBe('🎙️');
    const drawerEntry = DRAWER_NAV.find((n) => n.href === '/catalog?type=ai_comic');
    expect(drawerEntry?.icon).toBe('🤖');
  });
});
