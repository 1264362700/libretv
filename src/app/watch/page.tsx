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
import { SmartImage } from '@/components/smart-image';
import { DoubanCard } from '@/components/video-card';

interface CandidateItem {
  source: SourceConfig;
  result: SearchResultItem;
}

/** 演员与主创姓名解析：按逗号/斜杠/顿号/空格拆分为纯净字符串数组 */
function parseNames(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[/,，、\s|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '未知' && s !== '暂无' && s !== '无');
}

/** 剧情概述净化：去除采集站常见 HTML 实体与 CMS 标签 */
function sanitizeDesc(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
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
  const { verified, checked } = useAuth();
  const { toast } = useToast();

  // 播放前强制登录校验：未登录直接拦截重定向至 /login
  useEffect(() => {
    if (checked && !verified) {
      if (typeof window !== 'undefined') {
        const currentUrl = window.location.pathname + window.location.search;
        router.replace(`/login?redirect=${encodeURIComponent(currentUrl)}`);
      }
    }
  }, [checked, verified, router]);

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

      // 0. 优先从聚合搜索暂存中瞬时秒级载入已知匹配线路
      if (typeof window !== 'undefined' && sourceKey && vodId) {
        try {
          const cachedJson = sessionStorage.getItem(`libretv:matched:${sourceKey}:${vodId}`);
          if (cachedJson) {
            const preMatched = JSON.parse(cachedJson) as Array<{
              sourceKey: string;
              sourceName: string;
              sourceVodId: string;
              sourceUrl?: string;
              remarks?: string;
            }>;
            for (const m of preMatched) {
              const src = allCandidateSources.find((s) => s.key === m.sourceKey);
              if (src && !seenKeys.has(src.key)) {
                seenKeys.add(src.key);
                matched.push({
                  source: src,
                  result: {
                    sourceKey: src.key,
                    sourceName: src.name,
                    vodId: m.sourceVodId,
                    name: videoTitle,
                    sourceUrl: src.url,
                    remarks: m.remarks,
                  },
                });
              }
            }
          }
        } catch {}
      }

      try {
        const { list } = await api.search(title, allCandidateSources, store.yellowFilter, { signal });
        for (const s of allCandidateSources) {
          if (seenKeys.has(s.key)) continue;
          let hitItem: SearchResultItem | undefined;
          for (const item of list) {
            if (item.sourceKey === s.key) {
              hitItem = item;
              break;
            }
            if (item.matchedSources) {
              const ms = item.matchedSources.find((m) => m.sourceKey === s.key);
              if (ms) {
                hitItem = {
                  sourceKey: ms.sourceKey,
                  sourceName: ms.sourceName,
                  vodId: ms.sourceVodId,
                  name: item.name,
                  sourceUrl: ms.sourceUrl || s.url,
                  remarks: ms.remarks,
                };
                break;
              }
            }
          }
          if (hitItem) {
            seenKeys.add(s.key);
            matched.push({ source: s, result: hitItem });
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

  // 影片元数据提取（当前源详情优先，跨源检索候选兜底）
  const videoInfo = detailQuery.data?.videoInfo;
  const coverUrl = videoInfo?.cover || candidates.find((c) => c.result.pic)?.result.pic;
  const yearText = videoInfo?.year || candidates.find((c) => c.result.year)?.result.year;
  const typeText = videoInfo?.typeName || candidates.find((c) => c.result.typeName)?.result.typeName;
  const areaText = videoInfo?.area || candidates.find((c) => c.result.area)?.result.area;
  const remarksText = videoInfo?.remarks || candidates.find((c) => c.result.remarks)?.result.remarks;

  const actorList = useMemo(() => parseNames(videoInfo?.actor), [videoInfo?.actor]);
  const directorList = useMemo(() => parseNames(videoInfo?.director), [videoInfo?.director]);
  const cleanDesc = useMemo(() => sanitizeDesc(videoInfo?.desc), [videoInfo?.desc]);

  const [descExpanded, setDescExpanded] = useState(false);
  useEffect(() => {
    setDescExpanded(false);
  }, [vodId, titleParam]);

  // 跨源候选提供的备选剧照/封面图列表（展示多图）
  const [selectedPoster, setSelectedPoster] = useState<string | undefined>(undefined);
  useEffect(() => {
    setSelectedPoster(undefined);
  }, [vodId, titleParam]);

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

  // 猜你喜欢：推荐类别智能推导（剧集/电影/动漫/综艺/纪录片）
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

  const [recPage, setRecPage] = useState(0);
  const [recRefreshing, setRecRefreshing] = useState(false);
  useEffect(() => {
    setRecPage(0);
  }, [videoTitle]);

  const recommendQuery = useQuery({
    queryKey: ['watch-recommendations', recommendCategory, recPage, videoTitle],
    queryFn: async ({ signal }) => {
      // 1. 优先调用豆瓣同类题材推荐
      try {
        const res = await api.douban(recommendCategory, '热门', recPage * 12, 12, signal);
        if (res.items && res.items.length > 0) {
          const filtered = res.items.filter(
            (item) => item.title && !videoTitle.includes(item.title) && !item.title.includes(videoTitle)
          );
          if (filtered.length > 0) return filtered;
        }
      } catch {
        // 豆瓣源失败，尝试降级
      }

      // 2. 降级备用榜单（百度热播剧榜 / 豆瓣周榜）
      try {
        const hotKey = recommendCategory === 'tv' ? 'baidu_teleplay' : 'douban_weekly';
        const res = await api.hotList(hotKey, signal);
        if (res.items && res.items.length > 0) {
          return res.items.filter(
            (item) => item.title && !videoTitle.includes(item.title) && !item.title.includes(videoTitle)
          );
        }
      } catch {
        // 降级失败
      }
      return [];
    },
    staleTime: 5 * 60_000,
  });

  const handleRefreshRecommend = () => {
    setRecRefreshing(true);
    setRecPage((p) => (p + 1) % 5);
    setTimeout(() => setRecRefreshing(false), 500);
  };

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

  // 当从片库/首页推荐通过标题直接点播进入（无 sourceKey 时），自动挑选第一条匹配的线路起播
  useEffect(() => {
    if (!sourceKey && videoTitle && videoTitle !== '未知视频' && candidatesQuery.data && candidatesQuery.data.length > 0) {
      const best = candidatesQuery.data[0];
      router.replace(
        buildWatchUrl({
          sourceKey: best.source.key,
          vodId: best.result.vodId,
          index: 0,
          title: videoTitle,
          sourceUrl: best.source.url,
          detail: best.source.detail,
        })
      );
    }
  }, [sourceKey, videoTitle, candidatesQuery.data, router]);

  if (!verified) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Spinner size="md" />
        <p className="text-faint text-xs">正在跳转至登录校验...</p>
      </div>
    );
  }

  if (!source) {
    if (titleParam && candidatesQuery.isLoading) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4">
          <Spinner size="lg" />
          <p className="text-sm text-content font-medium">正在全网匹配「{titleParam}」最佳线路并起播...</p>
          <p className="text-xs text-faint">已搜寻 {allCandidateSources.length} 个启用数据源</p>
        </div>
      );
    }

    if (titleParam && candidatesQuery.isSuccess && (!candidatesQuery.data || candidatesQuery.data.length === 0)) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <h1 className="text-content font-semibold text-lg mb-2">未找到该片源</h1>
            <p className="text-sm text-muted mb-5 leading-relaxed">
              当前启用的点播源中暂未匹配到「{titleParam}」。建议在右上角「设置」中开启更多点播源，或返回片库选择其他精彩影片。
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
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-content font-medium mb-2">点播源不存在</h1>
          <p className="text-sm text-muted mb-4">
            该视频来自点播源「{sourceKey || '未知'}」，但它可能已被删除。请在设置中重新添加后重试。
          </p>
          <Link href="/" className="btn-primary">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* 顶部自适应导航：杜绝移动端换行挤压、按键溢出 */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-3">
          <BackButton />
          <HomeButton />
          <div className="min-w-0 flex-1 px-1 sm:px-2">
            <h1 className="text-sm font-semibold text-content truncate leading-tight">{videoTitle}</h1>
            <p className="text-[11px] text-faint truncate mt-0.5">
              <span className="text-accent font-medium">{source.name}</span>
              {episodes.length > 0 && ` · 第 ${currentIndex + 1}/${episodes.length} 集`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              className="btn-ghost btn-sm hidden sm:inline-flex"
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px] gap-4 sm:gap-5 items-start">
          {/* 左侧主视区：播放器 + 视频信息 + 就地选源面板 */}
          <div className="min-w-0 w-full space-y-3.5">
            <div className="relative aspect-video max-h-[72vh] w-full bg-black rounded-xl overflow-hidden shadow-2xl border border-line/40">
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

            {/* 视频信息与快捷控制栏 */}
            <div className="mt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-content truncate leading-snug">{videoTitle}</h2>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                  <span className="tag bg-accent/15 text-accent font-medium">{source.name}</span>
                  {episodes.length > 0 && (
                    <span>正在播放 第 {currentIndex + 1} 集（共 {episodes.length} 集）</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="btn btn-sm btn-ghost px-2.5"
                  disabled={currentIndex <= 0}
                  onClick={() => goEpisode(currentIndex - 1)}
                  title="上一集 (Alt+←)"
                >
                  上一集
                </button>
                <button
                  className="btn btn-sm btn-ghost px-2.5"
                  disabled={episodes.length === 0 || currentIndex >= episodes.length - 1}
                  onClick={() => goEpisode(currentIndex + 1)}
                  title="下一集 (Alt+→)"
                >
                  下一集
                </button>
                <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none px-2 py-1 rounded-md bg-chip/40 hover:bg-chip transition-colors">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[#2563eb]"
                    checked={store.autoplayNext}
                    onChange={(e) => store.updateSettings({ autoplayNext: e.target.checked })}
                  />
                  自动连播
                </label>
              </div>
            </div>

            {/* 播放线路 / 来源切换栏（横向滚动 Pill 药丸设计） */}
            <div className="p-3 sm:p-3.5 bg-surface-raised rounded-xl border border-line shadow-sm min-w-0 max-w-full overflow-hidden">
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
                  <span>测速面板</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* 线路水平滚动按钮栏 */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar scroll-smooth w-full min-w-0">
                {candidates.map((c) => {
                  const isCurrent = c.source.key === sourceKey;
                  const isFailed = failedSources.has(c.source.key);
                  return (
                    <button
                      key={c.source.key}
                      type="button"
                      onClick={() => switchToCandidate(c, true)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 border shrink-0 touch-manipulation',
                        isCurrent
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : isFailed
                            ? 'bg-surface text-danger/80 border-danger/30 hover:border-danger/60'
                            : 'bg-surface hover:bg-hover text-muted hover:text-content border-line'
                      )}
                      title={isFailed ? '该线路刚刚发生播放故障，点击可重新尝试' : c.source.name}
                    >
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
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
                  <span className="text-xs text-faint flex items-center gap-1.5 px-2 py-1 shrink-0">
                    <Spinner size="sm" /> 正在搜寻其他线路...
                  </span>
                )}
                {!candidatesQuery.isLoading && candidates.length === 0 && (
                  <span className="text-xs text-faint px-1 shrink-0">未找到其他同名播放线路</span>
                )}
              </div>
            </div>
          </div>

          {/* 右侧侧栏（Web 模式下：剧集选集 + 影片海报/演职员/概述；移动端顺位在播放器下方） */}
          <aside className="space-y-3.5 min-w-0 w-full">
            {/* 1. 剧集选集卡片 */}
            <div className="bg-surface-raised rounded-xl p-3 sm:p-3.5 border border-line shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-semibold text-content">剧集列表</h3>
                  {episodes.length > 0 && <span className="text-xs text-faint">({episodes.length})</span>}
                </div>
                {episodes.length > 1 && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm !px-2 !py-1 text-xs shrink-0 flex items-center gap-1"
                    onClick={() => setReversed((v) => !v)}
                    title="切换剧集列表排列顺序"
                  >
                    <Icon
                      name="arrowDown"
                      className={cn('w-3.5 h-3.5 transition-transform mr-0.5', reversed && 'rotate-180')}
                    />
                    <span>{reversed ? '倒序' : '正序'}</span>
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
                <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-4 gap-1.5 max-h-[30vh] sm:max-h-[34vh] overflow-y-auto scrollbar-thin pr-1">
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
              <p className="hidden lg:block text-[10px] text-faint mt-3 leading-relaxed">
                快捷键：空格 播放/暂停 · ←/→ 快退/快进 · ↑/↓ 音量 · F 全屏 · Alt+←/→ 切集
              </p>
            </div>

            {/* 2. 影片档案卡片（海报 + 备用剧照微相册 + 演员表 + 剧情概述折叠） */}
            <div className="relative p-3.5 sm:p-4 bg-surface-raised rounded-xl border border-line shadow-sm overflow-hidden min-w-0">
              {/* 背景微弱环境氛围微晕 */}
              {activePoster && (
                <div
                  className="absolute -right-12 -bottom-12 w-64 h-64 rounded-full bg-cover bg-center opacity-[0.04] dark:opacity-[0.08] blur-3xl pointer-events-none select-none"
                  style={{ backgroundImage: `url(${activePoster})` }}
                  aria-hidden
                />
              )}

              <div className="flex flex-col gap-3">
                {/* 顶部：海报 + 核心信息 */}
                <div className="flex gap-3 items-start">
                  {/* 封面海报 */}
                  <div className="shrink-0 flex flex-col items-center gap-1.5">
                    <div className="relative w-24 sm:w-28 aspect-[2/3] rounded-lg overflow-hidden bg-chip shadow-md border border-line/50 shrink-0 group">
                      {activePoster ? (
                        <SmartImage
                          url={activePoster}
                          mode={store.imageProxyMode}
                          customProxy={store.customImageProxy}
                          alt={videoTitle}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-faint">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M7 4v16m10-16v16M3 6a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm8 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6zm4 0a1 1 0 011-1h1a1 1 0 011 1v12a1 1 0 01-1 1h-1a1 1 0 01-1-1V6z"
                            />
                          </svg>
                        </div>
                      )}
                      {remarksText && (
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/75 text-white/90 backdrop-blur-sm pointer-events-none truncate max-w-[90%]">
                          {remarksText}
                        </span>
                      )}
                    </div>

                    {/* 多图联动：展示其他源探测到的剧照/海报缩略图 */}
                    {extraPics.length > 1 && (
                      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[112px] py-0.5">
                        {extraPics.slice(0, 4).map((pic, idx) => (
                          <button
                            key={pic + idx}
                            type="button"
                            onClick={() => setSelectedPoster(pic)}
                            className={cn(
                              'w-6 h-8 rounded border overflow-hidden shrink-0 transition-all cursor-pointer',
                              activePoster === pic ? 'ring-2 ring-accent border-accent scale-105' : 'opacity-70 hover:opacity-100 border-line'
                            )}
                            title={`查看第 ${idx + 1} 张封面/剧照`}
                          >
                            <SmartImage
                              url={pic}
                              mode={store.imageProxyMode}
                              customProxy={store.customImageProxy}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 核心标签与导演 */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <h3 className="text-sm sm:text-base font-bold text-content leading-snug break-words">
                      {videoTitle}
                    </h3>

                    {/* 元数据标签组 */}
                    <div className="flex flex-wrap items-center gap-1 text-[11px]">
                      {typeText && <span className="tag bg-accent/15 text-accent">{typeText}</span>}
                      {yearText && <span className="tag bg-purple-500/15 text-purple-600 dark:text-purple-300">{yearText}</span>}
                      {areaText && <span className="tag bg-chip text-muted">{areaText}</span>}
                    </div>

                    {/* 导演 */}
                    {directorList.length > 0 && (
                      <div className="text-xs text-muted flex items-center gap-1 flex-wrap">
                        <span className="text-faint shrink-0">导演：</span>
                        <div className="flex flex-wrap gap-1">
                          {directorList.map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => router.push(`/?s=${encodeURIComponent(d)}`)}
                              className="text-content hover:text-accent hover:underline cursor-pointer"
                              title={`点击搜索 ${d} 执导的作品`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 演员表（芯片徽章 Pill 模式，支持点击直接搜索） */}
                {actorList.length > 0 && (
                  <div className="text-xs pt-1 border-t border-line/40">
                    <div className="text-faint mb-1.5 flex items-center justify-between text-[11px]">
                      <span>演员阵容 ({actorList.length})</span>
                      <span className="text-[10px] text-faint">点击演员搜片</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-thin pr-1">
                      {actorList.map((act) => (
                        <button
                          key={act}
                          type="button"
                          onClick={() => router.push(`/?s=${encodeURIComponent(act)}`)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-chip/60 hover:bg-accent/15 text-content hover:text-accent border border-line/60 hover:border-accent/40 transition-colors touch-manipulation cursor-pointer"
                          title={`搜索 ${act} 参演的作品`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-accent/70 shrink-0" />
                          <span>{act}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 剧情简介 / 概述 */}
                <div className="text-xs pt-2 border-t border-line/40">
                  <div className="text-faint text-[11px] mb-1 font-medium">剧情概述</div>
                  {cleanDesc ? (
                    <div>
                      <p
                        className={cn(
                          'text-muted leading-relaxed transition-all duration-300 text-xs sm:text-sm',
                          !descExpanded && 'line-clamp-3'
                        )}
                      >
                        {cleanDesc}
                      </p>
                      {cleanDesc.length > 80 && (
                        <button
                          type="button"
                          onClick={() => setDescExpanded((v) => !v)}
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-1 font-medium cursor-pointer"
                        >
                          <span>{descExpanded ? '收起简介' : '展开全文'}</span>
                          <Icon
                            name="arrowDown"
                            className={cn('w-3 h-3 transition-transform duration-200', descExpanded && 'rotate-180')}
                          />
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-faint text-xs">暂无剧情简介</p>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* 猜你喜欢（全宽智能推荐流，iPad & Mobile 自适应多列网格） */}
        <section className="mt-8 pt-6 border-t border-line/60 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-5 rounded-full bg-accent shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-content">猜你喜欢</h2>
              <span className="text-xs text-faint hidden sm:inline">
                {recommendCategory === 'tv'
                  ? '根据当前剧集精选热门电视剧'
                  : recommendCategory === 'anime'
                    ? '精选热门动漫番剧'
                    : recommendCategory === 'variety'
                      ? '精选热门综艺节目'
                      : '精选高分热门电影'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleRefreshRecommend}
              disabled={recommendQuery.isLoading || recRefreshing}
              className="text-xs text-accent hover:text-accent/80 font-medium flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface hover:bg-hover border border-line transition-colors cursor-pointer disabled:opacity-50"
              title="换一批推荐"
            >
              <Icon
                name="refresh"
                className={cn('w-3.5 h-3.5', (recommendQuery.isLoading || recRefreshing) && 'animate-spin')}
              />
              <span>换一批</span>
            </button>
          </div>

          {recommendQuery.isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] rounded-xl bg-chip/40 animate-pulse border border-line/40" />
              ))}
            </div>
          ) : (recommendQuery.data?.length ?? 0) === 0 ? (
            <EmptyState variant="plain" title="暂无相关推荐" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
              {recommendQuery.data!.slice(0, 12).map((item) => (
                <DoubanCard
                  key={item.id || item.title}
                  item={item}
                  onClick={() => router.push(buildWatchUrl({ title: item.title }))}
                />
              ))}
            </div>
          )}
        </section>
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

/** 集数按钮：激活时自动滚动进可视区（长剧列表），统一高度与高质感圆角 */
function EpisodeButton({ index, active, onClick }: { index: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <button
      ref={ref}
      className={cn(
        'btn btn-sm !px-1 h-9 font-medium text-xs rounded-lg transition-all',
        active ? 'episode-active font-bold shadow-sm' : 'btn-ghost bg-surface hover:bg-hover'
      )}
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
      className="p-1.5 rounded-lg text-muted hover:text-content hover:bg-hover transition-colors shrink-0"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push('/');
      }}
      aria-label="返回"
      title="返回"
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
      className="p-1.5 rounded-lg text-muted hover:text-content hover:bg-hover transition-colors shrink-0"
      aria-label="回首页"
      title="回首页"
    >
      <Icon name="home" className="w-5 h-5" />
    </Link>
  );
}
