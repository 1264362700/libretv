import { NextResponse } from 'next/server';
import { handleProxyRequest } from '@/lib/proxy-handlers';
import { decodeUrlToken } from '@/lib/url-obfuscator';

export const runtime = 'nodejs';

/**
 * 查询串形式的通用代理：
 * - 混淆形式：/api/proxy?q=<Base64URL>（保护上游接口及 m3u8 地址不被抓包窥视）
 * - 原生形式：/api/proxy?url=<encodeURIComponent(target)>（保持旧版兼容）
 */
export async function GET(req: Request) {
  const urlObj = new URL(req.url);
  const rawParam = urlObj.searchParams.get('q') || urlObj.searchParams.get('url');
  if (!rawParam) return new NextResponse('缺少代理目标参数', { status: 400 });

  const targetUrl = decodeUrlToken(rawParam);
  if (!targetUrl) return new NextResponse('无效的目标参数', { status: 400 });

  return handleProxyRequest(req, targetUrl);
}
