import { NextResponse } from 'next/server';
import { sessionFromCookieHeader } from '@/lib/auth';
import { listGlobalSources, ensureGistLoaded } from '@/lib/auth-store';
import { getEnvSources } from '@/lib/env-sources';
import { getEnvSubscriptions } from '@/lib/env-subscriptions';
import { getEnvRecommendSource } from '@/lib/env-recommend-source';
import { getEnvImageMode } from '@/lib/env-image-mode';

export const runtime = 'nodejs';

/** 站点状态：返回当前会话有效性、用户信息、动态全局源与预置源 */
export async function GET(req: Request) {
  await ensureGistLoaded();
  const session = sessionFromCookieHeader(req.headers.get('cookie'));

  const globalSources = listGlobalSources();
  const vodGlobals = globalSources
    .filter((s) => s.type === 'vod')
    .map((s) => ({ key: s.key, name: s.name, url: s.url }));

  return NextResponse.json({
    passwordRequired: true,
    verified: session.valid,
    user: session.user || null,
    kickReason: session.reason || null,
    kickMessage: session.message || null,
    version: process.env.APP_VERSION || 'dev',
    defaultSources: [...getEnvSources(), ...vodGlobals],
    defaultLiveSources: [],
    defaultSubscriptions: getEnvSubscriptions(),
    defaultRecommendSource: getEnvRecommendSource() ?? null,
    defaultImageMode: getEnvImageMode() ?? null,
  });
}
