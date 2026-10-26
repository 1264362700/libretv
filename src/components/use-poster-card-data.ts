'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, favoriteIdOf, toggleFavorite } from '@/lib/db';
import { resolveEpisodeBadge, type MediaItem } from '@/lib/media-library-service';
import { useAppStore } from '@/lib/store';

/**
 * 海报卡片共享数据层（MediaCard 与 DoubanCard 统一使用）：
 * 评分格式化、集数状态角标、演员/副标题、收藏状态、图片降级与代理策略。
 * 历史问题：两份卡片各自维护一份近似逻辑，曾出现「DoubanCard 注释写 MediaCard」的
 * 命名漂移；抽取后单一来源，收藏操作改为 useLiveQuery 后跨组件实时同步。
 */

type PosterItem = Partial<MediaItem> & { title: string; cover: string };

export function usePosterCardData(item: PosterItem, cmsRemarksMap?: Map<string, string>) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!item.cover && !imgFailed;

  // 封面变化时重置降级状态
  useEffect(() => setImgFailed(false), [item.cover]);

  // 评分：仅接受 0-10 的纯数字文本，脏数据（「暂无评分」等）归一为 null
  const ratingText = useMemo(() => {
    if (item.rating === undefined || item.rating === null) return null;
    const trimmed = String(item.rating).trim();
    if (!trimmed) return null;
    const num = parseFloat(trimmed);
    if (!Number.isNaN(num) && num > 0 && num <= 10 && /^\d+(\.\d+)?$/.test(trimmed)) {
      return num.toFixed(1);
    }
    return null;
  }, [item.rating]);

  // 集数/更新状态角标（优先级：采集源实时备注 > 豆瓣 episodes_info > 正则提取 > 年份）
  const episodeBadge = useMemo(
    () => resolveEpisodeBadge(item, cmsRemarksMap),
    [item, cmsRemarksMap]
  );

  // 演员阵容行（缺省回落到 card_subtitle）
  const castLine = useMemo(() => {
    if (item.actors && item.actors.length > 0) {
      return item.actors.slice(0, 3).join(' / ');
    }
    return item.card_subtitle || '';
  }, [item.actors, item.card_subtitle]);

  // 收藏状态（useLiveQuery：追剧单在别处变更时角标实时同步）
  const favEntry = useLiveQuery(
    () => (item.title ? db.favorites.get(favoriteIdOf(item.title)) : undefined),
    [item.title]
  );
  const isFavorited = Boolean(favEntry);

  // 一键追剧/取消：统一字段映射，供两种卡片共用
  const toggleFav = useMemo(
    () => async () => {
      if (!item.title) return false;
      return toggleFavorite({
        title: item.title,
        pic: item.cover,
        year: item.year,
        typeName: item.typeName,
        remarks: episodeBadge || undefined,
      });
    },
    [item, episodeBadge]
  );

  return {
    imageProxyMode,
    customImageProxy,
    imgFailed,
    setImgFailed,
    showImg,
    ratingText,
    episodeBadge,
    castLine,
    isFavorited,
    toggleFav,
  };
}
