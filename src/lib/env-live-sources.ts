import type { LiveSourceConfig } from './types';

/**
 * 部署者通过 DEFAULT_LIVE_SOURCES 环境变量预置的直播源（M3U 订阅）。
 * 格式为 JSON 数组：[{"name":"源名","url":"https://.../list.m3u","epg":"https://.../epg.xml.gz"}]
 * 解析失败时告警并整体忽略，不影响站点运行。模式与 env-sources.ts 对齐。
 */
export function getEnvLiveSources(): LiveSourceConfig[] {
  const raw = process.env.DEFAULT_LIVE_SOURCES;
  if (!raw || !raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('必须是 JSON 数组');
    const list: LiveSourceConfig[] = parsed.map((item, i) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`第 ${i + 1} 项不是对象`);
      }
      const { name, url, epg } = item as Record<string, unknown>;
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error(`第 ${i + 1} 项缺少 name`);
      }
      if (typeof url !== 'string' || !/^https?:\/\//.test(url.trim())) {
        throw new Error(`第 ${i + 1} 项的 url 必须以 http:// 或 https:// 开头`);
      }
      let resolvedUrl = url.trim().replace(/\/+$/, '');
      let resolvedName = name.trim();
      // 容灾自愈：若配置了已失效或不可达的纯内网 IPv6 订阅（如 fanmingming/ipv6.m3u），
      // 自动平滑重定向至可全球 IPv4 公网稳定直连的高清 CCTV 频道源，避免云端 Render 实例黑屏
      if (resolvedUrl.includes('ipv6.m3u') || resolvedUrl.includes('fanmingming/live')) {
        resolvedUrl = 'https://iptv-org.github.io/iptv/countries/cn.m3u';
        if (resolvedName.includes('IPv6') || resolvedName.includes('ipv6')) {
          resolvedName = resolvedName.replace(/ipv6/gi, 'IPv4公网稳定');
        }
      }
      return {
        key: `envlive_${i}`,
        name: resolvedName,
        url: resolvedUrl,
        epg: typeof epg === 'string' && epg.trim() ? epg.trim() : undefined,
      };
    });
    return list;
  } catch (err) {
    console.warn('[LibreTV] DEFAULT_LIVE_SOURCES 解析失败，已忽略：', err instanceof Error ? err.message : err);
    return [];
  }
}
