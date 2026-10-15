'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
// 播放器（artplayer + hls.js）按需加载：拆出独立 chunk，不占首屏 First Load JS
const PlayerShell = dynamic(() => import('@/components/player-shell').then((m) => m.PlayerShell), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  ),
});
import { EmptyState, LoadingState, Spinner } from '@/components/states';
import { SwitchSourceModal } from '@/components/switch-source';
import { enqueueDownload } from '@/components/download-manager';
import { Icon } from '@/components/icon';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/toast';
import { resolveSource, useAppStore } from '@/lib/store';
import type { SourceConfig, SearchResultItem } from '@/lib/types';
import {
  clearProgress,
  progressKeyOf,
  saveProgress,
  updateHistoryProgress,
  upsertHistory,
  db,
} from '@/lib/db';
import { buildWatchUrl, cn } from '@/lib/utils';

interface CandidateItem {
  source: SourceConfig;
  result: SearchResultItem;
}

/**
 * 播放页（唯一入口，替代旧版 watch.html → player.html 跳转链）。
 * 状态全部由 URL 驱动：/watch?source=xx&id=..&index=..&title=..
 * 集数列表由服务端详情接口获取；进度与历史走 IndexedDB。
 */
export default function WatchPage() {
  return (
    <Suspense>
      <WatchContent />
    </Suspense>
  );
}

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const store = useAppStore();
  const { verified } = useAuth();
  const { toast } = useToast();

  const sourceKey = searchParams.get('source') || '';
  const vodId = searchParams.get('id') || '';
  const directUrl = searchParams.get('url') || '';
  const titleParam = searchParams.get('title') || '';
  const indexParam = parseInt(searchParams.get('index') || '0', 10) || 0;

  const [reversed, setReversed] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);

  // 记录当前播放秒数，供换源时无缝保留时间戳
  const currentPosRef = useRef(0);

  // 记录播放受阻/失败的源，避免自动换源陷入无限循环
  const failedSourcesRef = useRef<Set<string>>(new Set());
  const [failedSources, setFailedSources] = useState<Set<string>>(new Set());

  const source = resolveSource(store, sourceKey, {
    url: searchParams.get('sourceUrl') || undefined,
    detail: searchParams.get('detail') || undefined,
  });

  // 详情查询：无 id（纯直连链接分享）时跳过
  const detailQuery = useQuery({
    queryKey: ['detail', sourceKey, vodId, source?.url],
    queryFn: ({ signal }) => api.detail(vodId, source!, signal),
    enabled: Boolean(source && vodId && verified),
    staleTime: 5 * 60_000,
  });

  const episodes = useMemo(() => detailQuery.data?.episodes ?? [], [detailQuery.data]);
  const videoTitle = titleParam || detailQuery.data?.videoInfo?.title || '未知视频';

  // 收集当前系统所有已启用的点播源（含当前源兜底）
  const allCandidateSources = useMemo(() => {
    const seen = new Set<string>();
    const list = store.selectedKeys
      .map((key) => resolveSource(store, key))
      .filter((s): s is SourceConfig => {
        if (!s || seen.has(s.key)) return false;
        seen.add(s.key);
        return true;
      });
    if (source && !seen.has(source.key)) {
      list.unshift(source);
    }
    return list;
  }, [store, source]);

  // 背景检索：在所有可用源中探测同名/前缀匹配资源，供播放页就地选源与自动换源
  const candidatesQuery = useQuery({
    queryKey: ['watch-sources', videoTitle, allCandidateSources.map((s) => s.key).join(',')],
    queryFn: async ({ signal }): Promise<CandidateItem[]> => {
      if (!videoTitle || videoTitle === '未知视频' || allCandidateSources.length === 0) return [];
      const title = videoTitle.trim();
      const matched: CandidateItem[] = [];
      const seenKeys = new Set<string>();

      try {
        const { list } = await api.search(title, allCandidateSources, store.yellowFilter, { signal });
        for (const s of allCandidateSources) {
          if (seenKeys.has(s.key)) continue;
          const hits = list.filter((r) => r.sourceKey === s.key);
          const exact =
            hits.find((r) => (r.name || '').trim() === title) ??
            hits.find((r) => (r.name || '').trim().startsWith(title));
          if (exact) {
            seenKeys.add(s.key);
            matched.push({ source: s, result: exact });
          }
        }
      } catch {
        // 搜索异常时不影响当前源正常播放
      }

      // 保证当前正在播放的源始终存在于候选列表中
      if (source && vodId && !seenKeys.has(source.key)) {
        matched.unshift({
          source,
          result: {
            sourceKey: source.key,
            vodId,
            name: videoTitle,
          } as SearchResultItem,
        });
      }
      return matched;
    },
    enabled: Boolean(videoTitle && videoTitle !== '未知视频' && verified && allCandidateSources.length > 0),
    staleTime: 5 * 60_000,
  });

  const candidates = useMemo(() => {
    const list = candidatesQuery.data ?? [];
    if (source && vodId && !list.some((c) => c.source.key === source.key)) {
      return [{ source, result: { sourceKey: source.key, vodId, name: videoTitle } as SearchResultItem }, ...list];
    }
    return list;
  }, [candidatesQuery.data, source, vodId, videoTitle]);

  // 当前播放地址：优先取剧集列表中的当前集，其次直连 URL 参数
  const currentUrl = useMemo(() => {
    if (episodes.length > 0) {
      const idx = Math.min(Math.max(indexParam, 0), episodes.length - 1);
      return episodes[idx] || directUrl;
    }
    return directUrl;
  }, [episodes, indexParam, directUrl]);

  const currentIndex = useMemo(() => {
    if (episodes.length > 0) return Math.min(Math.max(indexParam, 0), episodes.length - 1);
    return indexParam;
  }, [episodes, indexParam]);

  const goEpisode = useCallback(
    (index: number) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set('index', String(index));
      sp.set('url', episodes[index] || directUrl);
      sp.delete('position');
      router.replace(`/watch?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams, episodes, directUrl]
  );

  // 进度恢复优先级：URL position 参数 > IndexedDB 记录
  const getRestorePosition = useCallback(async () => {
    const urlPos = parseInt(searchParams.get('position') || '0', 10) || 0;
    if (urlPos > 0) return urlPos;
    if (!vodId) return 0;
    const entry = await db.progress.get(progressKeyOf(sourceKey, vodId, currentIndex));
    return entry?.position ?? 0;
  }, [searchParams, sourceKey, vodId, currentIndex]);

  // 写入观看历史（进入页面即记录，进度后续增量更新）
  useEffect(() => {
    if (!verified || !sourceKey || !currentUrl) return;
    const timer = setTimeout(() => {
      upsertHistory({
        sourceKey,
        sourceUrl: source?.url,
        vodId: vodId || currentUrl,
        title: videoTitle,
        pic: detailQuery.data?.videoInfo?.cover,
        episodeIndex: currentIndex,
        totalEpisodes: episodes.length,
        playbackPosition: 0,
        duration: 0,
        timestamp: Date.now(),
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, sourceKey, vodId, currentIndex, videoTitle, currentUrl]);

  // 播放中与暂停时的进度落盘逻辑一致，共用同一回调
  const handleProgress = useCallback(
    (position: number, duration: number) => {
      currentPosRef.current = Math.round(position);
      if (vodId) {
        saveProgress(sourceKey, vodId, currentIndex, position, duration).catch(() => {});
        updateHistoryProgress(sourceKey, vodId || currentUrl, position, duration).catch(() => {});
      }
    },
    [sourceKey, vodId, currentIndex, currentUrl]
  );

  // 自动连播的 800ms 延迟切集要在卸载时取消，避免离开页面后跳转
  const autoNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
  }, []);

  const handleEnded = useCallback(() => {
    if (vodId) clearProgress(sourceKey, vodId, currentIndex).catch(() => {});
    if (store.autoplayNext && currentIndex < episodes.length - 1) {
      autoNextTimer.current = setTimeout(() => goEpisode(currentIndex + 1), 800);
    }
  }, [store.autoplayNext, currentIndex, episodes.length, goEpisode, sourceKey, vodId]);

  // 切换线路（保留当前集数与播放时间戳）
  const switchToCandidate = useCallback(
    (cand: CandidateItem, userInitiated = true) => {
      if (cand.source.key === sourceKey) return;
      if (userInitiated) {
        // 用户主动点击测试或换源，将其从失败受阻记录中解除
        failedSourcesRef.current.delete(cand.source.key);
        setFailedSources(new Set(failedSourcesRef.current));
      }
      const pos = currentPosRef.current;
      router.push(
        buildWatchUrl({
          sourceKey: cand.source.key,
          vodId: cand.result.vodId,
          index: currentIndex,
          title: cand.result.name || videoTitle,
          sourceUrl: cand.source.url,
          detail: cand.source.detail,
          position: pos > 0 ? pos : undefined,
        })
      );
    },
    [sourceKey, currentIndex, videoTitle, router]
  );

  // 全自动故障换源逻辑
  const autoFailoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleAutoFailover = useCallback(
    (reason: string) => {
      if (!sourceKey) return;
      failedSourcesRef.current.add(sourceKey);
      setFailedSources(new Set(failedSourcesRef.current));

      const viable = candidates.filter(
        (c) => c.source.key !== sourceKey && !failedSourcesRef.current.has(c.source.key)
      );

      if (viable.length === 0) {
        if (candidates.length > 1) {
          toast('所有已探测的播放线路均已尝试且受阻，请检查网络或稍后重试', 'error');
        } else {
          toast('未找到其他可用的备用线路，可在设置中添加更多视频源', 'warning');
        }
        return;
      }

      const nextTarget = viable[0];
      toast(
        `当前线路「${source?.name || sourceKey}」播放受阻${reason ? `（${reason}）` : ''}，正在自动切换至「${nextTarget.source.name}」...`,
        'info'
      );

      if (autoFailoverTimerRef.current) clearTimeout(autoFailoverTimerRef.current);
      autoFailoverTimerRef.current = setTimeout(() => {
        switchToCandidate(nextTarget, false);
      }, 500);
    },
    [sourceKey, source?.name, candidates, toast, switchToCandidate]
  );

  useEffect(() => {
    return () => {
      if (autoFailoverTimerRef.current) clearTimeout(autoFailoverTimerRef.current);
    };
  }, []);

  // 详情接口加载失败时（源接口404/500/跨域失败等），自动切换至备用线路
  useEffect(() => {
    if (detailQuery.isError && sourceKey && !failedSourcesRef.current.has(sourceKey)) {
      const timer = setTimeout(() => {
        handleAutoFailover('数据源详情接口请求异常');
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [detailQuery.isError, sourceKey, handleAutoFailover]);

  // Alt+←/→ 集数切换快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        goEpisode(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < episodes.length - 1) {
        e.preventDefault();
        goEpisode(currentIndex + 1);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentIndex, episodes.length, goEpisode]);

  const orderedEpisodes = reversed ? [...episodes].map((_, i) => episodes.length - 1 - i) : episodes.map((_, i) => i);

  if (!verified) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-faint text-sm">等待访问验证...</p>
      </div>
    );
  }

  if (!source) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-content font-medium mb-2">点播源不存在</h1>
          <p className="text-sm text-muted mb-4">
            该视频来自点播源「{sourceKey}」，但它可能已被删除。请在设置中重新添加后重试。
          </p>
          <Link href="/" className="btn-primary">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <BackButton />
          <HomeButton />
          <div className="min-w-0">
            <h1 className="text-sm font-medium text-content truncate">{videoTitle}</h1>
            <p className="text-xs text-faint">
              {source.name}
              {episodes.length > 0 && ` · 第 ${currentIndex + 1}/${episodes.length} 集`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="btn-ghost btn-sm"
              onClick={() => {
                if (!currentUrl) return;
                enqueueDownload({
                  url: currentUrl,
                  title: `${videoTitle}${episodes.length > 1 ? ` 第${currentIndex + 1}集` : ''}`,
                  format: 'MP4',
                });
              }}
            >
              下载本集
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setSwitchOpen(true)}>
              切换资源
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <div>
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              {currentUrl ? (
                <PlayerShell
                  url={currentUrl}
                  title={videoTitle}
                  adFilter={store.adFilter}
                  autoplayNext={store.autoplayNext}
                  episodeKey={`${sourceKey}:${vodId}:${currentIndex}`}
                  nextUrl={currentIndex + 1 < episodes.length ? episodes[currentIndex + 1] : undefined}
                  nextEpisodeKey={currentIndex + 1 < episodes.length ? `${sourceKey}:${vodId}:${currentIndex + 1}` : undefined}
                  getRestorePosition={getRestorePosition}
                  onTimeUpdate={handleProgress}
                  onPause={handleProgress}
                  onEnded={handleEnded}
                  onRequestSwitchSource={handleAutoFailover}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-3 bg-black/90">
                  {detailQuery.isLoading ? (
                    <Spinner size="lg" />
                  ) : (
                    <>
                      <p className="text-danger text-sm text-center">
                        {detailQuery.isError ? '视频详情获取失败，当前线路暂不可用' : '当前线路暂无可用播放地址'}
                      </p>
                      {candidates.filter((c) => c.source.key !== sourceKey).length > 0 && (
                        <button
                          type="button"
                          className="btn-primary text-xs px-3.5 py-1.5"
                          onClick={() => handleAutoFailover('当前线路无法播放')}
                        >
                          立即切换至备用线路
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 操作栏 */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                className="btn-ghost btn-sm"
                disabled={currentIndex <= 0}
                onClick={() => goEpisode(currentIndex - 1)}
              >
                上一集
              </button>
              <button
                className="btn-ghost btn-sm"
                disabled={episodes.length === 0 || currentIndex >= episodes.length - 1}
                onClick={() => goEpisode(currentIndex + 1)}
              >
                下一集
              </button>
              <label className="flex items-center gap-1.5 text-xs text-muted ml-auto cursor-pointer">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[#2563eb]"
                  checked={store.autoplayNext}
                  onChange={(e) => store.updateSettings({ autoplayNext: e.target.checked })}
                />
                自动连播
              </label>
            </div>

            {/* 播放线路 / 选源面板（直接内嵌在播放页） */}
            <div className="mt-4 p-3.5 bg-surface-raised rounded-xl border border-line">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-content flex items-center gap-1.5">
                    <Icon name="bolt" className="w-3.5 h-3.5 text-accent" />
                    播放线路
                  </span>
                  <span className="text-[11px] text-faint">
                    {candidatesQuery.isLoading ? '正在探测可用线路...' : `共 ${candidates.length} 条线路`}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  onClick={() => setSwitchOpen(true)}
                  title="打开测速弹窗查看详细延迟与各源集数"
                >
                  <span>详细测速面板</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* 线路水平滚动按钮栏 */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
                {candidates.map((c) => {
                  const isCurrent = c.source.key === sourceKey;
                  const isFailed = failedSources.has(c.source.key);
                  return (
                    <button
                      key={c.source.key}
                      type="button"
                      onClick={() => switchToCandidate(c, true)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 border',
                        isCurrent
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : isFailed
                            ? 'bg-surface text-danger/70 border-danger/30 hover:border-danger/60'
                            : 'bg-surface hover:bg-hover text-muted hover:text-content border-line'
                      )}
                      title={isFailed ? '该线路刚刚发生播放故障，点击可重新尝试' : c.source.name}
                    >
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          isCurrent ? 'bg-white animate-pulse' : isFailed ? 'bg-danger' : 'bg-emerald-500'
                        )}
                      />
                      <span>{c.source.name}</span>
                      {isCurrent && <span className="text-[10px] opacity-80 font-normal">（当前）</span>}
                      {isFailed && !isCurrent && <span className="text-[10px] text-danger">（受阻）</span>}
                    </button>
                  );
                })}
                {candidatesQuery.isLoading && (
                  <span className="text-xs text-faint flex items-center gap-1.5 px-2 py-1">
                    <Spinner size="sm" /> 正在搜寻其他线路...
                  </span>
                )}
                {!candidatesQuery.isLoading && candidates.length === 0 && (
                  <span className="text-xs text-faint px-1">未找到其他同名播放线路</span>
                )}
              </div>
            </div>
          </div>

          {/* 剧集侧栏 */}
          <aside className="bg-surface-raised rounded-lg p-3 h-fit">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <h2 className="text-sm font-semibold text-content">
                剧集列表{episodes.length > 0 && `（${episodes.length}）`}
              </h2>
              {episodes.length > 1 && (
                <button
                  className="btn-ghost btn-sm shrink-0"
                  onClick={() => setReversed((v) => !v)}
                  aria-label={reversed ? '切换为正序排列' : '切换为倒序排列'}
                  title="调整剧集列表的排列顺序"
                >
                  <Icon
                    name="arrowDown"
                    className={cn('w-3.5 h-3.5 transition-transform', reversed && 'rotate-180')}
                  />
                  {reversed ? '正序排列' : '倒序排列'}
                </button>
              )}
            </div>
            {episodes.length === 0 ? (
              detailQuery.isLoading ? (
                <LoadingState />
              ) : (
                <EmptyState variant="plain" title={detailQuery.isError ? '获取剧集失败' : '暂无剧集信息'} />
              )
            ) : (
              <div className="grid grid-cols-5 lg:grid-cols-4 gap-1.5 max-h-[65vh] overflow-y-auto scrollbar-thin pr-1">
                {orderedEpisodes.map((realIndex) => (
                  <EpisodeButton
                    key={realIndex}
                    index={realIndex}
                    active={realIndex === currentIndex}
                    onClick={() => goEpisode(realIndex)}
                  />
                ))}
              </div>
            )}
            <p className="hidden md:block text-[10px] text-faint mt-3 leading-relaxed">
              快捷键：空格 播放/暂停 · ←/→ 快退/快进 5s · ↑/↓ 音量 · F 全屏 · Alt+←/→ 切换集数
            </p>
          </aside>
        </div>
      </main>

      {switchOpen && (
        <SwitchSourceModal
          currentTitle={videoTitle}
          currentSourceKey={sourceKey}
          currentVodId={vodId}
          currentIndex={currentIndex}
          currentPosition={currentPosRef.current}
          onClose={() => setSwitchOpen(false)}
        />
      )}
    </div>
  );
}

/** 集数按钮：激活时自动滚动进可视区（长剧列表） */
function EpisodeButton({ index, active, onClick }: { index: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <button
      ref={ref}
      className={cn('btn btn-sm !px-1', active ? 'episode-active' : 'btn-ghost')}
      onClick={onClick}
    >
      {index + 1}
    </button>
  );
}

function BackButton() {
  const router = useRouter();
  return (
    <button
      className="p-2 -ml-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push('/');
      }}
      aria-label="返回"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

/** 首页按钮：直达首页，避免从外链进入时逐级 back */
function HomeButton() {
  return (
    <Link
      href="/"
      className="p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
      aria-label="回首页"
      title="回首页"
    >
      <Icon name="home" className="w-5 h-5" />
    </Link>
  );
}
