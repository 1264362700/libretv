import { describe, expect, it } from 'vitest';
import { baiduTeleplayToItem, doubanWeeklyToItem, isHotListId, isShortDramaTitle } from './douban-weekly';

describe('isHotListId', () => {
  it('白名单校验', () => {
    expect(isHotListId('douban_movie_weekly')).toBe(true);
    expect(isHotListId('baidu_teleplay')).toBe(true);
    expect(isHotListId('iqiyi_tv')).toBe(true);
    expect(isHotListId('iqiyi_movie')).toBe(true);
    expect(isHotListId('short_drama')).toBe(true);
    expect(isHotListId('maoyan')).toBe(false);
    expect(isHotListId('')).toBe(false);
  });
});

describe('isShortDramaTitle', () => {
  it('准确识别微短剧并放行常规正剧', () => {
    // 典型短剧
    expect(isShortDramaTitle('战神归来：龙王殿下请自重')).toBe(true);
    expect(isShortDramaTitle('闪婚总裁的替嫁娇妻')).toBe(true);
    expect(isShortDramaTitle('重生之真假千金微短剧')).toBe(true);
    expect(isShortDramaTitle('无双神医下山（全80集）')).toBe(true);
    expect(isShortDramaTitle('开局觉醒至尊修罗令')).toBe(true);
    expect(isShortDramaTitle('顾总的掌心宝')).toBe(true);

    // 常规电影与电视剧应放行
    expect(isShortDramaTitle('流浪地球2')).toBe(false);
    expect(isShortDramaTitle('狂飙')).toBe(false);
    expect(isShortDramaTitle('漫长的季节')).toBe(false);
    expect(isShortDramaTitle('肖申克的救赎')).toBe(false);
    expect(isShortDramaTitle('庆余年 第二季')).toBe(false);
    expect(isShortDramaTitle('凡人修仙传')).toBe(false);
  });
});

describe('doubanWeeklyToItem', () => {
  it('评分、封面（原生地址优先）、isTv 正确映射', () => {
    const item = doubanWeeklyToItem(
      {
        id: 36808876,
        title: '奥德赛',
        rating: 8.6,
        cover_proxy: 'https://doubanio.viki.moe/view/photo/p1.jpg',
        cover: 'https://img9.doubanio.com/view/photo/p1.jpg',
      },
      false
    );
    // 原生 doubanio 地址命中图片代理白名单并带 Referer 伪装，优先于 cover_proxy 镜像
    expect(item).toEqual({
      id: '36808876',
      title: '奥德赛',
      cover: 'https://img9.doubanio.com/view/photo/p1.jpg',
      rating: '8.6',
      isTv: false,
    });
  });

  it('原生 cover 缺失时回退 cover_proxy，0 分不输出 rating', () => {
    const item = doubanWeeklyToItem(
      { id: 2, title: 'y', cover_proxy: 'https://doubanio.viki.moe/view/photo/p2.jpg' },
      true
    );
    expect(item).toMatchObject({ cover: 'https://doubanio.viki.moe/view/photo/p2.jpg', isTv: true });
    const zero = doubanWeeklyToItem({ id: 1, title: 'x', cover: 'c', rating: 0 }, true);
    expect(zero).toMatchObject({ cover: 'c', isTv: true });
    expect(zero?.rating).toBeUndefined();
  });

  it('缺 id、标题或封面的脏数据丢弃', () => {
    expect(doubanWeeklyToItem({ title: 'x', cover: 'c' }, false)).toBeUndefined();
    expect(doubanWeeklyToItem({ id: 1, cover: 'c' }, false)).toBeUndefined();
    expect(doubanWeeklyToItem({ id: 1, title: 'x' }, false)).toBeUndefined();
  });
});

describe('baiduTeleplayToItem', () => {
  it('用序号生成 id，不输出 rating', () => {
    expect(baiduTeleplayToItem({ title: '某剧', cover: 'https://img.example/1.jpg' }, 3)).toEqual({
      id: 'baidu_3',
      title: '某剧',
      cover: 'https://img.example/1.jpg',
      isTv: true,
    });
  });

  it('无海报条目丢弃', () => {
    expect(baiduTeleplayToItem({ title: '某剧', cover: null }, 0)).toBeUndefined();
  });
});
