'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { DoubanCard, AggregatedCard } from '@/components/video-card';
import { useAuth } from '@/components/auth';
import { buildWatchUrl, cn } from '@/lib/utils';
import { CatalogFilterSection } from '@/features/catalog/catalog-filter-panel';
import { CatalogSkeleton, CatalogPagination } from '@/features/catalog/catalog-skeleton';
import { CHANNEL_HOT_KEYWORDS } from '@/features/catalog/catalog-config';
import { useCatalogFilters, useCatalogData } from '@/features/catalog/use-catalog-query';

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg text-content flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      }
    >
      <CatalogContent />
    </Suspense>
  );
}

function CatalogContent() {
  const router = useRouter();
  const { verified } = useAuth();
  const [showBackToTop, setShowBackToTop] = useState(false);

  const filters = useCatalogFilters();
  const {
    currentChannel,
    currentRegion,
    currentGenre,
    currentYear,
    currentSort,
    currentPage,
    urlQuery,
    catalogKeyword,
    filterInput,
    setFilterInput,
    selectedSources,
    activeChannelConfig,
    hasActiveFilters,
    activeFilterCount,
    updateFilters,
    handleClearSearch,
    resetAllFilters,
  } = filters;

  const {
    isVodSearching,
    searchGroups,
    catalogQuery,
    items,
    total,
    totalPages,
  } = useCatalogData(filters);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 点击卡片直接进入播放前进行登录校验（CMS 原生卡片直传 sourceKey+vodId 秒播，豆瓣卡片走流式秒播）
  const handleCardClick = (title: string, doubanId?: string, year?: string) => {
    let targetSourceKey: string | undefined;
    let targetVodId: string | undefined;
    let targetSourceUrl: string | undefined;

    if (doubanId?.startsWith('cms_')) {
      const parts = doubanId.split('_');
      if (parts.length >= 3) {
        targetSourceKey = parts[1];
        targetVodId = parts.slice(2).join('_');
        const matchedSrc = selectedSources.find((s) => s.key === targetSourceKey);
        if (matchedSrc) targetSourceUrl = matchedSrc.url;
      }
    }

    const watchUrl = buildWatchUrl({
      title,
      doubanId: doubanId?.startsWith('cms_') ? undefined : doubanId,
      year,
      sourceKey: targetSourceKey,
      vodId: targetVodId,
      sourceUrl: targetSourceUrl,
    });
    if (!verified) {
      router.push(`/login?redirect=${encodeURIComponent(watchUrl)}`);
      return;
    }
    router.push(watchUrl);
  };

  return (
    <div className="min-h-screen flex flex-col bg-page text-content transition-colors duration-200">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5 space-y-4 pb-28 md:pb-8 overflow-x-hidden">
        {/* 频道大横幅与引导标语：沉浸式呈现当前频道 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{activeChannelConfig.icon}</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {activeChannelConfig.label}片库大厅
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-muted mt-1">{activeChannelConfig.subTitle}</p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 self-start sm:self-auto w-full sm:w-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateFilters({ wd: filterInput.trim() });
              }}
              className="relative flex items-center w-full sm:w-72"
            >
              <span className="absolute left-3 text-xs text-muted pointer-events-none">🔍</span>
              <input
                type="text"
                value={filterInput}
                onChange={(e) => setFilterInput(e.target.value)}
                placeholder={`在【${activeChannelConfig.label}】全库中深度搜索...`}
                className="pl-8 pr-16 py-1.5 rounded-xl bg-chip/60 hover:bg-chip focus:bg-surface border border-line focus:border-accent text-xs text-content placeholder:text-faint transition-all focus:outline-none w-full"
              />
              {filterInput && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterInput('');
                    updateFilters({ wd: '' });
                  }}
                  className="absolute right-10 text-xs text-faint hover:text-content p-1"
                  title="清空"
                >
                  ✕
                </button>
              )}
              <button
                type="submit"
                className="absolute right-1 px-2.5 py-1 rounded-lg bg-accent text-on-accent text-xs font-semibold hover:opacity-90 active:scale-95 transition-all cursor-pointer"
              >
                深搜
              </button>
            </form>
          </div>
        </div>

        {/* 当存在分类深搜时展示专属搜索结果横幅与清除按钮 */}
        {catalogKeyword && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-accent/10 border border-accent/25 rounded-2xl text-xs animate-fade-in">
            <div className="flex items-center gap-2 text-content font-medium">
              <span className="text-sm">🔍</span>
              <span>
                正在【{activeChannelConfig.label}】全库深度搜索 “<strong className="text-accent">{catalogKeyword}</strong>”
                {total > 0 && <span className="ml-1 text-muted">（找到约 {total.toLocaleString()} 部影片）</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFilterInput('');
                  updateFilters({ wd: '' });
                }}
                className="btn-primary text-xs px-3 py-1 rounded-lg shrink-0 active:scale-95 cursor-pointer"
              >
                ✕ 清空返回片单
              </button>
              <button
                type="button"
                onClick={() => updateFilters({ q: catalogKeyword, wd: '' })}
                className="text-xs px-3 py-1 rounded-lg bg-chip hover:bg-hover border border-line text-muted hover:text-content shrink-0 active:scale-95 cursor-pointer"
              >
                🌐 切换为全网聚合直搜
              </button>
            </div>
          </div>
        )}

        {/* 当存在全网搜索词时展示专属搜索结果横幅与清除按钮 */}
        {urlQuery && (
          <div className="flex items-center justify-between gap-2 p-3 bg-accent/10 border border-accent/25 rounded-2xl text-xs animate-fade-in">
            <div className="flex items-center gap-2 text-content font-medium">
              <span className="text-sm">🔍</span>
              <span>
                正在查看全网聚合搜索 “<strong className="text-accent">{urlQuery}</strong>” 的跨站结果
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearSearch}
              className="btn-primary text-xs px-3 py-1 rounded-lg shrink-0 active:scale-95 cursor-pointer"
            >
              ✕ 返回片库大厅
            </button>
          </div>
        )}

        {/* 本频道高频热门推荐搜索词 */}
        {!urlQuery && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 text-xs">
            <span className="text-[11px] text-muted/70 flex items-center gap-1 shrink-0">
              <span>🔥</span>
              <span>大家都在搜:</span>
            </span>
            {(CHANNEL_HOT_KEYWORDS[currentChannel] || CHANNEL_HOT_KEYWORDS.movie).map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => {
                  setFilterInput(kw);
                  updateFilters({ wd: kw });
                }}
                className={cn(
                  'px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 transition-all active:scale-95 cursor-pointer border select-none',
                  catalogKeyword === kw
                    ? 'bg-accent text-on-accent border-accent font-semibold shadow-xs'
                    : 'bg-chip/50 hover:bg-accent/10 hover:text-accent hover:border-accent/40 border-line/60 text-muted'
                )}
              >
                {kw}
              </button>
            ))}
          </div>
        )}

        {/* 全网统一单源多维筛选器面板 */}
        {!urlQuery && (
          <CatalogFilterSection
            regions={activeChannelConfig.regions}
            genres={activeChannelConfig.genres}
            currentRegion={currentRegion}
            currentGenre={currentGenre}
            currentYear={currentYear}
            currentSort={currentSort}
            hasActiveFilters={hasActiveFilters}
            activeFilterCount={activeFilterCount}
            totalCount={total}
            onUpdateFilters={updateFilters}
            onReset={resetAllFilters}
          />
        )}

        {/* 统计提示与换页状态 */}
        <div className="flex items-center justify-between text-xs text-muted py-2.5 px-1 min-h-[40px] border-b border-line/40 shrink-0 leading-normal">
          <span>
            {urlQuery ? (
              isVodSearching ? (
                '正在全网采集站实时搜索最新片源…'
              ) : (
                <>
                  全网聚合找到 <span className="text-content font-bold">{searchGroups.length}</span> 部匹配影片
                </>
              )
            ) : catalogKeyword ? (
              catalogQuery.isLoading ? (
                '正在全库深度搜索…'
              ) : items.length > 0 ? (
                <>
                  在【{activeChannelConfig.label}】全库深度搜到 “<span className="text-accent font-semibold">{catalogKeyword}</span>” 相关影片共 <span className="text-content font-bold">{items.length}</span> 部
                  {`（第 ${currentPage}/${totalPages} 页${total > 0 ? `，共约 ${total.toLocaleString()} 部` : ''}）`}
                </>
              ) : (
                <>
                  在【{activeChannelConfig.label}】全库未找到与 “<span className="text-accent font-semibold">{catalogKeyword}</span>” 相关的影片
                </>
              )
            ) : catalogQuery.isLoading ? (
              '正在加载片单…'
            ) : items.length > 0 ? (
              <>
                当前【全球影视资料库】
                共展示 <span className="text-content font-bold">{items.length}</span> 部精选影片
                {`（第 ${currentPage}/${totalPages} 页${total > 0 ? `，共约 ${total.toLocaleString()} 部` : ''}）`}
              </>
            ) : (
              '暂无影片'
            )}
          </span>
          {((catalogQuery.isFetching && !catalogQuery.isLoading) || isVodSearching) && (
            <span className="text-accent flex items-center gap-1 shrink-0 ml-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
              实时更新中…
            </span>
          )}
        </div>

        {/* 搜索模式与片库模式内容呈现 */}
        {urlQuery ? (
          isVodSearching && searchGroups.length === 0 ? (
            <CatalogSkeleton />
          ) : searchGroups.length === 0 ? (
            <div className="py-20 text-center space-y-3 border border-dashed border-line/60 rounded-2xl bg-surface/40">
              <p className="text-4xl">🔍</p>
              <h3 className="text-base font-semibold text-content">全网采集站未搜到 “{urlQuery}”</h3>
              <p className="text-xs text-muted">请检查关键词是否有误，或在设置中启用更多点播采集源</p>
              <button
                type="button"
                onClick={handleClearSearch}
                className="btn-primary text-xs px-4 py-1.5 rounded-lg active:scale-95"
              >
                返回片库大厅
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {searchGroups.map((group) => (
                <AggregatedCard
                  key={group.key}
                  group={group}
                  onOpen={() => {
                    const primary = group.items[0];
                    if (typeof window !== 'undefined' && primary?.sourceKey && primary?.vodId) {
                      try {
                        const cached = group.items.map((it) => ({
                          sourceKey: it.sourceKey,
                          sourceName: it.sourceName,
                          sourceVodId: it.vodId,
                          sourceUrl: it.sourceUrl,
                          remarks: it.remarks,
                        }));
                        sessionStorage.setItem(
                          `libretv:matched:${primary.sourceKey}:${primary.vodId}`,
                          JSON.stringify(cached)
                        );
                      } catch {}
                    }
                    const watchUrl = buildWatchUrl({
                      title: group.name,
                      year: group.year,
                      sourceKey: primary?.sourceKey,
                      vodId: primary?.vodId,
                      sourceUrl: primary?.sourceUrl,
                    });
                    if (!verified) {
                      router.push(`/login?redirect=${encodeURIComponent(watchUrl)}`);
                      return;
                    }
                    router.push(watchUrl);
                  }}
                />
              ))}
            </div>
          )
        ) : catalogQuery.isLoading ? (
          <CatalogSkeleton />
        ) : items.length === 0 ? (
          <div className="py-20 text-center space-y-3 border border-dashed border-line/60 rounded-2xl bg-surface/40 animate-fade-in">
            <p className="text-4xl">🍿</p>
            <h3 className="text-base font-semibold text-content">
              {catalogKeyword
                ? `【${activeChannelConfig.label}】全库未找到与 “${catalogKeyword}” 相关的影片`
                : '未找到符合条件的影片'}
            </h3>
            <p className="text-xs text-muted">
              {catalogKeyword ? '请尝试更换关键词，或切换至全网跨站直搜' : '请尝试切换其他榜单或数据源'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {catalogKeyword && (
                <button
                  type="button"
                  onClick={() => updateFilters({ q: catalogKeyword, wd: '' })}
                  className="btn-primary text-xs px-3.5 py-1.5 rounded-xl active:scale-95 cursor-pointer"
                >
                  🌐 切换全网直搜 “{catalogKeyword}”
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setFilterInput('');
                  updateFilters({ wd: '', page: 1 });
                }}
                className="px-3.5 py-1.5 rounded-xl bg-chip hover:bg-hover border border-line text-content text-xs font-semibold active:scale-95 cursor-pointer"
              >
                重置查看精选
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-4.5">
            {items.map((item) => (
              <DoubanCard
                key={item.id}
                item={item}
                onClick={() => handleCardClick(item.title, item.id, item.year)}
              />
            ))}
          </div>
        )}

        {/* 分页导航条 */}
        {!urlQuery && (
          <CatalogPagination
            currentPage={currentPage}
            totalPages={totalPages}
            isFetching={catalogQuery.isFetching}
            onPageSelect={(p) => updateFilters({ page: p })}
          />
        )}

        {/* 浮动回到顶部按钮 */}
        {showBackToTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-30 p-2.5 rounded-full bg-surface-raised/90 border border-line shadow-lg text-content hover:text-accent hover:border-accent/60 active:scale-90 transition-all backdrop-blur cursor-pointer touch-manipulation"
            aria-label="回到顶部"
            title="回到顶部"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
