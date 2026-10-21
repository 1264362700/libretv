import { describe, expect, it } from 'vitest';
import { getEpisodeIntro } from './episode-intro';

describe('episode-intro 分集剧情介绍模块', () => {
  it('缺少标题或非法集数时安全返回 ok: false', async () => {
    const res1 = await getEpisodeIntro('', 1);
    expect(res1.ok).toBe(false);

    const res2 = await getEpisodeIntro('某剧', 0);
    expect(res2.ok).toBe(false);
  });

  it('上游提供 vod_plot_detail 时优先解析并按集数匹配', async () => {
    const res = await getEpisodeIntro('测试剧集', 2, 'tv', {
      plotName: '初识$$$风波又起$$$大结局',
      plotDetail: '第一集故事背景展开$$$第二集矛盾激化展开追击$$$第三集终局之战',
    });
    expect(res.ok).toBe(true);
    expect(res.episode).toBe(2);
    expect(res.title).toBe('风波又起');
    expect(res.desc).toBe('第二集矛盾激化展开追击');
    expect(res.source).toBe('plot');
  });

  it('无上游分集剧情且无外部源时返回优雅结构化兜底', async () => {
    const res = await getEpisodeIntro('极其冷门的自制剧集999XYZ', 5, 'tv');
    expect(res.ok).toBe(true);
    expect(res.episode).toBe(5);
    expect(res.title).toBe('第 5 集');
    expect(res.source).toBe('fallback');
  });
});
