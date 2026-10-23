/**
 * 频道定义的唯一来源（纯 TMDB 影视资料库频道体系）。
 * 仅保留核心五大院线与流媒体频道：电影、电视剧、动漫、综艺、纪录片。
 */

export type ChannelType =
  | 'movie'
  | 'tv'
  | 'anime'
  | 'variety'
  | 'documentary';

export interface ChannelConfig {
  id: ChannelType;
  /** 片库页精确名称 */
  label: string;
  /** 顶栏导航短名 */
  navLabel: string;
  /** 抽屉大菜单名称 */
  lobbyLabel: string;
  /** 抽屉大菜单描述 */
  lobbyDesc: string;
  /** 片库页图标 */
  icon: string;
  /** 快捷搜索弹窗图标（缺省沿用 icon） */
  quickIcon?: string;
  /** 抽屉大菜单图标（缺省沿用 icon） */
  drawerIcon?: string;
  /** 片库页副标题 */
  subTitle: string;
  regions: string[];
  genres: string[];
}

export const CHANNELS: ChannelConfig[] = [
  {
    id: 'movie',
    label: '电影',
    navLabel: '电影',
    lobbyLabel: '电影大厅',
    lobbyDesc: '院线大片 / 全球高分',
    icon: '🎬',
    subTitle: 'TMDB 全球院线大片 · 经典佳作 · 4K 蓝光臻选',
    regions: ['全部', '大陆', '香港', '台湾', '美国', '韩国', '日本', '英国', '法国'],
    genres: ['全部', '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '战争', '动画', '剧情', '奇幻', '犯罪', '纪录片'],
  },
  {
    id: 'tv',
    label: '电视剧',
    navLabel: '电视剧',
    lobbyLabel: '电视剧场',
    lobbyDesc: '热门国产剧 / 经典美剧',
    icon: '📺',
    subTitle: 'TMDB 热门华语剧 · 欧美大剧 · 日韩同步连载',
    regions: ['全部', '大陆', '美国', '韩国', '日本', '香港', '台湾', '英国', '泰国'],
    genres: ['全部', '言情', '古装', '都市', '剧情', '悬疑', '喜剧', '科幻', '武侠', '谍战', '历史', '偶像'],
  },
  {
    id: 'anime',
    label: '动漫',
    navLabel: '动漫',
    lobbyLabel: '人气动漫',
    lobbyDesc: '连载新番 / 热血神作',
    icon: '✨',
    subTitle: 'TMDB 连载新番 · 热血神作 · 剧场版经典',
    regions: ['全部', '日本', '大陆', '美国'],
    genres: ['全部', '热血', '冒险', '搞笑', '奇幻', '科幻', '战斗', '恋爱', '校园', '悬疑', '治愈'],
  },
  {
    id: 'variety',
    label: '综艺',
    navLabel: '综艺',
    lobbyLabel: '爆笑综艺',
    lobbyDesc: '下饭真人秀 / 脱口秀',
    icon: '🎤',
    subTitle: 'TMDB 爆笑下饭 · 音乐舞台 · 热门真人秀',
    regions: ['全部', '大陆', '韩国', '香港', '台湾', '美国'],
    genres: ['全部', '真人秀', '脱口秀', '音乐', '访谈', '搞笑', '美食', '竞技'],
  },
  {
    id: 'documentary',
    label: '纪录片',
    navLabel: '纪录片',
    lobbyLabel: '探索纪录',
    lobbyDesc: '自然历史 / 科学人文',
    icon: '🌍',
    subTitle: 'TMDB 探索自然 · 揭秘历史 · 人文科学',
    regions: ['全部', '大陆', '美国', '英国', '法国', '日本'],
    genres: ['全部', '自然', '历史', '科学', '人文', '美食', '军事', '探险', '地理'],
  },
];

/** 频道在片库页的落地地址（唯一定义处，避免各处手拼 query 拼错） */
export function channelHref(id: ChannelType): string {
  return `/catalog?type=${id}`;
}

export function getChannel(id: string): ChannelConfig | undefined {
  return CHANNELS.find((c) => c.id === id);
}

export function isChannelType(value: string): value is ChannelType {
  return CHANNELS.some((c) => c.id === value);
}

/** 顶栏导航项（首页/直播不是片库频道，固定追加） */
export const HEADER_NAV = [
  { id: 'home', label: '首页', href: '/' },
  ...CHANNELS.map((c) => ({ id: c.id as string, label: c.navLabel, href: channelHref(c.id) })),
  { id: 'live', label: '直播', href: '/live' },
];

/** 抽屉大菜单项（含「全能片库」入口） */
export const DRAWER_NAV = [
  { id: 'home', label: '首页精选', icon: '🏠', href: '/', desc: '热播大屏 · 快速搜索' },
  ...CHANNELS.map((c) => ({
    id: c.id as string,
    label: c.lobbyLabel,
    icon: c.drawerIcon ?? c.icon,
    href: channelHref(c.id),
    desc: c.lobbyDesc,
  })),
  { id: 'catalog', label: '全能片库', icon: '🎞️', href: '/catalog', desc: 'TMDB 四维条件自由探索' },
  { id: 'live', label: '电视直播', icon: '📡', href: '/live', desc: '央视卫视高清在线' },
];

/** 快捷搜索弹窗的频道入口 */
export const QUICK_CHANNELS = [
  ...CHANNELS.map((c) => ({ label: c.navLabel, icon: c.quickIcon ?? c.icon, href: channelHref(c.id) })),
  { label: '电视直播', icon: '📡', href: '/live' },
];
