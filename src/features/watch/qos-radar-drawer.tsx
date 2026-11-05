'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icon';
import { cn } from '@/lib/utils';
import {
  getSourceMetrics,
  getSourceQoSBadge,
  type SourceQoSBadge,
} from '@/lib/source-circuit-breaker';
import type { CandidateItem } from './watch-types';

export interface QoSRadarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSourceKey: string;
  currentVodId: string;
  currentIndex: number;
  currentPosition: number;
  videoTitle: string;
  candidates: CandidateItem[];
  onSwitch: (cand: CandidateItem) => void;
  onProbe?: () => Promise<void> | void;
}

const THROTTLE_SECONDS = 60;

/** 计算提速百分比（如 800ms -> 200ms 提速 75%） */
export function calculateSpeedupPercent(currentLatency: number, candidateLatency: number): number {
  if (currentLatency <= 0 || candidateLatency <= 0 || candidateLatency >= currentLatency) return 0;
  return Math.round((1 - candidateLatency / currentLatency) * 100);
}

/** 缺集门禁判定：已知集数且小于或等于当前正在播放的集数 (0-based) */
export function isCandidateMissingEpisode(episodeCount?: number, currentIndex: number = 0): boolean {
  if (episodeCount === undefined || episodeCount <= 0) return false;
  return episodeCount <= currentIndex;
}

/**
 * 播放线路 QoS 综合监控雷达抽屉 (QoS Radar Drawer - REQ-P0-05)
 *
 * 核心特性：
 * 1. 半屏侧滑 Drawer（桌面端右侧 440px / 移动端底部 72vh），背景视频正常播放；
 * 2. 复用已测速延迟与 EWMA 指标，按延迟升序动态排序；
 * 3. 顶部常驻极速源秒切 Banner（比当前源快 30% 以上时触发，带硬缺集门禁）；
 * 4. 线路卡片完整呈现：源名、Ping/EWMA 延迟、S/A/B/C 四级徽章、集数完整度覆盖与熔断状态；
 * 5. 缺集硬门禁拦截（当前集缺集禁用切入）；
 * 6. 重新测速 60 秒防刷节流保护与 Esc 快捷关闭。
 */
export function QoSRadarDrawer({
  isOpen,
  onClose,
  currentSourceKey,
  currentVodId,
  currentIndex,
  videoTitle,
  candidates,
  onSwitch,
  onProbe,
}: QoSRadarDrawerProps) {
  const [cooldown, setCooldown] = useState(0);
  const [isProbing, setIsProbing] = useState(false);
  const lastProbeTimeRef = useRef(0);

  // Esc 键关闭抽屉
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // 60 秒测速节流倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleManualProbe = async () => {
    if (cooldown > 0 || isProbing) return;
    const now = Date.now();
    if (now - lastProbeTimeRef.current < THROTTLE_SECONDS * 1000) {
      return;
    }
    lastProbeTimeRef.current = now;
    setCooldown(THROTTLE_SECONDS);
    setIsProbing(true);
    try {
      await onProbe?.();
    } finally {
      setIsProbing(false);
    }
  };

  // 计算当前源延迟
  const currentMetric = useMemo(
    () => getSourceMetrics(currentSourceKey),
    [currentSourceKey]
  );
  const currentCand = useMemo(
    () => candidates.find((c) => c.source.key === currentSourceKey),
    [candidates, currentSourceKey]
  );
  const currentLatency = currentCand?.ms || currentMetric.ewmaLatencyMs || 0;

  // 整理并排序候选线路：
  // 1. 当前线路置顶；
  // 2. 其余按有效延迟升序（已熔断排在最后）；
  const evaluatedCandidates = useMemo(() => {
    return candidates.map((cand) => {
      const isCurrent =
        cand.source.key === currentSourceKey &&
        (!currentVodId || String(cand.result.vodId) === String(currentVodId));
      const metrics = getSourceMetrics(cand.source.key);
      const isCircuitOpen = metrics.state === 'open';
      const effectiveLatency = isCircuitOpen ? 99999 : cand.ms || metrics.ewmaLatencyMs || 9999;
      const badge = getSourceQoSBadge(cand.source.key);
      // 缺集门禁判定：已知集数且小于或等于当前正在播放的集数 (0-based)
      const isEpisodeMissing = isCandidateMissingEpisode(cand.episodeCount, currentIndex);

      return {
        ...cand,
        isCurrent,
        isCircuitOpen,
        effectiveLatency,
        badge,
        isEpisodeMissing,
        displayLatency: isCircuitOpen ? '-' : effectiveLatency < 9000 ? `${effectiveLatency}ms` : '待探测',
      };
    }).sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      if (a.isCircuitOpen !== b.isCircuitOpen) return a.isCircuitOpen ? 1 : -1;
      return a.effectiveLatency - b.effectiveLatency;
    });
  }, [candidates, currentSourceKey, currentVodId, currentIndex]);

  // 极速源一键秒切 Banner 计算（快 30% 以上且绝不缺集）
  const fasterCandidate = useMemo(() => {
    if (currentLatency <= 0) return null;
    const candidatesCanSwitch = evaluatedCandidates.filter(
      (c) =>
        !c.isCurrent &&
        !c.isCircuitOpen &&
        !c.isEpisodeMissing &&
        c.effectiveLatency > 0 &&
        c.effectiveLatency < currentLatency * 0.7
    );
    if (candidatesCanSwitch.length === 0) return null;
    const best = candidatesCanSwitch[0];
    const gain = calculateSpeedupPercent(currentLatency, best.effectiveLatency);
    return {
      ...best,
      gainPercent: gain,
    };
  }, [evaluatedCandidates, currentLatency]);

  if (!isOpen) return null;

  return (
    <>
      {/* 半透明遮罩层：保留视频播放背景，点击即可收起 */}
      <div
        className="fixed inset-0 z-[69] bg-black/45 backdrop-blur-[2px] transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      {/* 综合监控雷达抽屉主体 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="播放线路 QoS 综合监控雷达"
        className={cn(
          'fixed z-[70] bg-surface-raised border-line shadow-2xl flex flex-col',
          // 移动端：底部半屏升起 (72vh)
          'inset-x-0 bottom-0 h-[72vh] rounded-t-2xl border-t sm:rounded-t-none sm:border-t-0',
          // 桌面端：右侧全高滑出 (440px)
          'sm:top-0 sm:right-0 sm:bottom-0 sm:left-auto sm:h-full sm:w-[440px] sm:border-l'
        )}
      >
        {/* 移动端顶部下拉阻尼拉手 */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto my-2 sm:hidden shrink-0" />

        {/* 抽屉头部 */}
        <div className="px-4 py-3.5 border-b border-line/60 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <h2 className="text-sm sm:text-base font-bold text-content truncate">
                线路 QoS 综合监控雷达
              </h2>
            </div>
            <p className="text-[11px] text-muted truncate mt-0.5">
              全景延迟衰减 · 动态健康度 · 毫秒级秒切起播
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleManualProbe}
              disabled={cooldown > 0 || isProbing}
              className={cn(
                'btn-ghost btn-sm !px-2.5 !py-1 text-xs flex items-center gap-1 border border-line/50 rounded-lg cursor-pointer transition-all',
                cooldown > 0 && 'opacity-60 cursor-not-allowed bg-chip/40'
              )}
              title={cooldown > 0 ? `防刷节流中，请等待 ${cooldown} 秒` : '重新并发探测各线路延迟'}
            >
              <Icon
                name="bolt"
                className={cn('w-3.5 h-3.5 text-accent', isProbing && 'animate-spin')}
              />
              <span className="font-mono text-[11px]">
                {isProbing ? '测速中...' : cooldown > 0 ? `${cooldown}s` : '重新测速'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-faint hover:text-content hover:bg-hover transition-colors cursor-pointer"
              aria-label="关闭抽屉"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 顶部常驻极速源秒切 Banner (CHK-R-05) */}
        {fasterCandidate && (
          <div className="p-3 mx-4 mt-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 shrink-0 animate-fade-in shadow-sm">
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-base select-none shrink-0">🚀</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-400 truncate">
                  发现更优极速线路 · {fasterCandidate.source.name}
                </p>
                <p className="text-[11px] text-muted truncate">
                  延迟 {fasterCandidate.effectiveLatency}ms · 较当前源提速 {fasterCandidate.gainPercent}%
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onSwitch(fasterCandidate);
                onClose();
              }}
              className="btn-primary btn-sm text-xs px-3 py-1.5 flex items-center gap-1 shrink-0 font-bold cursor-pointer shadow-glow-emerald"
            >
              一键秒切
            </button>
          </div>
        )}

        {/* 线路列表滚动区 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] text-faint px-1">
            <span>候选数据源 ({evaluatedCandidates.length})</span>
            <span>当前播放：第 {currentIndex + 1} 集</span>
          </div>

          {evaluatedCandidates.map((cand) => {
            const badge = cand.badge as SourceQoSBadge;

            return (
              <div
                key={cand.source.key}
                className={cn(
                  'p-3 rounded-xl border transition-all flex items-center justify-between gap-3',
                  cand.isCurrent
                    ? 'bg-accent/10 border-accent shadow-sm'
                    : cand.isCircuitOpen
                    ? 'bg-rose-500/5 border-rose-500/40 opacity-75'
                    : 'bg-surface border-line/60 hover:border-accent/40 hover:bg-hover'
                )}
              >
                {/* 左侧：源名称、延迟与评级徽章 */}
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs sm:text-sm font-bold text-content truncate max-w-[170px]">
                      {cand.source.name}
                    </span>
                    {cand.isCurrent && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent text-on-accent shrink-0">
                        播放中
                      </span>
                    )}
                    {/* QoS S/A/B/C 评级徽章 (CHK-R-04) */}
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0',
                        badge.grade === 'S' && 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
                        badge.grade === 'A' && 'text-sky-400 bg-sky-500/15 border-sky-500/30',
                        badge.grade === 'B' && 'text-amber-400 bg-amber-500/15 border-amber-500/30',
                        badge.grade === 'C' && 'text-rose-400 bg-rose-500/15 border-rose-500/30'
                      )}
                    >
                      {badge.grade}级 · {badge.label}
                    </span>
                  </div>

                  {/* 详细指标与集数覆盖 (CHK-R-03, CHK-R-07, CHK-R-08) */}
                  <div className="flex items-center gap-2 text-[11px] text-muted flex-wrap">
                    <span className="font-mono text-content">
                      延迟 {cand.displayLatency}
                    </span>
                    <span>·</span>
                    <span className="truncate max-w-[120px]">
                      {cand.episodeCount ? `${cand.episodeCount} 集全` : cand.result.remarks || '连载中'}
                    </span>
                    {cand.isEpisodeMissing && (
                      <span className="text-rose-400 font-semibold text-[10px]">
                        · 缺当前集
                      </span>
                    )}
                    {cand.isCircuitOpen && (
                      <span className="text-rose-400 font-semibold text-[10px]">
                        · 熔断冷却中
                      </span>
                    )}
                  </div>
                </div>

                {/* 右侧：操作按钮 (带缺集门禁与当前态保护) */}
                <div className="shrink-0">
                  {cand.isCurrent ? (
                    <span className="text-xs font-semibold text-accent px-2 py-1 select-none">
                      已选用
                    </span>
                  ) : cand.isEpisodeMissing ? (
                    <button
                      type="button"
                      disabled
                      className="px-2.5 py-1 text-xs rounded-lg bg-chip text-faint opacity-50 cursor-not-allowed border border-line/40 select-none"
                      title="该源集数未覆盖当前正在播放的集数，禁止切换"
                    >
                      缺集
                    </button>
                  ) : cand.isCircuitOpen ? (
                    <button
                      type="button"
                      disabled
                      className="px-2.5 py-1 text-xs rounded-lg bg-chip text-rose-400/60 opacity-50 cursor-not-allowed border border-rose-500/30 select-none"
                      title="该线路连续多次失败处于熔断期"
                    >
                      不可用
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onSwitch(cand);
                        onClose();
                      }}
                      className="btn-primary btn-sm text-xs px-2.5 py-1 flex items-center gap-1 cursor-pointer transition-transform active:scale-95"
                    >
                      <span>切换</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 抽屉底部提示栏 */}
        <div className="px-4 py-2.5 border-t border-line/60 bg-surface/50 text-[11px] text-faint flex items-center justify-between shrink-0">
          <span>片名：{videoTitle}</span>
          <span className="font-mono">按 Esc 键可快速收起</span>
        </div>
      </div>
    </>
  );
}
