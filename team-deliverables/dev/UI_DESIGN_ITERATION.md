# LibreTV / cl.tv 下一版迭代 — UI 设计稿

**版本**：v1.0  
**负责**：UI Designer（林夏薇） → 全栈工程师（张明远），抄送 Lead  
**依赖**：`PROTOTYPE-ITERATION.md`、`ITERATION-PLAN.md`、`UI_DESIGN_IMAGE_OPT.md`（沿用语义化 Token 规范）  
**技术栈**：Tailwind CSS + React，已有 `@tanstack/react-virtual` 依赖

---

## 0. 全局设计基调（沿用）

| 维度 | 规范 |
|------|------|
| 品牌 | cl.tv，深色主题为主，支持浅色/深色切换 |
| 主色 | amber/accent 系（`#F59E0B` 系）；背景 `bg-page`、`bg-surface`、`bg-card`；文字 `text-content` / `text-muted` / `text-faint` |
| 圆角 | `rounded-xl` / `rounded-2xl`；卡片与弹窗阴影 `shadow-sm` / `shadow-xl` |
| 无商业广告 | 仅功能性提示（加载、空态、错误） |
| 响应式 | 桌面 `lg:` 导航 + 右侧栏；移动端底栏 + 抽屉 |
| 语义化 Token | **禁止硬编码 `#xxxx`**；全部走 `bg-surface`/`bg-card`/`bg-chip`/`border-line`/`text-content`/`text-muted`/`text-faint`/`accent`/`danger` 等 |

---

## 主题一：播放页（`/watch`）

### 1.1 多源测速可视化面板

#### QoS 等级颜色映射（语义化 Token）

| 等级 | 分数 | 状态圆点 | 标签文字 | 边框 | 备注 |
|------|------|---------|---------|------|------|
| S / A | ≥70 | `bg-emerald-400` | `text-emerald-400` | `border-emerald-500/30` | 极速 / 良好 |
| B | ≥40 | `bg-amber-500` | `text-amber-400` | `border-amber-500/30` | 一般 |
| C | <40 | `bg-rose-500` | `text-rose-400` | `border-rose-500/30` | 受阻 |
| 当前源 | — | `bg-white animate-ping` | `text-content` | — | 白色脉冲 |
| 等待/测速中 | — | `bg-amber-500 animate-pulse` | `text-muted` | — | 测速中显示等待 |
| 失败/受阻 | — | `bg-rose-500` | `text-rose-400` | — | `failedSources` 标记 |

#### 组件 1：`SourcePill` — 线路栏候选源胶囊

文件：`src/components/source-pill.tsx`

```tsx
'use client';

import { cn } from '@/lib/utils';
import { getSourceQoSBadge } from '@/lib/source-circuit-breaker';

interface SourcePillProps {
  sourceKey: string;
  sourceName: string;
  ms?: number;              // 延迟 ms，测速完成后显示
  episodeCount?: number;    // 集数，可选
  isCurrent: boolean;       // 是否当前播放源
  isFailed: boolean;        // 是否在 failedSources 中
  isTesting: boolean;       // 是否测速中
  onClick: (sourceKey: string) => void;
  /** 额外年份/备注文案，如 "2024 · 4K" */
  badge?: string;
}

export function SourcePill({
  sourceKey,
  sourceName,
  ms,
  episodeCount,
  isCurrent,
  isFailed,
  isTesting = false,
  onClick,
  badge,
}: SourcePillProps) {
  const qos = getSourceQoSBadge(sourceKey);
  const isDisabled = isFailed || qos.grade === 'C';

  // 状态圆点颜色：当前 > 测速中 > QoS 等级 > 失败
  const dotClass = cn(
    'w-1.5 h-1.5 rounded-full shrink-0',
    isCurrent ? 'bg-white animate-ping shadow-[0_0_8px_rgba(255,255,255,0.6)]' :
    isTesting ? 'bg-amber-500 animate-pulse' :
    isFailed ? 'bg-rose-500' :
    qos.grade === 'S' || qos.grade === 'A' ? 'bg-emerald-400' :
    qos.grade === 'B' ? 'bg-amber-500' : 'bg-rose-500'
  );

  const qosColorClass =
    qos.grade === 'S' || qos.grade === 'A' ? 'text-emerald-400 border-emerald-500/30' :
    qos.grade === 'B' ? 'text-amber-400 border-amber-500/30' :
    'text-rose-400 border-rose-500/30';

  return (
    <button
      type="button"
      onClick={() => onClick(sourceKey)}
      disabled={isDisabled}
      aria-label={`切换至播放源 ${sourceName}${isCurrent ? '（当前源）' : ''}${isDisabled ? '，当前受阻' : ''}`}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 whitespace-nowrap transition-all duration-200 ease-out touch-manipulation active:scale-95',
        isDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        isCurrent
          ? 'bg-accent text-on-accent shadow-glow-gold'
          : 'bg-surface border border-line hover:bg-hover hover:text-content'
      )}
    >
      <span className={dotClass} aria-hidden="true" />
      <span className="truncate min-w-0">{sourceName}</span>
      {badge && (
        <span className="text-[10px] text-faint font-mono opacity-80 shrink-0">{badge}</span>
      )}
      {ms !== null && ms !== undefined && !isTesting ? (
        <span className={`text-[10px] font-mono shrink-0 ${qosColorClass}`}>
          {ms}ms
        </span>
      ) : isTesting ? (
        <span className="text-[10px] text-faint font-mono shrink-0">测速中</span>
      ) : null}
      <span
        className={cn('px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 border', qosColorClass)}
        title={`服务质量 ${qos.grade} 级（${qos.label}）`}
      >
        {qos.grade}
      </span>
    </button>
  );
}
```

#### 组件 2：`SwitchSourceModal` — 完整测速与换源面板

文件：`src/components/switch-source-modal.tsx`

```tsx
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Drawer } from '@/components/drawer';
import { SourcePill } from './source-pill';
import { Spinner } from '@/components/states';
import { Icon } from '@/components/icon';

interface SwitchSourceModalProps {
  open: boolean;
  onClose: () => void;
  videoTitle: string;
  currentSourceKey: string;
  candidates: Array<{
    sourceKey: string;
    sourceName: string;
    ms?: number;
    episodeCount?: number;
    badge?: string;
  }>;
  streamProgress: { completed: number; total: number; matched: number } | null;
  isMatching: boolean;
  onSwitchSource: (sourceKey: string) => void;
  onTestAll: () => void;
  isTestingAll: boolean;
}

export function SwitchSourceModal({
  open,
  onClose,
  videoTitle,
  currentSourceKey,
  candidates,
  streamProgress,
  isMatching,
  onSwitchSource,
  onTestAll,
  isTestingAll,
}: SwitchSourceModalProps) {
  const [testAllPressed, setTestAllPressed] = useState(false);

  const progressPercent =
    streamProgress && streamProgress.total > 0
      ? Math.round((streamProgress.completed / streamProgress.total) * 100)
      : 0;

  return (
    <Drawer open={open} onClose={onClose} title={`测速换源 — ${videoTitle}`} side="center" width="max-w-2xl">
      <div className="space-y-5">
        {/* 候选源列表 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-content">候选播放源</h3>
            <span className="text-[11px] text-muted">
              共 {candidates.length} 条线路
            </span>
          </div>
          <div className="flex flex-col gap-2 max-h-[42vh] overflow-y-auto scrollbar-thin pr-1">
            {candidates.map((c) => (
              <SourcePill
                key={c.sourceKey}
                sourceKey={c.sourceKey}
                sourceName={c.sourceName}
                ms={c.ms}
                episodeCount={c.episodeCount}
                isCurrent={c.sourceKey === currentSourceKey}
                isFailed={false}
                isTesting={isMatching && !c.ms}
                badge={c.badge}
                onClick={onSwitchSource}
              />
            ))}
            {candidates.length === 0 && (
              <div className="py-6 text-center text-faint">
                暂无可用播放源
              </div>
            )}
          </div>
        </div>

        {/* 测速进度条 */}
        {streamProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>测速进度</span>
              <span>{progressPercent}% ({streamProgress.completed}/{streamProgress.total}，命中 {streamProgress.matched})</span>
            </div>
            <div className="h-1.5 w-full bg-chip rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* 操作行 */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-line/50">
          <button
            type="button"
            onClick={onTestAll}
            disabled={isTestingAll || testAllPressed}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation active:scale-95',
              isTestingAll || testAllPressed
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-surface border border-line text-content hover:bg-hover'
            )}
          >
            {isTestingAll ? <Spinner size="sm" className="mr-1.5" /> : '全部测速'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-surface border border-line text-muted hover:bg-hover transition-colors touch-manipulation active:scale-95"
          >
            关闭
          </button>
        </div>
      </div>
    </Drawer>
  );
}
```

#### 组件 3：`SpeedSuggestionDialog` — 速度建议弹窗（设计稿确认，代码已在 `watch-dialogs.tsx`）

现有实现：右下角浮动胶囊，`fixed bottom-4 right-4 z-[70]`，8 秒自动收起，接受/忽略按钮。设计要点：

| 要素 | 规范 |
|------|------|
| 位置 | 右下角浮动，不遮挡视频主视区 |
| 显示内容 | 当前源「X」延迟 baselineMs ms → 目标源「Y」延迟 ms，节省 gainPercent% |
| 操作 | 接受（立即切换）/ 忽略（关闭，本次不再提示） |
| 自动消隐 | 8 秒无操作，鼠标悬停保持，Esc 键忽略 |
| 无障碍 | `role="status"`、`aria-live="polite"`、`aria-label` |

---

### 1.2 故障转移状态反馈

#### 故障转移 toast 模板

由 `use-watch-engine.ts` `handleAutoFailover` 触发，通过 `toast(msg, 'info')` 发送：

| 场景 | toast 内容模板 | 类型 |
|------|--------------|------|
| 自动切换 | `当前线路「${source.name}」播放受阻${reason}，正在自动切换至「${nextTarget.source.name}」...` | info |
| 所有候选源受阻 | `所有已探测的播放线路均已尝试且受阻，请检查网络或稍后重试` | error |
| 只有一个源 | `未找到其他可用的备用线路，可在设置中添加更多视频源` | warning |

交互时序：
1. 播放器 `onRequestSwitchSource` / `detailQuery.isError`（600ms 延迟）→ 触发 `handleAutoFailover`
2. 先显示 toast（当前源 → 目标源对比），延迟 500ms 后执行 `switchToCandidate(nextTarget, false)`
3. 保留播放进度（URL `index` 与 `position` 参数不变）

#### 无可用源兜底 UI（`WatchFallbackState`，代码已在 `watch-dialogs.tsx`）

| 状态 | 显示内容 |
|------|---------|
| 测速中（`!matchingDone`） | Spinner + 「正在为「X」重新匹配可用线路…」 + 已检测 X/Y 个源 |
| 测速完成无匹配（`matchedCount === 0`） | 「未找到该片源」+ 说明 +「进入片库大厅」/「返回首页」按钮 |
| 源不存在 | 「点播源不存在」+ 说明 +「返回首页」按钮 |
| 有其他候选源 | 显示「立即切换至备用线路」按钮 |

#### 源健康度徽章

线路栏中每个源胶囊显示 QoS 等级圆点：
- S/A：绿色 `bg-emerald-400`
- B：琥珀色 `bg-amber-500`
- C：红色 `bg-rose-500`
- 源在停用期内（`disabledUntil` / `permanent`）：胶囊置灰、不可点击、显示「受阻」

---

### 1.3 选集滚动性能

#### 现有基线（`watch-sidebar.tsx`）

已实现：
- 百集分段折叠（40 集阈值，50 集每组，横向胶囊栏）
- 当前集自动定位分段（`Math.floor(currentIndex / 50)`）
- 剧集按钮网格（`grid-cols-6 sm:grid-cols-8 lg:grid-cols-4`）
- 当前集高亮（`bg-accent text-white`）
- 正序/倒序切换
- 快捷键提示（隐藏 lg 以上）

#### 需增强：虚拟滚动（`@tanstack/react-virtual`）

针对 100 集以上长剧，引入 `useVirtualizer`，仅渲染可视区集数，DOM 节点数不随集数线性增长，滚动保持 60fps。

设计要点：
- 容器固定高度 `max-h-[30vh] sm:max-h-[34vh]`，`overflow-y-auto`
- 每集按钮固定高度（如 `h-9`），虚拟滚动器根据总高度计算可视范围
- 当前集高亮保持，滚动时自动滚动到可视区
- 分段胶囊栏保持在虚拟滚动容器之外，固定显示

代码片段（供全栈工程师参考，集成到 `watch-sidebar.tsx`）：

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useRef } from 'react';

// 在 WatchSidebar 内：
const parentRef = useRef<HTMLDivElement>(null);
const rowVirtualizer = useVirtualizer({
  count: visibleEpisodes.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 34, // 每集按钮高度 h-9 + gap-1.5 ≈ 34px
  overscan: 10,
});

// 渲染：
<div ref={parentRef} className="h-[30vh] sm:h-[34vh] overflow-y-auto scrollbar-thin pr-1">
  <div
    className="h-full"
    style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
  >
    {rowVirtualizer.getVirtualItems().map((virtualIndex) => {
      const realIndex = visibleEpisodes[virtualIndex.index];
      return (
        <div
          key={realIndex}
          className="absolute"
          style={{
            top: `${rowVirtualizer.getStartOffset() + virtualIndex.top}px`,
            height: `${virtualIndex.size}px`,
          }}
        >
          <EpisodeButton ... />
        </div>
      );
    })}
  </div>
</div>
```

---

## 主题二：搜索体验（`/`、`/catalog`）

### 2.1 搜索融合展示

布局结构（同一搜索词下）：

```
[搜索框]
├─ 官方 TMDB 卡片优先位置（上方，标准海报、正规剧名、评分、年份）
│   └─ 卡片网格，桌面 6 列，移动端 2-3 列
└─ 底层采集源结果（折叠展开，「底层采集源深度扫描」）
    ├─ 按源分组聚合卡片
    ├─ 每组显示源名称、年份、地区、备注
    └─ 坏源琥珀色区分（`bg-amber-500/10` 背景 + 琥珀色圆点）
```

#### 官方 TMDB 卡片

复用现有 `MediaCard` / `DoubanCard`，`loading='eager'`，SmartImage 骨架屏兜底，失败兜底 `PosterPlaceholder`。

#### 底层源按源分组折叠

```tsx
// 分组结构：Map<sourceKey, { sourceName, results: SearchResultItem[] }>
// 每组渲染：
<div className="mb-4">
  <div className="flex items-center gap-2 mb-2">
    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
    <span className="text-xs font-semibold text-content">{sourceName}</span>
    <span className="text-[10px] text-muted">共 {results.length} 条结果</span>
  </div>
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
    {results.map(item => <MediaCard ... loading="lazy" />)}
  </div>
</div>
```

坏源标记：在源名称旁显示琥珀色圆点 + 「受阻」文案，不阻塞好源展示。

---

### 2.2 搜索历史与热词

现有 `search-history.tsx` 已实现 `SearchHistoryDropdown`，包含：
- 聚焦展开历史列表（`role="listbox"`，`aria-label="最近搜索"`）
- 每频道热词（`TRENDING_SEARCH_KEYWORDS`，药丸按钮，点击填入搜索框）
- 单条删除（`aria-label="删除搜索记录 X"`）
- 清空 + 撤销 toast（`action: { label: '撤销' }`）

设计稿确认点（无需新增代码，仅确认集成方式）：

| 模块 | 位置 | 触发方式 |
|------|------|----------|
| 搜索历史面板 | 首页 / 片库页搜索框聚焦后 | `SearchHistoryDropdown` 紧贴输入框下方 |
| 热词面板 | 搜索历史下方 | `🔥 大家都在搜` + 5–8 个药丸按钮 |
| 单条删除 | 历史列表每条右侧 | `×` 按钮，删除后 toast 提示 |
| 清空 | 历史面板顶部 | 「清空」按钮，toast 提示 + 5 秒撤销 |

响应式：
- 桌面：搜索框在顶栏，下拉面板紧贴下方
- 移动端：搜索框在 Header 折叠状态或页面顶部，下拉面板不超出视口

---

## 验收确认清单（对齐 `ITERATION-PLAN.md` 第 7 节）

- [ ] 播放页测速面板：源名、延迟、QoS 等级（S/A 绿、B 琥珀、C 红）、当前/受阻标记全部显示
- [ ] 播放页故障转移：自动切换后 toast 提示（当前源→目标源对比）；无可用源时兜底 UI
- [ ] 播放页选集：100 集以上虚拟滚动无卡顿；百集分段折叠正常；当前集高亮；正序/倒序切换
- [ ] 搜索融合：官方 TMDB 卡片优先展示；底层源结果按源分组折叠；坏源琥珀色区分，不阻塞好源
- [ ] 搜索历史与热词：聚焦展示；点击直接搜索；单条删除/清空 + 撤销
- [ ] 路由跳转：未登录播放跳转登录并携带 redirect；登录后回跳
- [ ] 移动端适配：搜索面板与底栏导航不冲突；播放页触摸操作正常
- [ ] 语义化 Token：无硬编码 `#xxxx`；深色/亮色两套 CSS 变量对齐
- [ ] CLS ≈ 0：海报位固定 `aspect-ratio`，图片加载前后无布局抖动
- [ ] 无障碍：`role="button"` + `tabIndex={0}`、`aria-label`、`line-clamp`

---

## 给全栈工程师的实施建议

1. 先在 `src/components/` 新建 `source-pill.tsx` 和 `switch-source-modal.tsx`，按上述代码片段实现。
2. `SpeedSuggestionDialog`、`WatchFallbackState` 代码已在 `watch-dialogs.tsx`，按设计稿确认即可，无需重复开发。
3. 选集虚拟滚动：在 `watch-sidebar.tsx` 中引入 `@tanstack/react-virtual` 的 `useVirtualizer`，替换现有固定渲染的剧集按钮网格，保留分段胶囊栏和当前集高亮。
4. 搜索融合展示：在首页/片库页搜索结果区，官方 TMDB 结果优先渲染 `MediaCard`（`loading='eager'`），底层源结果按源分组折叠，复用 `search-history.tsx` 的 `SearchHistoryDropdown`。
5. 完成后通知我，我将按验收清单逐条审查，循环直至 UI 完美。
