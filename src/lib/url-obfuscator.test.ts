import { describe, it, expect } from 'vitest';
import { encodeUrlToken, decodeUrlToken, buildObfuscatedProxyUrl } from './url-obfuscator';

describe('url-obfuscator', () => {
  it('可以正确双向编解码普通 URL', () => {
    const raw = 'https://api.example.com/api.php/provide/vod/?ac=videolist&wd=流浪地球';
    const token = encodeUrlToken(raw);
    expect(token).not.toContain('https://');
    expect(decodeUrlToken(token)).toBe(raw);
  });

  it('保留原有明文 URL 兼容性', () => {
    const raw = 'https://cdn.example.com/index.m3u8';
    expect(decodeUrlToken(raw)).toBe(raw);
  });

  it('可以正确处理 JSON 字符串', () => {
    const jsonStr = JSON.stringify({ key: 'test', url: 'https://foo.bar' });
    const token = encodeUrlToken(jsonStr);
    expect(token).not.toContain('https://');
    expect(decodeUrlToken(token)).toBe(jsonStr);
  });

  it('生成混淆代理地址', () => {
    const raw = 'https://cdn.example.com/index.m3u8';
    const proxied = buildObfuscatedProxyUrl(raw);
    expect(proxied.startsWith('/api/proxy?q=')).toBe(true);
    expect(proxied).not.toContain('https://');
  });
});
