import type { ChannelType } from '@/lib/channels';

/**
 * 片库页静态配置：全频道统一使用全球官方影视资料库（TMDB）。
 *
 * 历史上这里还预留过 CMS 采集源切换（CatalogSourceId 'tmdb'|'cms'、
 * CHANNEL_SOURCES、CHANNEL_PREFERRED_CMS_HOSTS、FALLBACK_SEED_SOURCES），
 * 因产品只保留 TMDB 单一来源，相关配置与数据链路已整体移除。
 */

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
  { id: 'rank', label: '最高评分' },
  { id: 'time', label: '最新上映' },
];

export const PAGE_SIZE = 20;
