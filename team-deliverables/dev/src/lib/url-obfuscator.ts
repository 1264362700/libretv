/**
 * URL 混淆与解析模块：
 * 避免在浏览器网络请求（Network 请求列表）与控制台中暴露上游采集源及直链 m3u8 明文。
 * 兼容标准 URL 与 Base64URL 混淆串，提供双向无损转换。
 */

export function encodeUrlToken(raw: string): string {
  if (!raw) return '';
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(raw, 'utf-8').toString('base64url');
    }
    // 浏览器环境兜底
    const utf8Bytes = encodeURIComponent(raw).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    );
    return btoa(utf8Bytes)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } catch {
    return encodeURIComponent(raw);
  }
}

export function decodeUrlToken(token: string): string {
  if (!token) return '';
  const trimmed = token.trim();
  // 已经是明文 http/https 或 JSON 对象串时直接放行
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('{')) {
    return trimmed;
  }

  try {
    if (typeof Buffer !== 'undefined') {
      const decoded = Buffer.from(trimmed, 'base64url').toString('utf-8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('{')) {
        return decoded;
      }
    }
    const base64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    if (typeof atob !== 'undefined') {
      const binary = atob(padded);
      const decoded = decodeURIComponent(
        Array.from(binary)
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('{')) {
        return decoded;
      }
    }
  } catch {
    // 忽略解析异常，降级到 URL 解码
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/** 构造隐藏明文的目标代理地址 */
export function buildObfuscatedProxyUrl(targetUrl: string, prefix = '/api/proxy?q='): string {
  if (!targetUrl) return '';
  return `${prefix}${encodeUrlToken(targetUrl)}`;
}
