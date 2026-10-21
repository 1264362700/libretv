'use client';

import { useCallback, useEffect, useState } from 'react';

import { SectionTitle, SelectRow, ToggleRow } from '@/components/settings-shared';
import { loadCacheSettings, saveCacheSettings, getCacheSummary, clearVideoCache, type CacheSummary } from '@/lib/video-cache';

import { useAppStore } from '@/lib/store';
import type { RecommendSourceValue } from '@/lib/env-recommend-source';
import { useToast } from '@/components/toast';

export function PlaybackPanel() {
  const store = useAppStore();
  return (
    <section>
      <SectionTitle title="播放与过滤" />
      <div className="space-y-3">
        <ToggleRow
          label="广告切片过滤"
          description="剔除播放列表中的广告分片段落（按分片 URL 特征、片头插入与长片间超短中插识别，不动 DISCONTINUITY 时间轴）"
          checked={store.adFilter}
          onChange={(v) => store.updateSettings({ adFilter: v })}
        />
        <ToggleRow
          label="自动连播"
          description="单集播放结束后自动播放下一集"
          checked={store.autoplayNext}
          onChange={(v) => store.updateSettings({ autoplayNext: v })}
        />
      </div>
      <VideoCachePanel />
    </section>
  );
}

/** 片段缓存：开启/关闭 + 用量展示 + 清理（数据在浏览器本地，独立于配置导出） */
function VideoCachePanel() {
  const [enabled, setEnabled] = useState(() => loadCacheSettings().enabled);
  const [summary, setSummary] = useState<CacheSummary>({ segments: 0, bytes: 0, episodes: 0 });
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(() => {
    void getCacheSummary().then(setSummary);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="space-y-3 pt-3 mt-3 border-t border-line">
      <ToggleRow
        label="片段本地缓存"
        description="暂停或观看时把后续分片缓存到浏览器本地，二次播放与断网卡顿时直接命中（存储于本机，不计入配置导出）"
        checked={enabled}
        onChange={(v) => {
          const next = saveCacheSettings({ enabled: v });
          setEnabled(next.enabled);
        }}
      />
      <div className="flex items-center justify-between text-xs text-faint">
        <span>
          已缓存 {summary.segments} 个分片 · {formatBytes(summary.bytes)} · {summary.episodes} 集
        </span>
        <button
          type="button"
          className="px-2 py-1 rounded bg-chip text-content hover:bg-hover transition-colors disabled:opacity-50"
          disabled={clearing || summary.segments === 0}
          onClick={async () => {
            setClearing(true);
            await clearVideoCache();
            refresh();
            setClearing(false);
          }}
        >
          清理缓存
        </button>
      </div>
    </div>
  );
}

export function ImagePanel() {
  const store = useAppStore();
  const mode = store.imageProxyMode;
  const description: Record<'direct' | 'proxy' | 'custom', string> = {
    direct: '原站直连；豆瓣封面自动换公共镜像，仍失败回退内置代理。最省服务器流量',
    proxy: '封面优先经本站服务器转发并伪装来源，失败自动回退公共镜像/直连。最稳定，消耗服务器流量',
    custom: '使用你填写的模板转发封面图',
  };
  return (
    <section>
      <SectionTitle title="封面图加载" />
      <div className="space-y-2">
        <SelectRow
          label="加载方式"
          value={mode}
          description={description[mode]}
          onChange={(v) => store.updateSettings({ imageProxyMode: v as 'direct' | 'proxy' | 'custom' })}
          options={[
            { value: 'direct', label: '直连优先', hint: '最省服务器流量' },
            { value: 'proxy', label: '内置代理', hint: '最稳定' },
            { value: 'custom', label: '自定义', hint: '自建转发模板' },
          ]}
        />
        {mode === 'custom' && <CustomProxyInput />}
      </div>
    </section>
  );
}

/**
 * 自定义代理模板输入：本地即时回显 + 300ms 防抖写 store。
 * 直接每次按键写 store 会让全站封面 URL 重算并触发一轮图片重载（模板输入时缩略图持续闪烁）。
 */
function CustomProxyInput() {
  const value = useAppStore((s) => s.customImageProxy);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [draft, setDraft] = useState(value);

  // 外部值变化（如导入配置）时同步回显
  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => updateSettings({ customImageProxy: draft }), 300);
    return () => clearTimeout(timer);
  }, [draft, value, updateSettings]);

  return (
    <input
      className="input w-full"
      aria-label="自定义代理模板"
      placeholder="代理模板，如 https://p.example.com/?url={url}"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
    />
  );
}

export function HomePanel() {
  const store = useAppStore();
  const { toast } = useToast();

  const labelMap: Record<RecommendSourceValue, string> = {
    'douban': '豆瓣精选大厅',
    'short-drama': '热门微短剧专区',
    'iqiyi-hot': '爱奇艺官方热播榜',
    '360-hot': '360 影视热播榜',
    'baidu-top': '百度实时热榜',
    'douban-top250': '豆瓣 Top250',
    'hot-list': '豆瓣影视周榜',
    'maoyan': '猫眼大盘票房榜',
    'bangumi': 'Bangumi 新番',
  };

  return (
    <section>
      <SectionTitle title="首页与内容过滤" />
      <div className="space-y-3">
        <ToggleRow
          label="成人内容过滤"
          description="过滤“伦理片”等分类的结果"
          checked={store.yellowFilter}
          onChange={(v) => {
            store.updateSettings({ yellowFilter: v });
            toast(v ? '已开启成人内容过滤' : '已关闭成人内容过滤', 'info');
          }}
        />
        <ToggleRow
          label="首页推荐"
          description="在首页展示推荐内容"
          checked={store.doubanEnabled}
          onChange={(v) => {
            store.updateSettings({ doubanEnabled: v });
            toast(v ? '已开启首页推荐展示' : '已关闭首页推荐展示', 'info');
          }}
        />
        <SelectRow
          label="推荐数据源"
          value={store.recommendSource}
          onChange={(v) => {
            const next = v as RecommendSourceValue;
            store.updateSettings({ recommendSource: next, doubanEnabled: true });
            toast(`已切换推荐源为「${labelMap[next] || next}」，首页已实时生效`, 'success');
          }}
          options={[
            { value: 'douban', label: '豆瓣精选大厅', hint: '多维分类与深度筛选' },
            { value: 'short-drama', label: '竖屏短内容专区', hint: '微短剧 / AI 漫剧 / 电影解说 · 共 9万+ 条' },
            { value: 'iqiyi-hot', label: '爱奇艺官方热播榜', hint: '电视剧/电影/综艺/动漫全端热播' },
            { value: '360-hot', label: '360 影视热播榜', hint: '全网热播电视剧/电影/综艺/动漫' },
            { value: 'baidu-top', label: '百度实时热榜', hint: '极速直连 · 亿级搜索风云榜' },
            { value: 'douban-top250', label: '豆瓣 Top250', hint: '影史高分经典神作（支持换一批）' },
            { value: 'hot-list', label: '豆瓣影视周榜', hint: '每周口碑电影与华语/海外剧集榜' },
            { value: 'maoyan', label: '猫眼大盘票房榜', hint: '院线热映与实时票房大盘' },
            { value: 'bangumi', label: 'Bangumi 新番', hint: '每日新番放送连载日程（免 key）' },
          ]}
        />
      </div>
    </section>
  );
}

// —— 数据面板 ——

/**
 * 数据源订阅 / 分享：
 * - 订阅：填入远程订阅地址（LibreTV-SourceList JSON 或 TVBOX 配置 JSON，由服务端自动识别），
 *   一次拉取点播源与直播源，可随时重新同步；
 * - 分享：把当前点播源 + 直播源导出为同格式 JSON 文件，托管到任意位置即可被他人订阅。
 */
