import type { SourceConfig } from './types';
import { CUSTOMER_SOURCES_LIST } from './customer-sites';

/**
 * 部署者通过 DEFAULT_SOURCES 环境变量预置的采集站。
 * 格式为 JSON 数组：[{"name":"源名","url":"https://.../api.php/provide/vod","detail":"https://...","isAdult":false}]
 * 未配置环境变量时，默认启用内置 76 个优质采集源 (CUSTOMER_SITES)。
 * 解析失败时告警并兜底返回内置源，不影响站点运行。
 */
export function getEnvSources(): SourceConfig[] {
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
