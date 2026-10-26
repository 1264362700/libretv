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

/** 首页趋势榜共享查询键：Hero 横幅与热播榜复用同一份 React Query 缓存。 */
export const HOME_TRENDING_QUERY_KEY = ['home-trending-shared'] as const;
