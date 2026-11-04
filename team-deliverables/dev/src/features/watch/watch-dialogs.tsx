'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icon';
import { Spinner } from '@/components/states';
import { copyToClipboard } from '@/lib/clipboard';
import { formatTime } from '@/lib/utils';
import type { CandidateItem } from './watch-types';

/**
 * 跨屏扫码秒级接力弹窗 (Instant QR Handoff Modal)：
 * 将当前播放源、剧集索引与精确到秒的播放进度编码为接力 URL，
 * 支持手机/平板/电视扫码或一键复制链接，在另一台设备同一秒无缝续播。
 */
export function QrHandoffModal({
  videoTitle,
  episodeIndex,
  totalEpisodes,
  positionSeconds,
  handoffUrl,
  onClose,
}: {
  videoTitle: string;
  episodeIndex: number;
  totalEpisodes: number;
  positionSeconds: number;
  handoffUrl: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(
    handoffUrl
  )}`;

  const handleCopy = async () => {
    const ok = await copyToClipboard(handoffUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="跨屏扫码秒级接力"
    >
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface-raised p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-content flex items-center gap-1.5">
              <span>📱 跨屏扫码秒级接力</span>
            </h3>
            <p className="text-xs text-muted mt-0.5">
              手机或平板相机扫码，直接从当前秒数无缝接续播放
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-faint hover:text-content hover:bg-hover transition-colors cursor-pointer"
            aria-label="关闭"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        {/* 二维码展示框 */}
        <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-white mx-auto w-52 h-52 shadow-inner">
          {!qrFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrImageUrl}
              alt="跨屏接力二维码"
              className="w-44 h-44 object-contain"
              onError={() => setQrFailed(true)}
            />
          ) : (
            <div className="text-center text-slate-600 text-xs px-2 space-y-1">
              <p className="font-semibold">当前处于离线或内网环境</p>
              <p className="text-[11px] text-slate-500">请直接点击下方按钮复制接力链接发送至目标设备</p>
            </div>
          )}
        </div>

        {/* 当前播放状态胶囊 */}
        <div className="px-3 py-2 rounded-xl bg-chip/60 border border-line/60 text-xs flex items-center justify-between gap-2">
          <span className="text-content font-medium truncate">{videoTitle}</span>
          <span className="text-accent font-mono shrink-0 font-semibold">
            {totalEpisodes > 1 ? `第${episodeIndex + 1}集 · ` : ''}
            {formatTime(Math.max(0, positionSeconds))}
          </span>
        </div>

        {/* 复制接力链接按钮 */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={handoffUrl}
            className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-surface border border-line text-[11px] text-muted font-mono focus:outline-none"
            onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="btn-primary btn-sm h-9 px-3.5 text-xs shrink-0 cursor-pointer"
          >
            {copied ? '✓ 已复制' : '复制接力链接'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 播放页无有效源时的自愈匹配进度或引导兜底状态页
 */
export function WatchFallbackState({
  titleParam,
  sourceKey,
  hasStaleSource,
  matchingDone,
  matchedCount,
  streamProgress,
  candidateSourceCount,
}: {
  titleParam: string;
  sourceKey: string;
  hasStaleSource: boolean;
  matchingDone: boolean;
  matchedCount: number;
  streamProgress: { completed: number; total: number; matched: number } | null;
  candidateSourceCount: number;
}) {
  if (titleParam && !matchingDone) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 bg-page">
        <Spinner size="lg" />
        <p className="text-sm text-content font-medium">
          {hasStaleSource
            ? `原播放源已失效，正在为「${titleParam}」重新匹配可用线路...`
            : `正在流式并发匹配「${titleParam}」播放源并秒开...`}
        </p>
        <p className="text-xs text-faint">
          {streamProgress
            ? `已检测 ${streamProgress.completed}/${streamProgress.total} 个源，命中 ${streamProgress.matched} 条线路`
            : `已连接 ${candidateSourceCount} 个启用数据源并发池`}
        </p>
      </div>
    );
  }

  if (titleParam && matchingDone && matchedCount === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-page">
        <div className="text-center max-w-md">
          <h1 className="text-content font-semibold text-lg mb-2">未找到该片源</h1>
          <p className="text-sm text-muted mb-5 leading-relaxed">
            {hasStaleSource
              ? `原播放源「${sourceKey}」已不存在，且当前启用的点播源中未匹配到「${titleParam}」。可在设置中重新添加该源，或返回首页重新选择。`
              : `当前启用的点播源中暂未匹配到「${titleParam}」。建议在右上角「设置」中开启更多点播源，或返回片库选择其他精彩影片。`}
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/catalog" className="btn-primary">进入片库大厅</Link>
            <Link href="/" className="btn-ghost">返回首页</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-page">
      <div className="text-center max-w-md">
        <h1 className="text-content font-medium mb-2">点播源不存在</h1>
        <p className="text-sm text-muted mb-4">
          该视频来自点播源「{sourceKey || '未知'}」，但它可能已被删除。请在设置中重新添加后重试。
        </p>
        <p className="text-xs text-faint mb-5">
          若这是从观看历史或收藏打开的旧链接，源配置变更后已无法自动恢复，建议删除该条记录或返回首页重新选择。
        </p>
        <Link href="/" className="btn-primary">返回首页</Link>
      </div>
    </div>
  );
}

/**
 * 非侵入式最优线路浮动胶囊（Non-intrusive Speed Suggestion Pill）：
 * 发现更快线路时，在右下角平滑浮现轻量毛玻璃提示胶囊，绝不强行暂停或遮挡用户正在观看的视频；
 * 8 秒无操作自动收起（鼠标悬停时保持），支持 Esc 键一键忽略。
 */
export function SpeedSuggestionDialog({
  currentSourceName,
  target,
  onAccept,
  onDismiss,
}: {
  currentSourceName: string;
  target: CandidateItem;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  // 8 秒无交互自动温和消隐，避免常驻干扰观影
  useEffect(() => {
    if (hovered) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 8000);
    return () => clearTimeout(timer);
  }, [hovered, onDismiss]);

  return (
    <div
      className="fixed bottom-4 right-4 z-[70] max-w-sm w-[calc(100vw-2rem)] sm:w-88 animate-slide-up pointer-events-auto"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="status"
      aria-live="polite"
      aria-label="发现更快的播放线路"
    >
      <div className="rounded-xl border border-accent/40 bg-surface-raised/95 backdrop-blur-md p-3.5 shadow-2xl">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <Icon name="bolt" className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-semibold text-content truncate">
                  发现极速线路 · {target.source.name}
                </h3>
                {target.gainPercent ? (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold shrink-0">
                    提速 {target.gainPercent}%
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-faint truncate mt-0.5">
                当前 {currentSourceName}
                {target.baselineMs ? ` (${target.baselineMs}ms)` : ''} → 推荐
                {target.ms ? ` (${target.ms}ms)` : ''}，无缝保留进度
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="text-faint hover:text-content p-1 rounded-md transition-colors shrink-0 cursor-pointer"
            aria-label="忽略线路推荐"
            title="忽略 (Esc)"
          >
            <Icon name="close" className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 mt-3 pt-2.5 border-t border-line/50">
          <button
            type="button"
            onClick={onDismiss}
            className="btn-ghost btn-sm !py-1 !px-2.5 text-xs"
          >
            保持当前
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="btn-primary btn-sm !py-1 !px-3 text-xs flex items-center gap-1"
          >
            <Icon name="bolt" className="w-3 h-3" />
            <span>立即秒切</span>
          </button>
        </div>
      </div>
    </div>
  );
}
