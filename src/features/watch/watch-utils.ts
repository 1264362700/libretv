/** 播放页的纯文本处理函数（从 app/watch/page.tsx 抽出，无副作用，便于单测） */

/** 演员与主创姓名解析：按逗号/斜杠/顿号/空格拆分为纯净字符串数组 */
export function parseNames(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[/,，、\s|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '未知' && s !== '暂无' && s !== '无');
}

/** 剧情概述净化：去除采集站常见 HTML 实体与 CMS 标签 */
export function sanitizeDesc(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
