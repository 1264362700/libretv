import { describe, expect, it } from 'vitest';
import { buildImageCandidates, buildImageUrl } from './utils';

describe('buildImageUrl', () => {
  it('proxy 模式使用公共免费图片 CDN 节点（绝不打爆本站轻量容器）', () => {
    expect(buildImageUrl('https://img3.doubanio.com/a.jpg', 'proxy', '')).toBe(
      'https://images.weserv.nl/?url=' + encodeURIComponent('https://img3.doubanio.com/a.jpg')
    );
  });

  it('direct 与 custom 模式', () => {
    expect(buildImageUrl('https://x.com/a.jpg', 'direct', '')).toBe('https://x.com/a.jpg');
    expect(buildImageUrl('https://x.com/a.jpg', 'custom', 'https://p.example.com/?u=')).toBe(
      'https://p.example.com/?u=' + encodeURIComponent('https://x.com/a.jpg')
    );
    expect(buildImageUrl(undefined, 'proxy', '')).toBeUndefined();
  });
});

describe('buildImageCandidates', () => {
  const DOUBAN = 'https://img3.doubanio.com/view/photo/m/poster.jpg';
  const WESERV = `https://images.weserv.nl/?url=${encodeURIComponent(DOUBAN)}`;

  it('direct 模式豆瓣图：直连 → 第三方公共 CDN 兜底（绝不经过本站）', () => {
    expect(buildImageCandidates(DOUBAN, 'direct', '')).toEqual([
      DOUBAN,
      WESERV,
    ]);
  });

  it('direct 模式非豆瓣图：原站直连（无防盗链限制，秒开）', () => {
    expect(buildImageCandidates('https://bdstatic.com/x.jpg', 'direct', '')).toEqual([
      'https://bdstatic.com/x.jpg',
    ]);
  });

  it('镜像改写不命中 img\\d+ 子域时去重，不产生重复候选', () => {
    const cands = buildImageCandidates('https://doubanio.com/a.jpg', 'direct', '');
    expect(new Set(cands).size).toBe(cands.length);
    expect(cands[0]).toBe('https://doubanio.com/a.jpg');
  });

  it('proxy 模式豆瓣图：公共 CDN → 直连', () => {
    expect(buildImageCandidates(DOUBAN, 'proxy', '')).toEqual([
      WESERV,
      DOUBAN,
    ]);
  });

  it('proxy 模式非豆瓣图：直连', () => {
    expect(buildImageCandidates('https://bdstatic.com/x.jpg', 'proxy', '')).toEqual([
      'https://bdstatic.com/x.jpg',
    ]);
  });

  it('custom 模式为单一候选（模板错误显式暴露，不静默回退）', () => {
    expect(buildImageCandidates(DOUBAN, 'custom', 'https://p.example.com/?u=')).toHaveLength(1);
    expect(buildImageCandidates(undefined, 'direct', '')).toEqual([]);
  });
});
