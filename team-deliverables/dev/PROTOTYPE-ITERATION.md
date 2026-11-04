# LibreTV / cl.tv 下一版详细页面原型说明

**版本**：v1.0  
**基于**：`ITERATION-PLAN.md`（下一版迭代方案，已批准）  
**用途**：供 UI 设计师、全栈工程师、测试工程师对齐  
**形式**：页面结构 + 关键交互 + 字段与 API 对应关系 + 验收备注  
**范围**：主题一 播放页（`/watch`）、主题二 搜索体验（`/`、`/catalog`）

---

## 0. 全局设计基调（沿用 `PROTOTYPE.md`）

- 品牌：cl.tv，深色主题为主，支持浅色/深色切换
- 主色：amber/accent（`#f59e0b` 系）；背景 `bg-page`、表面 `bg-surface`、`bg-card`；文字 `text-content` / `text-muted` / `text-faint`
- 圆角：`rounded-xl` / `rounded-2xl`；卡片与弹窗阴影 `shadow-sm` / `shadow-xl`
- 无商业广告；移动端底部标签栏 + 底部弹窗筛选；桌面端左内容 + 右侧栏（播放页）

---

# 一、主题一：播放页体验提升（`/watch`）

## 1. 多源测速可视化面板

### 1.1 页面结构（自上而下，播放线路栏区域）

```
[顶部导航栏（sticky）]
  └─ ... | 测速换源按钮（打开完整测速面板）

[左主视区：播放器 + 播放线路栏]
  播放线路栏（水平滚动，位于视频信息下方，播放按钮行上方或下方）
  └─ 标题行：
       ├─ 图标 ⚡ | 文字“播放线路” | 状态副文本
       │   测速中：正在探测 N 条线路，已完成 X/已命中 Y
       │   测速完成：共 N 条高速线路
       └─ 右侧：“测速面板”按钮（打开 SwitchSourceModal 完整面板）

  └─ 候选源胶囊列表（水平滚动，overflow-x-auto，no-scrollbar）
       每条候选源胶囊：
       ├─ 状态圆点（w-1.5 h-1.5 rounded-full）
       │   当前：白色脉冲；成功：绿色；受阻/失败：红色；等待：琥珀色
       ├─ 源名称（whitespace-nowrap，text-xs）
       ├─ 年份/备注（可选，text-[10px] opacity-80 font-mono）
       ├─ 延迟 ms（可选，text-[10px] text-emerald-400 font-mono，仅测速完成后显示）
       ├─ QoS 等级标签（title 提示：服务质量 X 级 (标签)）
       └─ 点击 → 立即切换源并继续播放，保留进度

[弹层：SwitchSourceModal 完整测速与换源面板]
  ├─ 标题：测速换源 | 当前影片标题
  ├─ 候选源列表（表格/卡片，每行：源名称 | 延迟 ms | QoS 等级 | 集数 | 状态 | 操作按钮）
  ├─ 测速进度条（已完成/总数，已命中数）
  ├─ “全部测速”按钮（重新触发并发测速）
  └─ 关闭按钮

[弹层：SpeedSuggestionDialog 速度建议弹窗]
  ├─ 标题：发现更快线路
  ├─ 对比行：当前源「X」延迟 baselineMs ms → 目标源「Y」延迟 ms
  ├─ 提升幅度：节省 gainPercent%
  ├─ 操作：接受（立即切换）/ 忽略（关闭弹窗，本次不再提示）
```

### 1.2 关键交互

| 交互点 | 触发方式 | 行为 |
|--------|----------|------|
| 打开测速面板 | 点击顶部导航“测速换源”或线路栏“测速面板”按钮 | 弹出 SwitchSourceModal，展示所有候选源及延迟 |
| 候选源胶囊点击 | 点击线路栏中任意源按钮 | 调用 `switchToCandidate(cand, true)`，URL `router.push(buildWatchUrl(...))`，保留 `index` 与 `position`，新源播放 |
| 测速面板内切换 | 点击列表行的“切换”按钮 | 同上，切换后关闭弹窗 |
| 重新测速 | 点击“全部测速”按钮 | 重置 `streamProgress`、`streamMatchedList`，重新触发 `StreamSourceMatcher` 并发测速 |
| 速度建议接受 | SpeedSuggestionDialog 点击“接受” | 调用 `acceptSpeedSuggestion()`，切换到建议源，关闭弹窗 |
| 速度建议忽略 | SpeedSuggestionDialog 点击“忽略”或关闭 | 调用 `dismissSpeedSuggestion()`，关闭弹窗，标记 `speedPromptedKeyRef` 避免重复提示 |
| 测速进行中 | `isMatching` 为 true | 线路栏显示“正在探测 N 条线路，已完成 X/已命中 Y”，候选源胶囊显示等待状态 |

### 1.3 字段与 API 对应关系

| UI 字段 | 来源 | 字段 | 说明 |
|---------|------|------|------|
| 候选源列表 | `use-watch-engine.ts` `candidates` | `CandidateItem[]` | `source`、`result`（`sourceKey`/`sourceName`/`vodId`/`name`/`pic`/`remarks`）、`ms`、`episodeCount` |
| 测速进度 | `use-watch-engine.ts` `streamProgress` | `{completed, total, matched}` | 已检测/总数/已命中 |
| 测速状态 | `use-watch-engine.ts` `isMatching` / `matchingDone` | `boolean` | 是否正在测速 / 是否完成 |
| 失败源集合 | `use-watch-engine.ts` `failedSources` | `Set<string>` | 标记为“受阻”的源 key |
| QoS 等级 | `src/lib/source-circuit-breaker.ts` `getSourceQoSBadge(key)` | `{score, grade: 'S'|'A'|'B'|'C', label: '极速'|'良好'|'一般'|'受阻'}` | 决定状态圆点颜色与 title 提示 |
| 速度建议 | `use-watch-engine.ts` `speedSuggestion` | `CandidateItem` + `baselineMs` / `gainPercent` | 弹窗展示当前 vs 目标延迟对比 |
| 测试中标志 | `use-watch-engine.ts` `speedTesting` | `boolean` | 弹窗中“全部测速”按钮禁用状态 |
| 切换源 | `use-watch-engine.ts` `switchToCandidate` | `router.push(buildWatchUrl({sourceKey, vodId, index, title, sourceUrl, detail, position}))` | 保留集数与播放时间戳 |
| 接受/忽略建议 | `use-watch-engine.ts` `acceptSpeedSuggestion` / `dismissSpeedSuggestion` | 无 | 弹窗操作 |

### 1.4 验收备注给设计师

- 候选源胶囊需预留 4 种状态颜色：当前（白脉冲）、成功（绿）、受阻/失败（红）、等待（琥珀）。
- QoS 等级用圆点颜色区分：S/A（绿）、B（琥珀）、C（红），title 显示“服务质量 X 级（标签）”。
- 延迟 ms 仅在测速完成后显示，测速中显示等待占位。
- SwitchSourceModal 为全屏/大弹窗，需预留“全部测速”按钮与进度条。
- SpeedSuggestionDialog 为中型弹窗，需清晰展示“基准延迟 → 目标延迟、节省 X%”的对比。

---

## 2. 故障转移状态反馈

### 2.1 页面结构

```
[播放器区域]
  ├─ 播放中当前线路异常 → 自动触发 handleAutoFailover
  ├─ toast 提示（顶部或右下角）：
  │   「当前线路「X」播放受阻（原因），正在自动切换至「Y」...」 （info 类型）
  │   延迟 500ms 后执行 switchToCandidate
  │
  ├─ 所有候选源均不可用（viable.length === 0）：
  │   ├─ candidates.length > 1 → toast error：“所有已探测的播放线路均已尝试且受阻，请检查网络或稍后重试”
  │   └─ candidates.length === 1 → toast warning：“未找到其他可用的备用线路，可在设置中添加更多视频源”
  │
  └─ 播放器无播放地址兜底（WatchFallbackState）：
      ├─ 错误提示文字（“详情加载失败”或“无可播放地址”）
      └─ “立即切换至备用线路”按钮（仅当有其他候选源时显示）

[线路栏：源健康度徽章]
  ├─ 每条候选源胶囊显示 QoS 等级圆点颜色（S/A 绿、B 琥珀、C 红）
  ├─ 源被自动停用（store.sourceHealth disabledUntil 或 permanent）→ 胶囊置灰、不可点击、显示“受阻”
  └─ 故障后的源标记为 failedSources → 胶囊红色，点击后尝试切换（用户主动触发）
```

### 2.2 关键交互

| 交互点 | 触发方式 | 行为 |
|--------|----------|------|
| 自动故障转移 | 播放器 `onRequestSwitchSource` / `detailQuery.isError`（600ms 延迟） | 先 toast 提示当前线路受阻 + 切换目标，500ms 后执行 `switchToCandidate(nextTarget, false)`，保留进度 |
| 无可用备用源 | `viable.length === 0` | 根据候选源数量显示不同 toast（error/warning），不执行切换 |
| 播放器无播放地址 | `currentUrl` 为空且 detail 已加载 | 显示 WatchFallbackState，若有其他候选源显示“立即切换至备用线路”按钮 |
| 手动切换失败源 | 点击线路栏中红色（受阻）源胶囊 | `switchToCandidate(cand, true)`，清除该源在 `failedSourcesRef` 中的标记，尝试播放 |
| 源健康度徽章 | `store.sourceHealth[key]` 的 `disabledUntil` / `permanent` | 源在停用期内线路栏中置灰不可点；恢复后恢复正常 |

### 2.3 字段与 API 对应关系

| UI 字段 | 来源 | 字段 | 说明 |
|---------|------|------|------|
| 故障转移 toast | `use-watch-engine.ts` `handleAutoFailover` | toast 内容模板 | `当前线路「${source.name}」播放受阻${reason}，正在自动切换至「${nextTarget.source.name}」...` |
| 无可用源 toast | `use-watch-engine.ts` `handleAutoFailover` 分支 | `candidates.length > 1 ? error : warning` | 分别提示“所有线路受阻”或“未找到备用线路” |
| 播放器兜底 | `WatchFallbackState`（`src/features/watch/watch-dialogs.tsx`） | `titleParam` / `sourceKey` / `hasStaleSource` / `matchingDone` / `matchedCount` / `streamProgress` / `candidateSourceCount` | 显示标题、源 key、是否失效源、测速进度、候选源数量 |
| 立即切换按钮 | `WatchPage.tsx` 行 487-495 | `candidates.filter(c => c.source.key !== sourceKey).length > 0` | 仅当有其他候选源时显示 |
| 源健康度徽章 | `store.ts` `sourceHealth`、`recordSourceHealth` | `disabledUntil` / `permanent` / `failStreak` | 决定线路栏中源是否置灰不可点 |
| 失败源标记 | `use-watch-engine.ts` `failedSources` | `Set<string>` | 决定线路栏中源是否显示红色“受阻” |

### 2.4 验收备注给设计师

- 故障转移 toast 需包含“当前源 → 目标源”的对比信息，类型为 info，自动消失。
- 无可用源时的两种 toast 分别使用 error（有候选但全失败）和 warning（只有一个源）类型。
- WatchFallbackState 需预留“立即切换至备用线路”按钮，仅在有其他候选源时显示。
- 源健康度徽章：S/A 绿点、B 琥珀点、C 红点；停用期内置灰不可点。

---

## 3. 选集滚动性能

### 3.1 页面结构（右侧栏：WatchSidebar 剧集列表区域）

```
[右侧栏：WatchSidebar]
  [剧集列表卡片]
    ├─ 标题行：“剧集列表（N）” | 倒序/正序切换按钮
    │
    ├─ 百集分段区间折叠胶囊栏（仅 totalEpisodes > 40 时显示）
    │   [1-50][51-100][101-150]...（横向滚动，当前区间高亮 bg-accent/15）
    │   当前播放集变化时自动切换到对应分段
    │
    ├─ 剧集按钮网格（grid-cols-6/8/4，gap-1.5，overflow-y-auto，max-h-30vh）
    │   ├─ 短剧（≤40 集）：全部集数直接展示，无分段
    │   ├─ 长剧（>40 集）：仅显示当前激活分段内的集数
    │   └─ 每集按钮（EpisodeButton）：
    │       ├─ 集数文本（如“第 1 集”）
    │       ├─ 当前集：高亮（bg-accent text-white）
    │       ├─ 非当前：默认底色，hover 变色
    │       └─ 点击 → goEpisode(index)，URL index 参数更新，页面不刷新
    │
    └─ 快捷键提示（隐藏 lg 以上显示）：空格 播放/暂停 · ←/→ 快退/快进 · ↑/↓ 音量 · F 全屏 · Alt+←/→ 切集
```

### 3.2 关键交互

| 交互点 | 触发方式 | 行为 |
|--------|----------|------|
| 分段切换 | 点击分段胶囊（如“51-100”） | `setActiveGroupIdx(idx)`，可见集数列表切换到该分段 |
| 自动定位分段 | 当前播放集 `currentIndex` 变化 | `Math.floor(currentIndex / 50)` 自动激活对应分段胶囊 |
| 集数点击 | 点击任意集数按钮 | `goEpisode(realIndex)`，`router.replace(buildWatchUrl({...index: realIndex...}))`，页面不刷新，新集加载 |
| 倒序/正序切换 | 点击“正序/倒序”按钮 | `setReversed(!reversed)`，集数列表顺序翻转 |
| 空态 | `totalEpisodes === 0` | detailQuery.isLoading 时显示 LoadingState；否则显示 EmptyState（“获取剧集失败”或“暂无剧集信息”） |

### 3.3 字段与 API 对应关系

| UI 字段 | 来源 | 字段 | 说明 |
|---------|------|------|------|
| 剧集总数 | `WatchPage.tsx` `episodes` | `episodes.length` | 决定是否启用分段（>40 集启用） |
| 分段区间 | `watch-sidebar.tsx` `episodeGroups` | `{start, end, label: "1-50"}` | 每段 50 集，横向胶囊栏 |
| 当前激活分段 | `watch-sidebar.tsx` `activeGroupIdx` | `number` | 由 `currentIndex` 自动计算 `Math.floor(currentIndex / 50)` |
| 可见集数列表 | `watch-sidebar.tsx` `visibleEpisodes` | `number[]` | 当前分段内的索引，reversed 时反转 |
| 当前集高亮 | `EpisodeButton` `active` | `realIndex === currentIndex` | 高亮样式 bg-accent text-white |
| 集数点击跳转 | `WatchPage.tsx` `goEpisode` | `router.replace(`/watch?index=${index}&url=...`)` | URL 参数更新，不刷新页面 |
| 分段阈值/大小 | `watch-sidebar.tsx` 常量 | `EPISODE_GROUP_THRESHOLD = 40`、`EPISODE_CHUNK_SIZE = 50` | 可配置，当前硬编码 |

### 3.4 验收备注给设计师

- 长剧（>40 集）必须启用分段折叠，避免百集 DOM 膨胀卡顿。
- 分段胶囊栏横向滚动，当前分段高亮。
- 集数按钮网格需支持键盘焦点环（遥控器/键盘无障碍）。
- 短剧（≤40 集）全部集数直接展示，无分段胶囊栏。
- 当前播放集变化时，自动滚动/激活对应分段，用户不需手动查找。

---

# 二、主题二：搜索体验（`/`、`/catalog`）

## 4. 搜索融合展示

### 4.1 页面结构（首页搜索结果区 + 片库页搜索结果区）

```
[首页 / 搜索结果页]
  [搜索入口]
    输入框（wd） | 返回首页按钮

  [结果分两层]
  
  【第一层：官方 TMDB 高清卡片（优先展示）】
    ├─ 标题：“🔍 搜索结果：“关键词” （找到 N 部官方收录影视）”
    ├─ 卡片网格（grid-cols-2/3/4/5/6，gap-4/5）
    │   └─ MediaCard / DoubanCard：标准海报、正规剧名、评分、年份、剧情简介（悬停透出）
    │   └─ 点击 → buildWatchUrl({title, year, doubanId}) → /watch
    │
    └─ 底部折叠入口：
        按钮：“▼ 未找到想看的内容？展开底层采集源深度扫描”
        （点击展开第二层）

  【第二层：底层采集源深度扫描（折叠展开）】
    ├─ 标题：“全网底层采集源聚合扫描结果：”
    ├─ 流式加载状态：
        │   正在流式并发检索全网点播采集源…
        │   已检测 X/Y，命中 Z
    ├─ 聚合卡片网格（AggregatedCard，按源分组）
        │   └─ 每组：源名称标签 | 年份 | 地区 | 备注 | “极速播放”悬浮按钮
        │   └─ 点击 → buildWatchUrl({sourceKey, vodId, title, year, sourceUrl}) → /watch
    │
    └─ 加载更多按钮（visibleCount < groups.length）：
        “加载更多采集源结果（还剩 N 部）”
    └─ 空态：“底层采集源中暂无匹配结果”

[片库页 /catalog 搜索结果区]
  同首页结构，但官方结果来自 /api/media/catalog 目录 + TMDB 搜索，
  底层源结果同首页。
```

### 4.2 关键交互

| 交互点 | 触发方式 | 行为 |
|--------|----------|------|
| 输入关键词并搜索 | 输入框回车或片库页“深搜”按钮 | 首页：展示官方搜索结果；片库页：展示片库目录搜索结果 |
| 官方卡片点击 | 点击 MediaCard/DoubanCard | `buildWatchUrl({title, year, doubanId})` → `/watch`，未登录先跳 `/login?redirect=` |
| 展开底层源扫描 | 点击“展开底层采集源深度扫描”按钮 | `setShowRawCmsSearch(true)`，展开 NDJSON 流式结果区 |
| 底层源聚合卡片点击 | 点击 AggregatedCard | `buildWatchUrl({sourceKey, vodId, title, year, sourceUrl})` → `/watch` |
| 加载更多 | 点击“加载更多采集源结果” | `visibleCount += 60`，追加显示更多聚合卡片 |
| 流式加载 | `api.search(..., {onSource})` | 各源结果逐条流式出现，坏源以琥珀色区分，不阻塞好源 |

### 4.3 字段与 API 对应关系

| UI 字段 | 来源 | 字段 | 说明 |
|---------|------|------|------|
| 搜索关键词 | URL 参数 `s` / 片库页 `wd` | `string` | 长度 ≤ 100 |
| 官方搜索结果 | `src/lib/media-library-service.ts` `fetchTmdbClient({type:'movie', query})` | `items[].id/title/cover/year/rating/overview` | TMDB 官方高清海报、正规剧名、真实评分、年份 |
| 官方结果计数 | `officialItems.length` | `number` | 显示“找到 N 部官方收录影视” |
| 底层源搜索结果 | `POST /api/search?stream=1` | `SourceSearchOutcome[].list[]` | `sourceKey/sourceName/vodId/name/pic/year/area/remarks` |
| 聚合分组 | `src/components/video-card.tsx` `aggregateResults` | `AggregatedGroup[]` | 按名称+年份分桶，`items[]` 为同源/跨源结果 |
| 聚合卡片源数量 | `sourceCount` | `Math.max(group.items.length, primaryItem?.matchedSources?.length || 1)` | 显示“N 源聚合”胶囊 |
| 流式进度 | `streamedOutcomes` / `isSearching` | `SourceSearchOutcome[]` / `boolean` | 测速中显示“正在流式并发检索…” |
| 加载更多 | `visibleCount` / `RESULT_PAGE_SIZE = 60` | `number` | 每次追加 60 条 |

### 4.4 验收备注给设计师

- 官方 TMDB 卡片与底层源聚合卡片需视觉区分：官方卡片使用 DoubanCard（标准海报、评分、剧情悬浮层），底层源卡片使用 AggregatedCard（源名称标签、源聚合胶囊）。
- 底层源扫描为折叠展开，默认不展开，避免首屏加载过多第三方请求。
- 坏源（超时/失败）以琥珀色区分，不阻塞好源结果展示。
- 流式加载期间显示“正在流式并发检索全网点播采集源…”，完成后显示结果总数。

---

## 5. 搜索历史与热词

### 5.1 页面结构（搜索框聚焦后的下拉面板）

```
[搜索输入框]
  ├─ 聚焦后展开下拉面板（SearchHistoryDropdown，紧贴输入框下方，无间隙、无上边框）
  │
  ├─ 【最近搜索区】（有历史时显示）
  │   ├─ 左侧：🕒 图标 + “最近搜索”文字
  │   ├─ 右侧：“清空”按钮（点击清空全部，toast 提示 + 撤销机会）
  │   ├─ 列表项（最多 10 条，按时间倒序）：
  │       ├─ 历史词文本（truncate）
  │       ├─ 右侧删除按钮（✕，悬停显示红色）
  │       └─ 点击词条 → 直接执行搜索
  │   └─ 空态：无最近搜索时不显示此区
  │
  └─ 【大家都在搜区】（热词推荐）
      ├─ 左侧：🔥 图标 + “大家都在搜”文字
      ├─ 热词药丸按钮（每频道 5–8 个，来自 CHANNEL_HOT_KEYWORDS）：
          │   电影：沙丘2、奥本海默、死侍与金刚狼…
          │   电视剧：幕府将军、庆余年、黑袍纠察队…
          │   动漫：葬送的芙莉莲、咒术回战、鬼灭之刃…
          │   综艺：歌手2024、乘风2024、奔跑吧…
          │   纪录片：地球脉动、蓝色星球、我们的星球…
      └─ 点击热词 → 填入搜索框并直接执行搜索

[键盘导航]
  ├─ ArrowDown/ArrowUp：在历史列表中移动高亮
  ├─ Enter：选中高亮项或提交当前输入
  ├─ Escape：收起下拉面板
```

### 5.2 关键交互

| 交互点 | 触发方式 | 行为 |
|--------|----------|------|
| 搜索框聚焦 | `onFocus` | 展开下拉面板，刷新搜索历史列表 |
| 输入变化 | `onChange` | 按关键字过滤历史列表；清除键盘高亮 |
| 点击历史词 | `onPick(text)` | 填入搜索框，直接执行搜索（URL `wd` 更新） |
| 删除单条历史 | 点击条目右侧 ✕ | `removeSearchHistory(text)`，列表更新，toast 提示 |
| 清空全部历史 | 点击“清空”按钮 | `clearSearchHistory()`，toast 提示“已清空搜索记录”并提供 5 秒“撤销”入口 |
| 撤销清空 | toast 中点击“撤销” | `restoreSearchHistory(snapshot)`，恢复全部记录 |
| 点击热词 | 热词药丸按钮 `onPick(kw)` | 填入搜索框，直接执行搜索 |
| 键盘导航 | ArrowDown/Up/Enter/Escape | 高亮移动、选中、提交、收起 |

### 5.3 字段与 API 对应关系

| UI 字段 | 来源 | 字段 | 说明 |
|---------|------|------|------|
| 搜索历史列表 | `src/components/search-history.tsx` `useSearchHistory` | `history.data[]` (`db.searchHistory`) | `text`（搜索词）、`timestamp`，最多 10 条，按时间倒序 |
| 热词列表 | `src/components/search-history.tsx` `TRENDING_SEARCH_KEYWORDS` | `string[]` | 固定热词，首页通用 |
| 每频道热词 | `src/features/catalog/catalog-config.ts` `CHANNEL_HOT_KEYWORDS` | `Record<ChannelType, string[]>` | 电影/电视剧/动漫/综艺/纪录片各 5–8 个 |
| 添加搜索历史 | `src/lib/db.ts` `addSearchHistory(text)` | 无 | 搜索执行后写入 IndexedDB |
| 删除搜索历史 | `src/lib/db.ts` `removeSearchHistory(text)` | 无 | 单条删除 |
| 清空搜索历史 | `src/lib/db.ts` `clearSearchHistory()` | 无 | 全部删除 |
| 恢复搜索历史 | `src/lib/db.ts` `restoreSearchHistory(snapshot)` | 无 | 清空后撤销用 |
| 输入框值 | URL 参数 `wd` / `s` | `string` | 搜索关键词 |

### 5.4 验收备注给设计师

- 下拉面板与搜索输入框“拼成同一个面板”：无间隙、无上边框，上圆角与上边框由输入框容器补齐。
- 外框取 accent 色，与输入框聚焦边框同色。
- 左右内边距与输入框文字对齐（pl-4），下拉文字与输入内容在同一竖线上。
- 作为浮层不占文档流，出现/消失不会引起下方内容跳动。
- 热词区位于历史区下方，有独立标题（🔥 大家都在搜）和边框分隔。
- 清空历史提供撤销机会，不打断式弹确认框。

---

# 三、交付确认清单（三方对齐）

| 序号 | 验收项 | 负责 | 状态 |
|------|--------|------|------|
| 1 | 播放页测速面板：源名、延迟 ms、QoS 等级（绿/琥珀/红）、当前/受阻标记全部显示 | UI + 全栈 | 待验收 |
| 2 | 播放页测速进度：已完成/总数、已命中数实时更新 | UI + 全栈 | 待验收 |
| 3 | 播放页候选源点击切换：保留集数与播放进度，URL index 参数更新 | UI + 全栈 | 待验收 |
| 4 | 播放页速度建议弹窗：当前 vs 目标延迟对比、节省百分比、接受/忽略操作 | UI + 全栈 | 待验证 |
| 5 | 播放页故障转移 toast：自动切换后提示“当前源 → 目标源”，500ms 延迟切换 | 全栈 | 待验证 |
| 6 | 播放页无可用源兜底：两种 toast（error/warning）区分，WatchFallbackState 显示 | UI + 全栈 | 待验证 |
| 7 | 播放页源健康度徽章：S/A 绿、B 琥珀、C 红，停用期置灰不可点 | UI + 全栈 | 待验证 |
| 8 | 播放页选集：>40 集启用分段折叠，50 集一组，当前集高亮，点击切换不刷新页面 | UI + 全栈 | 待验证 |
| 9 | 搜索融合：官方 TMDB 卡片优先展示，底层源结果折叠展开，坏源琥珀色区分 | UI + 全栈 | 待验证 |
| 10 | 搜索历史：聚焦展示，按时间倒序，单条删除，清空+撤销 | UI + 全栈 | 待验证 |
| 11 | 热词：每频道 5–8 个，点击直接搜索，首页与片库页分别使用对应频道热词 | UI + 全栈 | 待验证 |
| 12 | 路由跳转：未登录播放跳转 `/login?redirect=`，登录后回跳 | 全栈 | 待验证 |
| 13 | 移动端：搜索下拉面板与底栏导航不冲突，播放页触摸操作正常 | UI + 测试 | 待验证 |

---

如需调整模块范围、优先级或字段对应关系，请先与 Lead 确认后反馈。设计稿出稿后，我将按上述清单进行验收，并同步给测试工程师（赵子涵）用于测试用例编写。

抄送：@lead
