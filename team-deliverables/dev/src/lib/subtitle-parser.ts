/**
 * 本地外挂字幕解析与时间轴偏移检索引擎 (SRT / WebVTT Parser & Cue Matcher)
 *
 * 支持：
 * 1. 解析标准 .srt 与 .vtt 字幕文件（兼容毫秒逗号/小数点、缺省小时位、多行对白及 ASS/HTML 样式标签剥离）；
 * 2. 根据当前播放秒数 + 用户自定义偏移量（如 ±0.5s 校准）实时检索当前对白。
 */

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

/** 将时间戳字符串 (00:01:23,450 或 01:23.450) 解析为秒数 */
export function parseSubtitleTimestamp(raw: string): number | null {
  const s = (raw || '').trim().replace(',', '.');
  const parts = s.split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const sec = parseFloat(parts[2]);
    if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(sec)) return null;
    return h * 3600 + m * 60 + sec;
  }
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const sec = parseFloat(parts[1]);
    if (Number.isNaN(m) || Number.isNaN(sec)) return null;
    return m * 60 + sec;
  }
  return null;
}

/** 剥离字幕中的 ASS 控制符 ({\an8} 等) 与 HTML 标签 */
function cleanSubtitleText(raw: string): string {
  return raw
    .replace(/\{[^}]*\}/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .trim();
}

/** 解析 SRT 或 WebVTT 原始文本为按开始时间排序的 SubtitleCue 数组 */
export function parseSubtitles(content: string): SubtitleCue[] {
  if (!content) return [];
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    if (lines[0].toUpperCase().startsWith('WEBVTT') || lines[0].startsWith('NOTE')) continue;

    // 定位含 "-->" 的时间轴行（第一行可能是序号，也可能是时间轴）
    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;

    const timeLine = lines[timeLineIdx];
    const [startRaw, endWithSettings] = timeLine.split('-->');
    if (!startRaw || !endWithSettings) continue;

    const endRaw = endWithSettings.trim().split(/\s+/)[0];
    const start = parseSubtitleTimestamp(startRaw);
    const end = parseSubtitleTimestamp(endRaw);
    if (start === null || end === null || end <= start) continue;

    const textLines = lines
      .slice(timeLineIdx + 1)
      .map(cleanSubtitleText)
      .filter(Boolean);
    if (textLines.length === 0) continue;

    cues.push({
      start,
      end,
      text: textLines.join('\n'),
    });
  }

  return cues.sort((a, b) => a.start - b.start);
}

/**
 * 根据播放当前时间（秒）与字幕偏移量（秒，正数表示字幕提前出现，负数延后）查找当前对白
 */
export function findActiveSubtitleText(
  cues: SubtitleCue[],
  currentTime: number,
  offsetSeconds = 0
): string {
  if (!cues || cues.length === 0) return '';
  const targetTime = currentTime - offsetSeconds;
  if (targetTime < 0) return '';

  const matched: string[] = [];
  for (const cue of cues) {
    if (cue.start > targetTime) break;
    if (targetTime >= cue.start && targetTime <= cue.end) {
      matched.push(cue.text);
    }
  }
  return matched.join('\n');
}
