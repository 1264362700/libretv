import type { ChannelType } from '@/lib/channels';
import type { SourceConfig } from '@/lib/types';

/**
 * 片库页静态配置：全频道统一仅使用 TMDB 官方影视资料库。
 */

export type CatalogSourceId = 'tmdb' | 'cms';

export interface CatalogSourceMeta {
  id: CatalogSourceId;
  label: string;
  icon: string;
  badge: string;
  subTitle: string;
}

export const CATALOG_SOURCES: CatalogSourceMeta[] = [
  {
    id: 'tmdb',
    label: 'TMDB 全球影视资料库',
    icon: '🎬',
    badge: 'TMDB 4K · 多维探索',
    subTitle: 'The Movie Database 官方 4K 影视资料库 · 支持类型 / 地区 / 年份 / 评分四维筛选',
  },
];

export const CHANNEL_SOURCES: Record<ChannelType, CatalogSourceId[]> = {
  movie: ['tmdb'],
  tv: ['tmdb'],
  anime: ['tmdb'],
  variety: ['tmdb'],
  documentary: ['tmdb'],
};

export const CHANNEL_PREFERRED_CMS_HOSTS: Partial<Record<ChannelType, string[]>> = {};

export const FALLBACK_SEED_SOURCES: SourceConfig[] = [
  { key: 'curated_ffzy', name: '非凡资源 (极速秒播)', url: 'https://cj.ffzyapi.com/api.php/provide/vod' },
  { key: 'curated_lzzy', name: '量子资源 (蓝光秒开)', url: 'https://cj.lziapi.com/api.php/provide/vod' },
  { key: 'curated_snzy', name: '索尼资源 (高清秒播)', url: 'https://suoniapi.com/api.php/provide/vod' },
  { key: 'curated_gszy', name: '光速资源 (超低延迟)', url: 'https://api.guangsuapi.com/api.php/provide/vod' },
  { key: 'curated_jyzy', name: '金鹰资源 (院线热映)', url: 'https://jyzyapi.com/api.php/provide/vod' },
];

export const CHANNEL_HOT_KEYWORDS: Record<ChannelType, string[]> = {
  movie: ['沙丘2', '奥本海默', '死侍与金刚狼', '异形：夺命舰', '头脑特工队2', '周处除三害', '星际穿越'],
  tv: ['幕府将军', '庆余年', '黑袍纠察队', '怪奇物语', '龙之家族', '三体', '唐朝诡事录'],
  anime: ['葬送的芙莉莲', '咒术回战', '鬼灭之刃', '间谍过家家', '进击的巨人', '链锯人'],
  variety: ['歌手2024', '乘风2024', '奔跑吧', '极速前进', '喜人奇妙夜'],
  documentary: ['地球脉动', '蓝色星球', '我们的星球', '宇宙时空之旅', '舌尖上的中国'],
};

export const YEARS = ['全部', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '更早'];

export const SORTS = [
  { id: 'recommend', label: '综合热度' },
  { id: 'rank', label: 'TMDB高分' },
  { id: 'time', label: '最新上映' },
];

export const PAGE_SIZE = 20;
