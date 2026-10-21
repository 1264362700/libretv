import type { ChannelType } from '@/lib/channels';
import type { SourceConfig } from '@/lib/types';

/**
 * 片库页的静态配置（数据源元信息、各频道可用源、优先源、热搜词、筛选维度）。
 *
 * 从 app/catalog/page.tsx 抽出：页面组件此前 1600 行，其中 80 行是与渲染无关的
 * 纯数据，抽出来既降行长，也让「新增频道要改哪些数据」有清晰的落点。
 *
 * 新增频道时的完整改动清单：
 *   1. src/lib/channels.ts   —— 频道本体（名称/图标/筛选条件）
 *   2. 本文件 CHANNEL_SOURCES / CHANNEL_HOT_KEYWORDS —— 可用源与热搜词
 *   3. src/lib/cms-catalog.ts —— 若要对接 CMS 分类，还需分类名匹配规则
 */

export type CatalogSourceId = 'cms' | 'iqiyi' | '360' | 'douban' | 'bangumi';

export interface CatalogSourceMeta {
  id: CatalogSourceId;
  label: string;
  icon: string;
  badge: string;
  subTitle: string;
}

export const CATALOG_SOURCES: CatalogSourceMeta[] = [
  { id: 'cms', label: '点播源片库', icon: '🎬', badge: '500+页·秒播', subTitle: 'TVBox/影视仓标准采集源 · 每日海量新片全集入库 · 100%可播' },
  { id: 'iqiyi', label: '爱奇艺大厅', icon: '💚', badge: '官方真分页', subTitle: '官方全量大厂片库 · 100+页真分页 · 支持最新与热播切换' },
  { id: '360', label: '全网多维片库', icon: '🔥', badge: '多维细选', subTitle: '按地区、年份、类型自由筛选海量片库 · 真分页' },
  { id: 'douban', label: '豆瓣口碑高分', icon: '🏆', badge: '影史经典', subTitle: '影史高分 Top250 与每周口碑新片榜 · 真分页' },
  { id: 'bangumi', label: '新番周历', icon: '✨', badge: '连载放送', subTitle: '当季最新连载动漫 · 每日更新时间表' },
];

export const CHANNEL_SOURCES: Record<ChannelType, CatalogSourceId[]> = {
  movie: ['cms', 'iqiyi', '360', 'douban'],
  tv: ['cms', 'iqiyi', '360', 'douban'],
  short_drama: ['cms', '360'],
  // AI 漫剧与电影解说目前只有 CMS 分类源有对应内容，不挂豆瓣/爱奇艺
  ai_comic: ['cms'],
  movie_commentary: ['cms'],
  anime: ['cms', 'bangumi', 'iqiyi', '360'],
  variety: ['cms', 'iqiyi', '360', 'douban'],
  documentary: ['cms', 'iqiyi', '360', 'douban'],
};

/**
 * 专属频道的优先 CMS 源（2026-10-21 实测 76 个内置源 + 6 个默认源后得出）
 *
 * 这两个频道的分类 ID 在各采集站完全不统一，且相当一部分源根本没有对应分类：
 * - 电影解说：仅约 15/34 个可达源有，ID 各异（量子 35、暴风 51、索尼 53 ...）
 * - AI 漫剧：约 16 个源有，ID 从 42 到 74 不等
 * 因此默认取「第一个可用源」极不可靠（实测会落到天涯，而天涯没有解说分类 → 空列表）。
 *
 * ⚠️ 这里按**域名**而非 source key 匹配：同一个站点在「内置源矩阵」与
 * 「默认源池 FALLBACK_SEED_SOURCES」里是两套不同的 key（如量子同时有
 * `liangzi` 与 `curated_lzzy`），按 key 匹配只能覆盖其中一套，另一套会漏掉。
 */
export const CHANNEL_PREFERRED_CMS_HOSTS: Partial<Record<ChannelType, string[]>> = {
  movie_commentary: ['bfzyapi.com', 'lziapi.com', 'suoniapi.com'],
  ai_comic: ['bfzyapi.com', 'lziapi.com', 'guangsuapi.com', 'jyzyapi.com'],
};

/**
 * 用户一个源都没配置时的兜底源池。
 * ⚠️ 这 6 个域名与 src/lib/customer-sites.ts 的内置源矩阵是同一批站点，
 * 但 key 前缀不同（curated_* vs 内置 key）。改站点地址时两处都要动。
 */
export const FALLBACK_SEED_SOURCES: SourceConfig[] = [
  { key: 'curated_tyyszy', name: '天涯资源 (蓝光秒播·短剧专区)', url: 'https://tyyszyapi.com/api.php/provide/vod' },
  { key: 'curated_ffzy', name: '非凡资源 (极速秒播)', url: 'https://cj.ffzyapi.com/api.php/provide/vod' },
  { key: 'curated_lzzy', name: '量子资源 (蓝光秒开)', url: 'https://cj.lziapi.com/api.php/provide/vod' },
  { key: 'curated_snzy', name: '索尼资源 (高清秒播)', url: 'https://suoniapi.com/api.php/provide/vod' },
  { key: 'curated_gszy', name: '光速资源 (超低延迟)', url: 'https://api.guangsuapi.com/api.php/provide/vod' },
  { key: 'curated_jyzy', name: '金鹰资源 (院线热映)', url: 'https://jyzyapi.com/api.php/provide/vod' },
];

/** 天涯影视同款：各频道高频热门推荐搜索词 */
export const CHANNEL_HOT_KEYWORDS: Record<ChannelType, string[]> = {
  movie: ['哪吒2', '热辣滚烫', '第二十条', '飞驰人生2', '沙丘2', '周处除三害', '奥本海默'],
  tv: ['庆余年2', '繁花', '凡人修仙传', '边水往事', '大奉打更人', '唐朝诡事录', '我的阿勒泰'],
  short_drama: ['战神归来', '龙王赘婿', '顾总太太', '无双世子', '重回1990', '天降神豪', '千金回归'],
  ai_comic: ['落魄厨神摆摊', '妖王大人偷听我心声', '崽崽怎么褪色了', '朕和爱妃的系统绑反了'],
  movie_commentary: ['杀妻同盟军', '叛我更幸福', '小心许愿'],
  anime: ['仙逆', '完美世界', '吞噬星空', '斗破苍穹', '咒术回战', '鬼灭之刃'],
  variety: ['歌手2024', '乘风2024', '奔跑吧', '极速前进', '喜人奇妙夜'],
  documentary: ['地球脉动', '蓝色星球', '如果国宝会说话', '舌尖上的中国', '航拍中国'],
};

export const YEARS = ['全部', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', '2010', '2000'];

export const SORTS = [
  { id: 'recommend', label: '🔥 热门推荐' },
  { id: 'time', label: '⏰ 最新上映' },
  { id: 'rank', label: '⭐ 豆瓣高分' },
];

export const PAGE_SIZE = 24;
