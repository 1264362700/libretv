'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from '@/lib/i18n';
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
import { Spinner } from '@/components/states';
import { SwitchSourceModal } from '@/components/switch-source';
import { enqueueDownload } from '@/components/download-manager';
import { Icon } from '@/components/icon';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/toast';
import { ThemeToggle } from '@/components/theme';
import type { PlayerShellHandle } from '@/components/player-shell';
import { resolveSource, useAppStore } from '@/lib/store';
import { db, favoriteIdOf, markFavoriteSeenEpisodes, toggleFavorite } from '@/lib/db';
import { buildWatchUrl, cn } from '@/lib/utils';
import { getSourceQoSBadge } from '@/lib/source-circuit-breaker';
import { parseNames, sanitizeDesc } from '@/features/watch/watch-utils';
import { QrHandoffModal, SpeedSuggestionDialog, WatchFallbackState } from '@/features/watch/watch-dialogs';
import { BackButton, HomeButton } from '@/features/watch/watch-buttons';
import { WatchSidebar } from '@/features/watch/watch-sidebar';
import { WatchRecommendations } from '@/features/watch/watch-recommendations';
import { useWatchEngine } from '@/features/watch/use-watch-engine';
import { useWatchProgress } from '@/features/watch/use-watch-progress';

export default function WatchPage() {
  return (
    <Suspense>
      <WatchContent />
    </Suspense>
  );
}

function WatchContent() {
  // 1. Router & Store 参数获取
  const searchParams = useSearchParams();
  const router = useRouter();
  const store = useAppStore();
  const { verified, checked } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const sourceKey = searchParams.get('source') || '';
  const vodId = searchParams.get('id') || '';
  const directUrl = searchParams.get('url') || '';
  const titleParam = searchParams.get('title') || '';
  const doubanIdParam = searchParams.get('douban_id') || '';
  const yearParam = searchParams.get('year') || '';
  const indexParam = parseInt(searchParams.get('index') || '0', 10) || 0;
  const positionParam = parseInt(searchParams.get('position') || '0', 10) || 0;

  const [reversed, setReversed] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [epDescExpanded, setEpDescExpanded] = useState(false);
  const [selectedPoster, setSelectedPoster] = useState<string | undefined>(undefined);
  const [theaterMode, setTheaterMode] = useState(false);
  const playerRef = useRef<PlayerShellHandle | null>(null);

  const source = resolveSource(store, sourceKey, {
    url: searchParams.get('sourceUrl') || undefined,
    detail: searchParams.get('detail') || undefined,
  });
  const hasStaleSource = Boolean(sourceKey && !source);

  // 2. 主查询 Hooks
  const detailQuery = useQuery({
    queryKey: ['detail', sourceKey, vodId, source?.url],
    queryFn: ({ signal }) => api.detail(vodId, source!, signal),
    enabled: Boolean(source && vodId && verified),
    staleTime: 5 * 60_000,
  });

  // 3. 衍生变量计算
  const episodes = useMemo(() => detailQuery.data?.episodes ?? [], [detailQuery.data]);
  const videoTitle = titleParam || detailQuery.data?.videoInfo?.title || t('watch.unknownTitle');

  const currentIndex = useMemo(() => {
    if (episodes.length > 0) return Math.min(Math.max(indexParam, 0), episodes.length - 1);
    return indexParam;
  }, [episodes, indexParam]);

  const currentUrl = useMemo(() => {
    if (episodes.length > 0) {
      return episodes[currentIndex] || directUrl;
    }
    return directUrl;
  }, [episodes, currentIndex, directUrl]);

  const orderedEpisodes = useMemo(
    () => (reversed ? [...episodes].map((_, i) => episodes.length - 1 - i) : episodes.map((_, i) => i)),
    [episodes, reversed]
  );

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

  // 4. 次级联动 Hooks（进度管理 + 流式并发换源引擎）
  const { getCurrentPosition, getRestorePosition, handleProgress, handleEnded } = useWatchProgress({
    verified,
    sourceKey,
    sourceUrl: source?.url,
    vodId,
    videoTitle,
    coverPic: detailQuery.data?.videoInfo?.cover,
    currentIndex,
    totalEpisodes: episodes.length,
    currentUrl,
    positionParam,
    autoplayNext: store.autoplayNext,
    goEpisode,
  });

  const {
    allCandidateSources,
    candidates,
    candidatesLoading,
    streamProgress,
    streamMatchedList,
    matchingDone,
    isMatching,
    speedSuggestion,
    speedTesting,
    failedSources,
    switchToCandidate,
    dismissSpeedSuggestion,
    acceptSpeedSuggestion,
    handleAutoFailover,
  } = useWatchEngine({
    store,
    verified,
    sourceKey,
    source,
    hasStaleSource,
    vodId,
    titleParam,
    videoTitle,
    doubanIdParam,
    yearParam,
    indexParam,
    currentIndex,
    detailIsError: detailQuery.isError,
    getCurrentPosition,
    router,
    toast,
  });

  // 影片元数据合成（采集源详情与候选源合并）
  const videoInfo = detailQuery.data?.videoInfo;
  const coverUrl = videoInfo?.cover || candidates.find((c) => c.result.pic)?.result.pic;
  const yearText = videoInfo?.year || candidates.find((c) => c.result.year)?.result.year;
  const typeText = videoInfo?.typeName || candidates.find((c) => c.result.typeName)?.result.typeName;
  const areaText = videoInfo?.area || candidates.find((c) => c.result.area)?.result.area;
  const remarksText = videoInfo?.remarks || candidates.find((c) => c.result.remarks)?.result.remarks;

  const actorList = useMemo(() => {
    return parseNames(videoInfo?.actor);
  }, [videoInfo?.actor]);

  const directorList = useMemo(() => {
    return parseNames(videoInfo?.director);
  }, [videoInfo?.director]);

  const cleanDesc = useMemo(() => {
    return sanitizeDesc(videoInfo?.desc);
  }, [videoInfo?.desc]);

  const extraPics = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    if (coverUrl) {
      list.push(coverUrl);
      seen.add(coverUrl);
    }
    for (const c of candidates) {
      if (c.result.pic && !seen.has(c.result.pic)) {
        list.push(c.result.pic);
        seen.add(c.result.pic);
      }
    }
    return list;
  }, [coverUrl, candidates]);

  const activePoster = selectedPoster || coverUrl;

  const recommendCategory = useMemo(() => {
    const combined = `${typeText || ''} ${videoTitle || ''}`.toLowerCase();
    if (combined.includes('漫') || combined.includes('动画') || combined.includes('番剧')) return 'anime';
    if (combined.includes('综艺')) return 'variety';
    if (combined.includes('纪录') || combined.includes('记录')) return 'documentary';
    if (
      combined.includes('剧') ||
      combined.includes('电视') ||
      combined.includes('连续剧') ||
      combined.includes('国产') ||
      combined.includes('美剧') ||
      combined.includes('韩剧')
    ) {
      return 'tv';
    }
    return 'movie';
  }, [typeText, videoTitle]);

  const isTvOrAnime = useMemo(() => {
    return recommendCategory === 'tv' || recommendCategory === 'anime' || episodes.length > 1;
  }, [recommendCategory, episodes.length]);

  const episodeIntroQuery = useQuery({
    queryKey: ['episode-intro', videoTitle, currentIndex + 1, recommendCategory],
    queryFn: async ({ signal }) => {
      if (!videoTitle || videoTitle === t('watch.unknownTitle')) return null;
      const res = await fetch(
        `/api/media/episode-intro?title=${encodeURIComponent(videoTitle)}&episode=${currentIndex + 1}&type=${recommendCategory}`,
        { signal }
      );
      if (!res.ok) return null;
      return (await res.json()) as {
        ok: boolean;
        episode: number;
        title?: string;
        desc?: string;
        airdate?: string;
        duration?: string;
        source?: string;
      };
    },
    enabled: isTvOrAnime && Boolean(videoTitle && videoTitle !== t('watch.unknownTitle')),
    staleTime: 60 * 60_000,
  });

  // 5. 交互回调与生命周期 Effects
  const favEntry = useLiveQuery(
    () => (videoTitle && videoTitle !== t('watch.unknownTitle') ? db.favorites.get(favoriteIdOf(videoTitle)) : undefined),
    [videoTitle]
  );
  const isFavorited = Boolean(favEntry);

  // 若该剧已在追剧单中，进入播放页时自动同步最新已知集数以消除更新红点
  useEffect(() => {
    if (isFavorited && episodes.length > 0 && videoTitle !== '未知视频') {
      void markFavoriteSeenEpisodes(videoTitle, episodes.length, videoInfo?.remarks);
    }
  }, [isFavorited, episodes.length, videoTitle, videoInfo?.remarks]);

  const handleToggleFavorite = useCallback(async () => {
    if (!videoTitle || videoTitle === t('watch.unknownTitle')) return;
    const added = await toggleFavorite({
      title: videoTitle,
      sourceKey,
      sourceUrl: source?.url,
      vodId,
      pic: activePoster,
      year: yearText,
      typeName: typeText,
      remarks: videoInfo?.remarks || remarksText,
      lastKnownEpisodes: episodes.length > 0 ? episodes.length : undefined,
    });
    toast(
      added ? `已将「${videoTitle}」加入我的追剧单，更新时将自动提醒` : `已将「${videoTitle}」移出追剧单`,
      added ? 'success' : 'info'
    );
  }, [videoTitle, sourceKey, source?.url, vodId, activePoster, yearText, typeText, videoInfo?.remarks, remarksText, episodes.length, toast]);

  useEffect(() => {
    if (checked && !verified) {
      if (typeof window !== 'undefined') {
        const currentUrlPath = window.location.pathname + window.location.search;
        router.replace(`/login?redirect=${encodeURIComponent(currentUrlPath)}`);
      }
    }
  }, [checked, verified, router]);

  useEffect(() => {
    setDescExpanded(false);
    setSelectedPoster(undefined);
  }, [vodId, titleParam]);

  useEffect(() => {
    setEpDescExpanded(false);
  }, [currentIndex, videoTitle]);

  // 6. JSX 模板渲染
  if (!verified) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-page">
        <Spinner size="md" />
        <p className="text-faint text-xs">正在跳转至登录校验...</p>
      </div>
    );
  }

  if (!source) {
    return (
      <WatchFallbackState
        titleParam={titleParam}
        sourceKey={sourceKey}
        hasStaleSource={hasStaleSource}
        matchingDone={matchingDone}
        matchedCount={streamMatchedList.length}
        streamProgress={streamProgress}
        candidateSourceCount={allCandidateSources.length}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-page">
      {/* 顶部自适应导航 */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-3">
          <BackButton />
          <HomeButton />
          <div className="min-w-0 flex-1 px-1 sm:px-2">
            <h1 className="text-sm font-semibold text-content truncate leading-tight">{videoTitle}</h1>
            <p className="text-[11px] text-faint truncate mt-0.5">
              <span className="text-accent font-medium whitespace-nowrap">{source.name}</span>
              {episodes.length > 0 && ` · 第 ${currentIndex + 1}/${episodes.length} 集`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleToggleFavorite}
              className={cn(
                'btn-sm flex items-center gap-1 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer border',
                isFavorited
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                  : 'btn-ghost border-transparent'
              )}
              title={isFavorited ? '已在追剧单中，点击取消追剧' : '加入追剧单，更新时首页红点提醒'}
            >
              <span>{isFavorited ? '★' : '☆'}</span>
              <span className="hidden sm:inline">{isFavorited ? t('watch.favActive') : t('card.fav.inactive')}</span>
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm flex items-center gap-1 shrink-0"
              onClick={() => setHandoffOpen(true)}
              title="生成跨屏接力二维码，手机/电视一扫即从当前秒数续播"
            >
              <span>📱</span>
              <span className="hidden sm:inline">跨屏接力</span>
            </button>
            <button
              className="btn-ghost btn-sm hidden md:inline-flex"
              onClick={() => {
                if (!currentUrl) return;
                enqueueDownload({
                  url: currentUrl,
                  title: `${videoTitle}${episodes.length > 1 ? ` 第${currentIndex + 1}集` : ''}`,
                  format: 'MP4',
                });
              }}
            >
              <Icon name="download" className="w-3.5 h-3.5 mr-1" />
              下载本集
            </button>
            <button
              className="btn-ghost btn-sm flex items-center gap-1 shrink-0"
              onClick={() => setSwitchOpen(true)}
              title="完整测速与换源面板"
            >
              <Icon name="bolt" className="w-3.5 h-3.5 text-accent" />
              <span className="hidden sm:inline">测速换源</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-2 sm:px-4 py-3 sm:py-5 overflow-x-hidden">
        <div
          className={cn(
            'grid grid-cols-1 gap-4 sm:gap-5 items-start transition-all duration-300',
            !theaterMode && 'lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px]'
          )}
        >
          {/* 左侧主视区：动态环境光影 + 播放器 + 视频信息 + 就地选源面板 */}
          <div className="min-w-0 w-full space-y-3.5">
            <div className="relative">
              {/* 影院级动态环境弥散光晕（Ambient Glow） */}
              {activePoster && (
                <div
                  className="hidden sm:block absolute -inset-4 rounded-3xl bg-cover bg-center opacity-20 dark:opacity-30 blur-3xl pointer-events-none select-none -z-10 transition-all duration-1000"
                  style={{ backgroundImage: `url(${activePoster})` }}
                  aria-hidden
                />
              )}
              <div
                className={cn(
                  'relative aspect-video w-full bg-black rounded-xl overflow-hidden shadow-2xl border border-line/40 transition-all duration-300',
                  theaterMode ? 'max-h-[84vh]' : 'max-h-[72vh]'
                )}
              >
                {currentUrl ? (
                  <PlayerShell
                    ref={playerRef}
                    url={currentUrl}
                    title={videoTitle}
                    adFilter={store.adFilter}
                    autoplayNext={store.autoplayNext}
                    episodeKey={`${sourceKey}:${vodId}:${currentIndex}`}
                    nextUrl={currentIndex + 1 < episodes.length ? episodes[currentIndex + 1] : undefined}
                    nextEpisodeKey={
                      currentIndex + 1 < episodes.length ? `${sourceKey}:${vodId}:${currentIndex + 1}` : undefined
                    }
                    getRestorePosition={getRestorePosition}
                    onTimeUpdate={handleProgress}
                    onPause={handleProgress}
                    onEnded={handleEnded}
                    onRequestSwitchSource={handleAutoFailover}
                    episodes={episodes}
                    currentEpisodeIndex={currentIndex}
                    onSelectEpisode={goEpisode}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-3 bg-black/90">
                    {detailQuery.isLoading ? (
                      <Spinner size="lg" />
                    ) : (
                      <>
                        <p className="text-danger text-sm text-center">
                          {detailQuery.isError ? t('watch.detailFailed') : t('watch.noPlayableUrl')}
                        </p>
                        {candidates.filter((c) => c.source.key !== sourceKey).length > 0 && (
                          <button
                            type="button"
                            className="btn-primary text-xs px-3.5 py-1.5"
                            onClick={() => handleAutoFailover(t('watch.sourceUnavailable'))}
                          >
                            立即切换至备用线路
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 视频信息与快捷控制栏 */}
            <div className="mt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-lg font-bold text-content truncate leading-snug">{videoTitle}</h2>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted min-w-0">
                  <span className="tag bg-accent/15 text-accent font-medium whitespace-nowrap shrink-0">{source.name}</span>
                  {episodes.length > 0 && (
                    <span className="truncate">
                      正在播放 第 {currentIndex + 1} 集（共 {episodes.length} 集
                      {videoInfo?.remarks ? ` · ${videoInfo.remarks}` : ''}）
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap shrink-0">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost px-2.5"
                  disabled={currentIndex <= 0}
                  onClick={() => goEpisode(currentIndex - 1)}
                  title="上一集 (Alt+←)"
                >
                  上一集
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost px-2.5"
                  disabled={episodes.length === 0 || currentIndex >= episodes.length - 1}
                  onClick={() => goEpisode(currentIndex + 1)}
                  title="下一集 (Alt+→)"
                >
                  下一集
                </button>
                <button
                  type="button"
                  className={cn(
                    'btn btn-sm px-2 text-xs hidden lg:inline-flex',
                    theaterMode ? 'bg-accent/15 text-accent border border-accent/40' : 'btn-ghost'
                  )}
                  onClick={() => setTheaterMode((prev) => !prev)}
                  title="切换影院宽屏模式（收起/展开右侧选集栏）"
                >
                  {theaterMode ? t('watch.exitWidescreen') : t('watch.enterWidescreen')}
                </button>
                <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none px-2 py-1 rounded-md bg-chip/40 hover:bg-chip transition-colors">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-accent"
                    checked={store.autoplayNext}
                    onChange={(e) => store.updateSettings({ autoplayNext: e.target.checked })}
                  />
                  自动连播
                </label>
              </div>
            </div>

            {/* 播放线路 / 来源切换栏（支持动态 QoS 评级与实时延迟展示） */}
            <div className="p-3 sm:p-3.5 bg-surface-raised rounded-xl border border-line shadow-sm min-w-0 max-w-full overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-content flex items-center gap-1.5">
                    <Icon name="bolt" className="w-3.5 h-3.5 text-accent" />
                    播放线路
                  </span>
                  <span className="text-[11px] text-faint">
                    {isMatching || candidatesLoading
                      ? streamProgress
                        ? `${t('watch.probingSources')} 已检测 ${streamProgress.completed}/${streamProgress.total}，命中 ${streamProgress.matched} 条`
                        : t('watch.probingSources')
                      : speedTesting
                        ? t('watch.matchingSources')
                        : `共 ${candidates.length} 条高速线路`}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  onClick={() => setSwitchOpen(true)}
                  title="打开测速弹窗查看详细延迟与各源集数"
                >
                  <span>测速面板</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar scroll-smooth w-full min-w-0">
                {candidates.map((c) => {
                  const isCurrent = c.source.key === sourceKey;
                  const isFailed = failedSources.has(c.source.key);
                  const qos = getSourceQoSBadge(c.source.key);
                  return (
                    <button
                      key={c.source.key}
                      type="button"
                      onClick={() => switchToCandidate(c, true)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 border shrink-0 touch-manipulation focus-visible:ring-2 focus-visible:ring-accent',
                        isCurrent
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : isFailed
                            ? 'bg-surface text-danger/80 border-danger/30 hover:border-danger/60'
                            : 'bg-surface hover:bg-hover text-muted hover:text-content border-line'
                      )}
                      title={
                        isFailed
                          ? t('watch.sourceJustFailed')
                          : `${c.source.name} · 服务质量 ${qos.grade}级 (${qos.label})`
                      }
                    >
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          isCurrent ? 'bg-white animate-pulse' : isFailed ? 'bg-danger' : 'bg-emerald-500'
                        )}
                      />
                      <span className="whitespace-nowrap">{c.source.name}</span>
                      {c.result.remarks && (
                        <span className="text-[10px] opacity-80 font-mono">({c.result.remarks})</span>
                      )}
                      {c.ms ? (
                        <span className="text-[10px] text-emerald-400 font-mono">· {c.ms}ms</span>
                      ) : null}
                      {isCurrent && <span className="text-[10px] opacity-80 font-normal">（当前）</span>}
                      {isFailed && !isCurrent && <span className="text-[10px] text-danger">（受阻）</span>}
                    </button>
                  );
                })}
                {candidatesLoading && (
                  <span className="text-xs text-faint flex items-center gap-1.5 px-2 py-1 shrink-0">
                    <Spinner size="sm" /> 正在搜寻其他线路...
                  </span>
                )}
                {!candidatesLoading && candidates.length === 0 && (
                  <span className="text-xs text-faint px-1 shrink-0">未找到其他同名播放线路</span>
                )}
              </div>
            </div>
          </div>

          {/* 右侧侧栏：剧集选集（支持百集分段折叠） + 本集看点 + 影片档案与演职员探索图谱 */}
          <WatchSidebar
            episodes={episodes}
            orderedEpisodes={orderedEpisodes}
            currentIndex={currentIndex}
            goEpisode={goEpisode}
            reversed={reversed}
            setReversed={setReversed}
            detailQuery={detailQuery}
            isTvOrAnime={isTvOrAnime}
            episodeIntroQuery={episodeIntroQuery}
            epDescExpanded={epDescExpanded}
            setEpDescExpanded={setEpDescExpanded}
            descExpanded={descExpanded}
            setDescExpanded={setDescExpanded}
            videoTitle={videoTitle}
            yearText={yearText}
            typeText={typeText}
            areaText={areaText}
            remarksText={remarksText}
            actorList={actorList}
            directorList={directorList}
            cleanDesc={cleanDesc}
            extraPics={extraPics}
            activePoster={activePoster}
            setSelectedPoster={setSelectedPoster}
            store={store}
            router={router}
          />
        </div>

        {/* 猜你喜欢全宽智能推荐专区 */}
        <WatchRecommendations
          videoTitle={videoTitle}
          recommendCategory={recommendCategory}
          onNavigate={(href) => router.push(href)}
        />
      </main>

      {switchOpen && (
        <SwitchSourceModal
          currentTitle={videoTitle}
          currentSourceKey={sourceKey}
          currentVodId={vodId}
          currentIndex={currentIndex}
          currentPosition={getCurrentPosition()}
          onClose={() => setSwitchOpen(false)}
        />
      )}

      {handoffOpen && (
        <QrHandoffModal
          videoTitle={videoTitle}
          episodeIndex={currentIndex}
          totalEpisodes={episodes.length}
          positionSeconds={getCurrentPosition()}
          handoffUrl={
            typeof window !== 'undefined'
              ? `${window.location.origin}${buildWatchUrl({
                  sourceKey,
                  vodId,
                  index: currentIndex,
                  title: videoTitle,
                  sourceUrl: source?.url,
                  detail: source?.detail,
                  position: getCurrentPosition() > 0 ? getCurrentPosition() : undefined,
                })}`
              : ''
          }
          onClose={() => setHandoffOpen(false)}
        />
      )}

      {speedSuggestion && (
        <SpeedSuggestionDialog
          currentSourceName={source?.name || sourceKey}
          target={speedSuggestion}
          onAccept={acceptSpeedSuggestion}
          onDismiss={dismissSpeedSuggestion}
        />
      )}
    </div>
  );
}
