export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}天前`;
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 停用时长的可读文案：不足 1 小时按分钟，超过按小时（按剩余时间展示时向上取整） */
export function formatDisableTtl(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes >= 60 ? `${Math.round(minutes / 60)} 小时` : `${minutes} 分钟`;
}

/**
 * 封面图加载地址：direct 直连 / proxy 公共CDN加速 / custom 自定义模板。
 * 绝不向自身服务器发起重量级图片代理，释放免费容器宝贵的 CPU 与带宽连接池。
 */
export function buildImageUrl(
  url: string | undefined,
  mode: 'direct' | 'proxy' | 'custom',
  customTemplate: string
): string | undefined {
  if (!url) return undefined;
  if (mode === 'proxy') {
    // 采用全球公共免费图片 CDN 节点（不经过本站服务器，零算力开销）
    if (url.includes('doubanio.com') || url.includes('image.tmdb.org')) {
      return `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
    }
    return url;
  }
  if (mode === 'custom' && customTemplate) {
    return customTemplate.includes('{url}')
      ? customTemplate.replace('{url}', encodeURIComponent(url))
      : customTemplate + encodeURIComponent(url);
  }
  return url;
}

/**
 * 封面图降级候选链（客户端直连优先，绝不打爆本站 Render 容器）
 */
export function buildImageCandidates(
  url: string | undefined,
  mode: 'direct' | 'proxy' | 'custom',
  customTemplate: string
): string[] {
  const built = buildImageUrl(url, mode, customTemplate);
  if (!built || !url) return [];
  if (mode === 'custom') return [built];

  // 若为豆瓣图片，直连配合公共第三方 CDN 容灾
  if (url.includes('doubanio.com')) {
    const weserv = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
    if (mode === 'proxy') {
      return [...new Set([built, url, weserv])];
    }
    return [...new Set([url, weserv])];
  }

  // TMDB 官方图床在国内无 CDN 节点且丢包严重（单图耗时超 10s 并占满浏览器连接池）
  // 无论 direct 还是 proxy 模式，公共 Edge CDN 均优先加速，直连作为备选容灾
  if (url.includes('image.tmdb.org')) {
    const weserv = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
    if (mode === 'proxy') {
      return [...new Set([built, weserv, url])];
    }
    return [...new Set([weserv, url])];
  }

  // 采集站与第三方图床：直接原站直连（带 no-referrer 绝不被拦截），不走任何反代
  return [url];
}

export function validateSourceUrl(url: string): boolean {
  return /^https?:\/\/.+/.test(url);
}

/** 取 hostname 作为名称兜底；地址非法时原样返回 */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** 为分享链接等场景构造观看页 URL */
export function buildWatchUrl(params: {
  sourceKey?: string;
  vodId?: string;
  index?: number;
  title?: string;
  episodeUrl?: string;
  sourceUrl?: string;
  detail?: string;
  position?: number;
  doubanId?: string;
  year?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.sourceKey) sp.set('source', params.sourceKey);
  if (params.vodId) sp.set('id', params.vodId);
  if (typeof params.index === 'number') sp.set('index', String(params.index));
  if (params.title) sp.set('title', params.title);
  if (params.doubanId) sp.set('douban_id', params.doubanId);
  if (params.year) sp.set('year', params.year);
  if (params.episodeUrl) sp.set('url', params.episodeUrl);
  if (params.sourceUrl) sp.set('sourceUrl', params.sourceUrl);
  if (params.detail) sp.set('detail', params.detail);
  if (typeof params.position === 'number' && params.position > 0) sp.set('position', String(params.position));
  return `/watch?${sp.toString()}`;
}

