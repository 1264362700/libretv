import { describe, expect, it } from 'vitest';
import {
  findActiveSubtitleText,
  parseSubtitleTimestamp,
  parseSubtitles,
} from './subtitle-parser';
import { checkHasNewEpisodes, extractEpisodeNumber } from './db';

describe('subtitle-parser: SRT & VTT parsing and offset matching', () => {
  it('正确解析标准毫秒逗号与小数点时间戳', () => {
    expect(parseSubtitleTimestamp('00:01:20,500')).toBeCloseTo(80.5);
    expect(parseSubtitleTimestamp('01:05.250')).toBeCloseTo(65.25);
  });

  it('解析 SRT 文本并剥离 ASS/HTML 样式标签', () => {
    const srt = `1
00:00:02,000 --> 00:00:05,500
{\\an8}<i>第一行中文字幕</i>
Hello World

2
00:00:06,000 --> 00:00:09,000
第二句台词`;

    const cues = parseSubtitles(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({
      start: 2,
      end: 5.5,
      text: '第一行中文字幕\nHello World',
    });
    expect(cues[1].text).toBe('第二句台词');
  });

  it('支持时间轴偏移校准检索当前字幕', () => {
    const cues = parseSubtitles(`1
00:00:10,000 --> 00:00:12,000
精准对白`);

    expect(findActiveSubtitleText(cues, 11.0, 0)).toBe('精准对白');
    expect(findActiveSubtitleText(cues, 9.0, 0)).toBe('');
    // 偏移 -1.5s（即字幕提前 1.5s 显示：当视频在 9.0s 时，targetTime = 9.0 - (-1.5) = 10.5s 命中）
    expect(findActiveSubtitleText(cues, 9.0, -1.5)).toBe('精准对白');
  });
});

describe('db: 追剧收藏夹集数提取与新集更新红点判定', () => {
  it('从各类采集源 remarks 中准确提取集数', () => {
    expect(extractEpisodeNumber('更新至24集')).toBe(24);
    expect(extractEpisodeNumber('第12话')).toBe(12);
    expect(extractEpisodeNumber('36集全')).toBe(36);
    expect(extractEpisodeNumber('EP08')).toBe(8);
    expect(extractEpisodeNumber('HD中字')).toBe(0);
  });

  it('当采集源最新集数大于收藏时已知集数时触发更新红点', () => {
    const res1 = checkHasNewEpisodes({ lastKnownEpisodes: 12, remarks: '更新至12集' }, '更新至16集');
    expect(res1.hasUpdate).toBe(true);
    expect(res1.newCount).toBe(4);
    expect(res1.badgeText).toContain('更新 4 集');

    const res2 = checkHasNewEpisodes({ lastKnownEpisodes: 16, remarks: '更新至16集' }, '更新至16集');
    expect(res2.hasUpdate).toBe(false);
  });
});
