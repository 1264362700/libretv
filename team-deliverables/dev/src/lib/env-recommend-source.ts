export type RecommendSourceValue =
  | 'douban'
  | 'bangumi'
  | 'hot-list'
  | 'baidu-top'
  | 'douban-top250'
  | '360-hot'
  | 'maoyan'
  | 'iqiyi-hot'
  | 'short-drama';

/**
 * 部署者通过 DEFAULT_RECOMMEND_SOURCE 环境变量指定的首页推荐数据源默认值。
 * 可选值：douban（豆瓣分类）/ bangumi（Bangumi 新番）/ hot-list（影视周榜）/ baidu-top（百度实时榜）/ douban-top250（豆瓣 Top250）/ 360-hot（360热播榜）/ maoyan（猫眼大盘）/ iqiyi-hot（爱奇艺榜）/ short-drama（热门短剧）。
 * 未配置返回 undefined（沿用内置默认 360-hot 或 douban）；取值非法时告警并忽略，不影响站点运行。
 */
export function getEnvRecommendSource(): RecommendSourceValue | undefined {
  const raw = process.env.DEFAULT_RECOMMEND_SOURCE?.trim().toLowerCase();
  if (!raw) return undefined;
  if (
    raw === 'douban' ||
    raw === 'bangumi' ||
    raw === 'hot-list' ||
    raw === 'baidu-top' ||
    raw === 'douban-top250' ||
    raw === '360-hot' ||
    raw === 'maoyan' ||
    raw === 'iqiyi-hot' ||
    raw === 'short-drama'
  ) {
    return raw as RecommendSourceValue;
  }
  console.warn(
    '[LibreTV] DEFAULT_RECOMMEND_SOURCE 取值无效，已忽略（可选 douban / bangumi / hot-list / baidu-top / douban-top250 / 360-hot / maoyan / iqiyi-hot / short-drama）：',
    raw
  );
  return undefined;
}
