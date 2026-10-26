/** /api/media/feed 参数拼装的唯一出口：首页推荐区与片库页共用，避免两处逻辑分叉 */

export function buildMediaFeedParams(opts: {
  type: string;
  page: number;
  sort: string;
  area?: string;
  genre?: string;
  year?: string;
  /** 全局联想搜索关键词（写入 q 参数） */
  query?: string;
}): URLSearchParams {
  const sp = new URLSearchParams({
    type: opts.type,
    page: String(opts.page),
    sort: opts.sort || 'recommend',
  });
  if (opts.area && opts.area !== '全部') sp.set('area', opts.area);
  if (opts.genre && opts.genre !== '全部') sp.set('genre', opts.genre);
  if (opts.year && opts.year !== '全部') sp.set('year', opts.year);
  if (opts.query) sp.set('q', opts.query);
  return sp;
}


/**
 * 同一页面可能有多个展示区请求完全相同的资料流（例如首页巨幕与热播榜）。
 * 只合并并发中的同 URL 网络请求，不合并 React Query key，也不改变各展示区的数据语义。
 * 请求完成后立即清理，后续刷新仍由浏览器/CDN 的 HTTP 缓存策略决定。
 */
const inFlightMediaFeeds = new Map<string, Promise<unknown>>();

export function fetchMediaFeedJson<T>(url: string): Promise<T> {
  const existing = inFlightMediaFeeds.get(url);
  if (existing) return existing as Promise<T>;

  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`资料库请求失败 (${response.status})`);
      return response.json() as Promise<T>;
    })
    .finally(() => {
      if (inFlightMediaFeeds.get(url) === request) inFlightMediaFeeds.delete(url);
    });

  inFlightMediaFeeds.set(url, request);
  return request;
}
