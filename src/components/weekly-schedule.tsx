'use client';

import { useMemo, useState } from 'react';
import type { BangumiDaySchedule, MediaItem } from '@/lib/media-library-service';
import { MediaCard } from './media-card';
import { cn } from '@/lib/utils';

export interface WeeklyScheduleProps {
  schedule: BangumiDaySchedule[];
  cmsRemarksMap?: Map<string, string>;
  onPick: (item: MediaItem) => void;
  isLoading?: boolean;
}

const WEEKDAY_TABS = [
  { id: 1, label: '周一' },
  { id: 2, label: '周二' },
  { id: 3, label: '周三' },
  { id: 4, label: '周四' },
  { id: 5, label: '周五' },
  { id: 6, label: '周六' },
  { id: 7, label: '周日' },
];

/**
 * 每日追番/追剧周历放送表组件 (WeeklySchedule)
 * 基于 Bangumi 免 Key 接口：
 * 1. 顶部提供 周一 ~ 周日 7 胶囊切换按钮，默认高亮当前星期几
 * 2. 响应式海报卡片网格，带更新状态与纯正动漫评分
 */
export function WeeklySchedule({
  schedule,
  cmsRemarksMap,
  onPick,
  isLoading,
}: WeeklyScheduleProps) {
  // 今天是周几（JS 中 0 为周日，映射为 7）
  const currentDayId = useMemo(() => {
    const day = new Date().getDay();
    return day === 0 ? 7 : day;
  }, []);

  const [activeDay, setActiveDay] = useState<number>(currentDayId);

  const currentItems = useMemo(() => {
    const found = schedule.find((s) => s.weekdayId === activeDay);
    return found?.items ?? [];
  }, [schedule, activeDay]);

  return (
    <section className="space-y-4 pt-2">
      {/* 头部标题与周历切换胶囊 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="text-xl sm:text-2xl shrink-0">📅</span>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-content flex items-center gap-2">
              <span>每日追番 · 新番时间表</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30">
                Bangumi
              </span>
            </h2>
            <p className="text-[11px] text-muted">连载新番放送时刻 · 准时更新</p>
          </div>
        </div>

        {/* 周一至周日切换胶囊 */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1 shrink-0">
          {WEEKDAY_TABS.map((tab) => {
            const isSelected = tab.id === activeDay;
            const isToday = tab.id === currentDayId;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveDay(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer touch-manipulation',
                  isSelected
                    ? 'bg-accent text-on-accent shadow-md shadow-accent/40'
                    : 'bg-chip text-muted hover:text-content hover:bg-hover'
                )}
              >
                <span>{tab.label}</span>
                {isToday && (
                  <span className="ml-1 text-[9px] opacity-90 font-normal">（今天）</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 当天新番列表卡片网格 */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] rounded-xl bg-chip animate-pulse border border-line/40"
            />
          ))}
        </div>
      ) : currentItems.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {currentItems.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              cmsRemarksMap={cmsRemarksMap}
              onClick={() => onPick(item)}
            />
          ))}
        </div>
      ) : (
        <div className="py-12 text-center text-xs text-muted border border-dashed border-line/60 rounded-xl bg-surface/30">
          周历数据加载中或本日暂无新番连载…
        </div>
      )}
    </section>
  );
}
