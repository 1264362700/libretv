import { describe, expect, it } from 'vitest';
import {
  cleanSearchKeyword,
  matchAndScoreVodItem,
  parseEpisodesFromVod,
} from './stream-source-matcher';

describe('stream-source-matcher: cleanSearchKeyword', () => {
  it('正确解析中文季数并提取主标题', () => {
    const res1 = cleanSearchKeyword('庆余年 第二季');
    expect(res1.cleanTitle).toBe('庆余年');
    expect(res1.season).toBe(2);

    const res2 = cleanSearchKeyword('长相思 第2季');
    expect(res2.cleanTitle).toBe('长相思');
    expect(res2.season).toBe(2);

    const res3 = cleanSearchKeyword('大江大河 第两部');
    expect(res3.cleanTitle).toBe('大江大河');
    expect(res3.season).toBe(2);
  });

  it('正确解析英文与缩写季数', () => {
    const res1 = cleanSearchKeyword('Stranger Things Season 4');
    expect(res1.cleanTitle).toBe('Stranger Things');
    expect(res1.season).toBe(4);

    const res2 = cleanSearchKeyword('The Boys S03');
    expect(res2.cleanTitle).toBe('The Boys');
    expect(res2.season).toBe(3);
  });

  it('剥离副标题与特殊标点', () => {
    const res = cleanSearchKeyword('流浪地球2：飞跃巅峰（抢先版）[国语]');
    expect(res.cleanTitle).toBe('流浪地球2');
  });

  it('无季数时默认 season 为 1', () => {
    const res = cleanSearchKeyword('肖申克的救赎');
    expect(res.cleanTitle).toBe('肖申克的救赎');
    expect(res.season).toBe(1);
  });
});

describe('stream-source-matcher: matchAndScoreVodItem 防串片打分', () => {
  const target = {
    title: '庆余年 第二季',
    cleanTitle: '庆余年',
    season: 2,
    doubanId: '34894245',
    year: '2024',
  };

  it('豆瓣 ID 强匹配直接判定 100 分', () => {
    const item = {
      vod_name: '庆余年 第二季 4K',
      vod_douban_id: '34894245',
      vod_year: '2024',
    };
    const score = matchAndScoreVodItem(target, item);
    expect(score).toBe(100);
  });

  it('季数冲突一票否决淘汰为 0 分', () => {
    // 目标找第 2 季，但采集源返回第 1 季
    const item = {
      vod_name: '庆余年 第一季',
      vod_year: '2019',
    };
    const score = matchAndScoreVodItem(target, item);
    expect(score).toBe(0);
  });

  it('解说/花絮/预告一票否决淘汰为 0 分', () => {
    const item1 = {
      vod_name: '庆余年 第二季 全集解说',
      vod_year: '2024',
    };
    expect(matchAndScoreVodItem(target, item1)).toBe(0);

    const item2 = {
      vod_name: '庆余年 第二季 独家花絮特辑',
      vod_year: '2024',
    };
    expect(matchAndScoreVodItem(target, item2)).toBe(0);
  });

  it('片名季数匹配且年份一致获得高分 (>= 90分)', () => {
    const item = {
      vod_name: '庆余年 第二季',
      vod_year: '2024',
    };
    const score = matchAndScoreVodItem(target, item);
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it('年份相差 3 年以上重罚扣分', () => {
    const item = {
      vod_name: '庆余年 第二季',
      vod_year: '2018',
    };
    const score = matchAndScoreVodItem(target, item);
    expect(score).toBeLessThan(60);
  });
});

describe('stream-source-matcher: parseEpisodesFromVod', () => {
  it('优先选择包含 m3u8 的播放线路', () => {
    const item = {
      vod_play_url:
        '第01集$https://web.share/1.html#第02集$https://web.share/2.html$$$第01集$https://cdn.com/1.m3u8#第02集$https://cdn.com/2.m3u8',
    };
    const episodes = parseEpisodesFromVod(item);
    expect(episodes.length).toBe(2);
    expect(episodes[0].url).toBe('https://cdn.com/1.m3u8');
    expect(episodes[0].name).toBe('第01集');
  });
});
