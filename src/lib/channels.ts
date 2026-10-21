/**
 * 频道定义的唯一来源。
 *
 * 背景：新增一个频道此前需要同步改四处（顶栏导航、抽屉大菜单、快捷搜索弹窗、
 * 片库页频道配置），任一遗漏都会出现「导航有入口但页面没内容」或反之。
 * 现在所有入口都从这里派生，新增频道只需在本文件 + 片库页的
 * CHANNEL_SOURCES / CHANNEL_HOT_KEYWORDS（数据源与热搜词）各加一处。
 *
 * 三套文案字段为何不合并：顶栏要短（「短剧」）、大菜单要带修饰（「微短剧场」）、
 * 片库页要精确语义（「电影解说」而不是「影视解说」）。刻意保留差异，
 * 避免为了统一而改动用户已看惯的文案。
 */

export type ChannelType =
  | 'movie'
  | 'tv'
  | 'short_drama'
  | 'ai_comic'
  | 'movie_commentary'
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
    subTitle: '院线大片 · 经典佳作 · 全球高分',
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
    subTitle: '热门华语剧 · 经典美剧 · 精彩韩剧日剧',
    regions: ['全部', '大陆', '美国', '韩国', '日本', '香港', '台湾', '英国', '泰国'],
    genres: ['全部', '言情', '古装', '都市', '剧情', '悬疑', '喜剧', '科幻', '武侠', '谍战', '历史', '伦理', '偶像'],
  },
  {
    id: 'short_drama',
    label: '短剧',
    navLabel: '短剧',
    lobbyLabel: '微短剧场',
    lobbyDesc: '热门微短剧 / 爽文全集',
    icon: '📱',
    subTitle: '热门微短剧 · 爽文逆袭 · 全集秒播',
    regions: ['全部', '都市', '古装', '战神', '甜宠', '逆袭', '重生'],
    genres: ['全部', '战神', '总裁', '甜宠', '重生', '神医', '穿越', '豪门', '赘婿', '逆袭'],
  },
  {
    id: 'ai_comic',
    label: 'AI 漫剧',
    navLabel: 'AI漫剧',
    lobbyLabel: 'AI漫剧',
    lobbyDesc: 'AI 动画 / 漫剧合集',
    icon: '🎨',
    quickIcon: '🎨',
    drawerIcon: '🤖',
    subTitle: 'AI 生成竖屏短剧 · 约 2.9 万条 · 每周更新',
    regions: ['全部', '都市', '古装', '玄幻', '悬疑'],
    genres: ['全部', '爽文', '逆袭', '重生', '穿越', '修仙', '总裁', '神医'],
  },
  {
    id: 'movie_commentary',
    label: '电影解说',
    navLabel: '影视解说',
    lobbyLabel: '影视解说',
    lobbyDesc: '剧情解说 / 深度解析',
    icon: '🎬',
    quickIcon: '🎙️',
    drawerIcon: '🎙️',
    subTitle: '竖屏解说速看 · 约 3.7 万条 · 几分钟看完一部片',
    regions: ['全部', '悬疑', '犯罪', '动作', '科幻', '剧情'],
    genres: ['全部', '解说', '速看', '解说版', '完整版'],
  },
  {
    id: 'anime',
    label: '动漫',
    navLabel: '动漫',
    lobbyLabel: '人气动漫',
    lobbyDesc: '连载新番 / 热血神作',
    icon: '✨',
    subTitle: '连载新番 · 热血神作 · 剧场版经典',
    regions: ['全部', '日本', '大陆', '美国'],
    genres: ['全部', '热血', '冒险', '搞笑', '奇幻', '科幻', '战斗', '恋爱', '校园', '悬疑', '治愈', '机战', '运动', '励志'],
  },
  {
    id: 'variety',
    label: '综艺',
    navLabel: '综艺',
    lobbyLabel: '爆笑综艺',
    lobbyDesc: '下饭真人秀 / 脱口秀',
    icon: '🎤',
    subTitle: '爆笑下饭 · 音乐舞台 · 真实真人秀',
    regions: ['全部', '大陆', '韩国', '香港', '台湾', '美国'],
    genres: ['全部', '真人秀', '脱口秀', '音乐', '访谈', '晚会', '文化', '情感', '搞笑', '美食', '竞技'],
  },
  {
    id: 'documentary',
    label: '纪录片',
    navLabel: '纪录片',
    lobbyLabel: '探索纪录',
    lobbyDesc: '自然历史 / 科学人文',
    icon: '🌍',
    subTitle: '探索自然 · 揭秘历史 · 人文科学',
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
  { id: 'catalog', label: '全能片库', icon: '🎞️', href: '/catalog', desc: '多维多重条件自由探索' },
  { id: 'live', label: '电视直播', icon: '📡', href: '/live', desc: '央视卫视高清在线' },
];

/** 快捷搜索弹窗的频道入口 */
export const QUICK_CHANNELS = [
  ...CHANNELS.map((c) => ({ label: c.navLabel, icon: c.quickIcon ?? c.icon, href: channelHref(c.id) })),
  { label: '电视直播', icon: '📡', href: '/live' },
];
