import type { SourceConfig } from './types';
import { CUSTOMER_SOURCES_LIST } from './customer-sites';

/**
 * 部署者通过 DEFAULT_SOURCES 环境变量预置的采集站。
 * 格式为 JSON 数组：[{"name":"源名","url":"https://.../api.php/provide/vod","detail":"https://...","isAdult":false}]
 * 未配置环境变量时，默认启用内置 76 个优质采集源 (CUSTOMER_SITES)。
 * 解析失败时告警并兜底返回内置源，不影响站点运行。
 *
 * USE_BUILTIN_SOURCES=1 时**强制忽略 DEFAULT_SOURCES 走内置源**。
 * 用途：DEFAULT_SOURCES 生成的 key 是 `env_0`/`env_1` 这类纯序号 key，一旦被写进
 * 用户的观看历史或收藏链接（`/watch?source=env_12`），后续即使改了配置，这些
 * 历史链接也会因 key 对不上而报「点播源不存在」，且没有任何自愈手段。
 * 内置源的 key 是有意义的英文名（qiqi/hongniu 等），语义稳定且可读，
 * 对需要固化访问链接的部署场景更合适。
 */
export function getEnvSources(): SourceConfig[] {
  // 显式开关优先于 DEFAULT_SOURCES，便于不改动 Render 已有环境变量即可切换
  if (process.env.USE_BUILTIN_SOURCES === '1') {
    return CUSTOMER_SOURCES_LIST;
  }

  const raw = process.env.DEFAULT_SOURCES;
  if (!raw || !raw.trim()) {
    return CUSTOMER_SOURCES_LIST;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('必须是 JSON 数组');
    const list: SourceConfig[] = parsed.map((item, i) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`第 ${i + 1} 项不是对象`);
      }
      const { name, url, detail, isAdult } = item as Record<string, unknown>;
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error(`第 ${i + 1} 项缺少 name`);
      }
      if (typeof url !== 'string' || !/^https?:\/\//.test(url.trim())) {
        throw new Error(`第 ${i + 1} 项的 url 必须以 http:// 或 https:// 开头`);
      }
      let safeUrl = url.trim().replace(/\/+$/, '');
      if (safeUrl.startsWith('http://') && (
        safeUrl.includes('lziapi.com') ||
        safeUrl.includes('guangsuapi.com') ||
        safeUrl.includes('ffzyapi.com') ||
        safeUrl.includes('hongniuzy2.com') ||
        safeUrl.includes('bfzyapi.com')
      )) {
        safeUrl = safeUrl.replace('http://', 'https://');
      }
      return {
        key: `env_${i}`,
        name: name.trim(),
        url: safeUrl,
        detail: typeof detail === 'string' && detail.trim() ? detail.trim() : undefined,
        isAdult: isAdult === true,
      };
    });
    return list.length > 0 ? list : CUSTOMER_SOURCES_LIST;
  } catch (err) {
    console.warn('[LibreTV] DEFAULT_SOURCES 解析失败，兜底使用内置源：', err instanceof Error ? err.message : err);
    return CUSTOMER_SOURCES_LIST;
  }
}
