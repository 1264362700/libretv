'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Icon } from '@/components/icon';
import { SmartImage } from '@/components/smart-image';
import { EmptyState, LoadingState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { VideoDetail } from '@/lib/types';
import { EpisodeButton } from './watch-buttons';

/**
 * 播放页右侧栏（剧集选集 + 本集看点 + 影片档案）（从 app/watch/page.tsx 抽出）。
 * 此前它与播放器、换源、测速等逻辑同处一个 1300 行的组件里，
 * 抽取后播放页只剩「播放会话 + 左右两栏布局」，侧栏细节单独维护。
 */

/** 只声明侧栏真正用到的字段，避免整份 query 结果透传 */
interface DetailQueryLike {
  isLoading: boolean;
  isError?: boolean;
}

interface EpisodeIntroQueryLike {
  isLoading: boolean;
  data?: {
    title?: string;
    desc?: string;
    duration?: string;
    airdate?: string;
  } | null;
}

/** 只声明侧栏用到的两项图片代理配置，避免整份 store 透传 */
interface ImageStoreLike {
  imageProxyMode: 'direct' | 'proxy' | 'custom';
  customImageProxy: string;
}

interface RouterLike {
  push: (href: string) => void;
  back: () => void;
}

export interface WatchSidebarProps {
  episodes: VideoDetail['episodes'];
  orderedEpisodes: number[];
  currentIndex: number;
  goEpisode: (index: number) => void;
  reversed: boolean;
  setReversed: Dispatch<SetStateAction<boolean>>;
  detailQuery: DetailQueryLike;
  isTvOrAnime: boolean;
  episodeIntroQuery: EpisodeIntroQueryLike;
  epDescExpanded: boolean;
  setEpDescExpanded: Dispatch<SetStateAction<boolean>>;
  descExpanded: boolean;
  setDescExpanded: Dispatch<SetStateAction<boolean>>;
  videoTitle: string;
  yearText?: string;
  typeText?: string;
  areaText?: string;
  remarksText?: string;
  actorList: string[];
  directorList: string[];
  cleanDesc: string;
  extraPics: string[];
  activePoster?: string;
  setSelectedPoster: (url: string) => void;
  store: ImageStoreLike;
  router: RouterLike;
}

export function WatchSidebar({
  episodes,
  orderedEpisodes,
  currentIndex,
  goEpisode,
  reversed,
  setReversed,
  detailQuery,
  isTvOrAnime,
  episodeIntroQuery,
  epDescExpanded,
  setEpDescExpanded,
  descExpanded,
  setDescExpanded,
  videoTitle,
  yearText,
  typeText,
  areaText,
  remarksText,
  actorList,
  directorList,
  cleanDesc,
  extraPics,
  activePoster,
  setSelectedPoster,
  store,
  router,
}: WatchSidebarProps) {
  return (
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

            {/* 1.5 当前单集剧情看点 (仅动漫/电视剧且剧集多于 1 集时呈现) */}
            {isTvOrAnime && episodes.length > 1 && (
              <div className="bg-surface-raised rounded-xl p-3 sm:p-3.5 border border-line shadow-sm space-y-2 animate-fade-in">
                <div className="flex items-center justify-between gap-2 border-b border-line/40 pb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-3.5 rounded-full bg-accent shrink-0" />
                    <span className="text-xs font-bold text-content shrink-0">
                      第 {currentIndex + 1} 集看点
                    </span>
                    {episodeIntroQuery.data?.title && (
                      <span className="text-xs font-semibold text-accent truncate">
                        · {episodeIntroQuery.data.title}
                      </span>
                    )}
                  </div>
                  {(episodeIntroQuery.data?.duration || episodeIntroQuery.data?.airdate) && (
                    <span className="text-[11px] font-mono text-faint shrink-0">
                      {episodeIntroQuery.data.airdate || episodeIntroQuery.data.duration}
                    </span>
                  )}
                </div>

                {episodeIntroQuery.isLoading ? (
                  <div className="py-2.5 flex items-center gap-2 text-xs text-faint">
                    <span className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                    <span>正在检索本集看点与剧情…</span>
                  </div>
                ) : episodeIntroQuery.data?.desc ? (
                  <div>
                    <p
                      className={cn(
                        'text-muted leading-relaxed text-xs transition-all duration-300',
                        !epDescExpanded && 'line-clamp-3'
                      )}
                    >
                      {episodeIntroQuery.data.desc}
                    </p>
                    {episodeIntroQuery.data.desc.length > 80 && (
                      <button
                        type="button"
                        onClick={() => setEpDescExpanded((v) => !v)}
                        className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline mt-1 font-medium cursor-pointer"
                      >
                        <span>{epDescExpanded ? '收起剧情' : '查看本集完整剧情'}</span>
                        <Icon
                          name="arrowDown"
                          className={cn('w-3 h-3 transition-transform duration-200', epDescExpanded && 'rotate-180')}
                        />
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-faint text-xs leading-relaxed">
                    当前播放第 {currentIndex + 1} 集（共 {episodes.length} 集），剧情紧跟主线推进，可展开下方全剧概述查阅核心背景。
                  </p>
                )}
              </div>
            )}

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
  );
}
