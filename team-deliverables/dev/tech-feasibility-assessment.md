# LibreTV v1.2 需求技术可行性与架构评估报告 (Dev Feasibility Assessment)

**文档版本**：v1.2-Dev-Feasibility-Final  
**编写角色**：全栈开发工程师 (Fullstack Developer)  
**评审对象**：产品经理 (PM)、系统架构师、用户 (User)  
**基准代码**：Master 分支（已合并 v1.1 首页图片加载优化与播放源并发测速硬超时）  
**关联规划**：`team-deliverables/pm/iteration-plan.md`  
**交付归档**：`team-deliverables/dev/tech-feasibility-assessment.md`  
**生效日期**：2026-11-05  

---

## 1. 架构现状与现有技术基准诊断

在承接产品经理（PM）提出的 v1.2 迭代规划前，研发团队对当前代码库进行了深度代码级实证排查，摸排了 6 大核心模块的技术基线与代码资产：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LibreTV 现有关键技术基准拓扑                        │
├────────────────────────────────────────────────────────────────────────┤
│ 1. 播放器管线   │ PlayerShell + useHlsPipeline + ArtPlayer 5.2.3 + Hls.js 1.5.17 │
│ 2. 选集容器     │ WatchSidebar 50集硬分页胶囊折叠；@tanstack/react-virtual 3.14  │
│ 3. 追剧更新侦测 │ Dexie 4.0 db.favorites + checkHasNewEpisodes + ContinueWatchingRow │
│ 4. QoS 监控引擎 │ source-circuit-breaker (EWMA/熔断) + use-watch-engine 30% 提速胶囊 │
│ 5. 字幕时间轴   │ useSubtitleTrack (offsetRef/adjustOffset) + SubtitleLayer 悬浮胶囊│
│ 6. 演职员链路   │ /api/media/person (仅支持 tvmaze:id) vs 纯文本姓名跳转搜索      │
└────────────────────────────────────────────────────────────────────────┘
```

1. **播放器管线 (`src/components/player-shell.tsx` & `src/features/player/use-hls-pipeline.ts`)**：
   - 实例创建：ArtPlayer 仅在挂载时创建一次，换集（`loadEpisode`）仅切换 Hls.js 实例并复用已有 `<video>` 容器，完整保留了网页全屏与系统全屏上下文；
   - 底层能力：Hls.js 实例由 `useHlsPipeline` 统一维护，但目前 `hls.levels`（清晰度）与 `hls.audioTracks`（音轨）未向上层 ArtPlayer 的 `settings` 控制面板暴露；
   - 依赖状态：`artplayer: ^5.2.3`、`hls.js: ^1.5.17`，支持原生画质与音轨无缝热切。
2. **剧集选集容器 (`src/features/watch/watch-sidebar.tsx`)**：
   - 现状：定义了 `EPISODE_GROUP_THRESHOLD = 40` 与 `EPISODE_CHUNK_SIZE = 50`，超过 40 集采用硬分页标签栏（如 `1-50`、`51-100`）；
   - 痛点：面对 1000+ 集超长剧集（如《名侦探柯南》1100+ 集），顶部胶囊栏多达 22 个，切换交互繁琐，缺乏连续平滑滚动体验；
   - 依赖现状：项目 `package.json` 中已预装 `@tanstack/react-virtual: "^3.14.12"`，具备即插即用的虚拟滚动能力。
3. **首页追剧更新机制 (`src/lib/db.ts` & `src/components/continue-watching-row.tsx`)**：
   - 数据库资产：Dexie v4 `db.favorites` 表已包含 `lastKnownEpisodes`、`remarks` 等字段；
   - 算法资产：`extractEpisodeNumber()` 与 `checkHasNewEpisodes()` 纯函数已完备并通过单元测试；
   - 界面资产：`ContinueWatchingRow` 实现了 `useLiveQuery` 监听与更新红点计算，但**尚未挂载到 `src/app/page.tsx`**。
4. **QoS 测速与断路器 (`src/lib/source-circuit-breaker.ts` & `use-watch-engine.ts`)**：
   - 算法成熟度：已实现基于 EWMA 的动态延迟衰减、3次失败触发熔断与 3 分钟冷却机制；
   - 评分评级：`getSourceQoSScore`（0~100）与 `getSourceQoSBadge`（S/A/B/C）；
   - 体验断层：目前测速结果割裂在播放页底部单行胶囊与居中弹窗 `SwitchSourceModal` 中，且打开弹窗会重复跑一次全网测速，缺乏一体化雷达监控抽屉。
5. **字幕系统 (`src/features/player/use-subtitle-track.ts` & `subtitle-layer.tsx`)**：
   - 已实现：`offsetRef`、`adjustOffset(delta)` 毫秒步进计算及右上角悬浮微调胶囊；
   - 缺失项：仅支持固定的 ±0.5s，未按剧持久化，且无在线字幕候选项。
6. **演职员数据流 (`src/app/api/media/person/route.ts` & `src/lib/overseas-media.ts`)**：
   - **重大发现**：后端接口目前严格限定为 `id=tvmaze:<number>`，仅支持 TVMaze 海外英文条目；而详情页中的演员均为中文纯文本，直接调用会产生 400 格式错误。

---

## 2. 7 项需求逐项技术可行性与架构评估

```mermaid
flowchart TD
    subgraph P0[P0 核心重点]
        R1[REQ-P0-01: HLS 多画质档位选择与锁定]
        R2[REQ-P0-02: 内置多语言音频轨道无缝切换]
        R3[REQ-P0-03: 长剧虚拟滚动重构]
        R4[REQ-P0-04: 首页追剧更新流与红点]
        R5[REQ-P0-05: QoS 监控雷达抽屉与秒切]
    end

    subgraph P1[P1 体验增强]
        R6[REQ-P1-01: 外挂字幕时间轴微调与记忆]
        R7[REQ-P1-02: 演职员档案代表作穿透探索]
    end

    R1 --> |极高可行性 0.5~1d| ArtPlayerPanel[ArtPlayer 设置面板]
    R2 --> |极高可行性 0.5~1d| ArtPlayerPanel
    R3 --> |极高可行性 1~1.5d| Virtualizer[@tanstack/react-virtual 视口虚拟化]
    R4 --> |极高可行性 0.5~1d| HomeMount[挂载 ContinueWatchingRow]
    R5 --> |极高可行性 1~1.5d| RadarDrawer[重构 QoS 监控雷达抽屉]
    R6 --> |极高可行性 0.5d| SubtitleStore[按剧本地记忆与步进器]
    R7 --> |中等可行性 1.5~2d| PersonAdapter[后端扩展 ?name= 聚合适配]
```

---

### 2.1 【REQ-P0-01】HLS 视频多画质档位选择与锁定 (Auto/1080P/720P/4K)

- **可行性结论**：**极高 (A+ / 100% 可行)**
- **具体实现路径与代码改动点**：
  1. `src/features/player/use-hls-pipeline.ts`：
     - 在 `hls.on(Hls.Events.MANIFEST_PARSED)` 及 `Hls.Events.LEVEL_SWITCHED` 事件中，提取 `hls.levels` 列表：
       ```ts
       const levels = hls.levels.map((lvl, index) => ({
         index,
         height: lvl.height,
         bitrate: lvl.bitrate,
         label: lvl.name || (lvl.height ? `${lvl.height}P` : `档位 ${index + 1}`),
       }));
       ```
     - 维护当前画质索引 `currentLevel: number`（`-1` 表示 Auto 自动），对外导出 `switchLevel: (index: number) => void`；
     - 切换实现：直接赋值 `hls.currentLevel = index`，Hls.js 将自动完成下一个切片的码率无缝迁移，播放时间戳不跳变。
  2. `src/components/player-shell.tsx`：
     - 将画质规格注入 ArtPlayer 的 `settings` 面板作为二级子菜单（“清晰度 / 画质”），展示“自动 (Auto)”、“4K 2160P”、“1080P 高清”、“720P 标清”；
     - 若用户选定某一固定档位，记录至 `localStorage`（如“偏好最高画质”）。
- **技术难点与潜在风险**：
  - **切片源单码率风险**：国内采集站大多数源仅提供单一码率切片（`hls.levels.length <= 1`）。
    - *规避方案*：若 `levels.length <= 1`，控制栏自适应隐藏清晰度按钮或仅显示“原画/默认”，绝不渲染破损或空白菜单。
  - **强行锁定弱网卡顿风险**：弱网下锁定 1080P 会禁用 ABR 自适应降级，导致 `bufferStalledError`。
    - *规避方案*：在 `PlaybackRecovery` 中加入保护：若手动锁定高画质后连续卡顿重试超过 3 次，给出温和 Toast：“当前网络环境不稳定，已为您临时切回自动画质”。
- **工程工作量预估**：**0.5 ~ 1 人天**。

---

### 2.2 【REQ-P0-02】内置多语言音频轨道无缝切换 (国英双语/原声日语/粤语等)

- **可行性结论**：**极高 (A+ / 100% 可行)**
- **具体实现路径与代码改动点**：
  1. `src/features/player/use-hls-pipeline.ts`：
     - 监听 `Hls.Events.AUDIO_TRACKS_UPDATED` 与 `Hls.Events.AUDIO_TRACK_SWITCHED`；
     - 读取 `hls.audioTracks`，格式化为：
       ```ts
       const tracks = hls.audioTracks.map((t, idx) => ({
         id: idx,
         name: t.name || t.lang || `音轨 ${idx + 1}`,
         lang: t.lang,
       }));
       ```
     - 暴露 `setAudioTrack: (trackId: number) => void`，执行 `hls.audioTrack = trackId`。
  2. `src/components/player-shell.tsx`：
     - 在 ArtPlayer 设置菜单中增加“音频轨道”子项，实时高亮当前音轨；
     - 换集 `loadEpisode` 时重置音轨列表，避免上一集的音轨残留。
- **技术难点与潜在风险**：
  - **绝大部分源为单音轨**：普通国产剧集通常不含多音轨，仅海外蓝光源与双语动漫支持。
    - *规避方案*：当 `audioTracks.length <= 1` 时自动隐藏菜单，不打扰普通用户。
  - **切换音轨缓冲短暂静音**：切换 `audioTrack` 时 Hls.js 会清空已缓冲音频并请求新音轨切片，可能出现约 300~500ms 的短暂间隙。
    - *规避方案*：切换时调用 `showHint('正在切换音轨...')`，并在事件回调确认完成后恢复提示。
- **工程工作量预估**：**0.5 ~ 1 人天**。

---

### 2.3 【REQ-P0-03】1000 集长剧选集 `@tanstack/react-virtual` 虚拟化滚动重构

- **可行性结论**：**极高 (A+ / 100% 可行，架构收益显著)**
- **具体实现路径与代码改动点**：
  1. `src/features/watch/watch-sidebar.tsx`：
     - 网格虚拟化设计：由于侧栏选集按钮为响应式网格布局（手机端 6 列，桌面端 4 列），使用 `@tanstack/react-virtual` 的一维虚拟化对“行（Row）”进行虚拟化：
       ```ts
       const cols = isDesktop ? 4 : 6;
       const rows = useMemo(() => chunk(orderedEpisodes, cols), [orderedEpisodes, cols]);
       const rowVirtualizer = useVirtualizer({
         count: rows.length,
         getScrollElement: () => parentRef.current,
         estimateSize: () => 36, // 每行高度 36px
         overscan: 3,
       });
       ```
     - 保留百集快速跳转锚点栏（如 `1-100`、`101-200`、`201-300`），点击时调用：
       `rowVirtualizer.scrollToIndex(Math.floor(targetIndex / cols), { align: 'start', behavior: 'smooth' })`；
     - 真实 DOM 节点控制：每行 4~6 个按钮，可视区约 6~8 行，加上前后 overscan 各 3 行，真实渲染的 DOM 节点恒定保持在 **48~60 个以内**，彻底摆脱总集数影响。
     - 自动焦点同步：当前集数切换时，自动调用 `scrollToIndex` 将当前播放集滚动至视口中央。
- **技术难点与潜在风险**：
  - **容器动态 Resize 导致的列数重算**：当浏览器窗口大小改变时，列数由 6 变为 4，若未及时通知虚拟化器会引发排版错位。
    - *规避方案*：通过 `ResizeObserver` 监听父容器宽度，并在列数变化时调用 `rowVirtualizer.measure()`。
  - **正序/倒序切换瞬时重排**：反转数组后滚动位置需重置对齐。
    - *规避方案*：在 `reversed` 状态改变的 `useEffect` 中重新根据 `currentIndex` 执行一次平滑对齐。
- **工程工作量预估**：**1 ~ 1.5 人天**。

---

### 2.4 【REQ-P0-04】首页“我的追剧·最近更新”动态流专区与智能红点提示

- **可行性结论**：**极高 (A+ / 核心代码已存在，集成即生效)**
- **具体实现路径与代码改动点**：
  1. `src/app/page.tsx`：
     - 在 `HeroBillboardBanner` 巨幕轮播下方、`RecommendSection` 推荐流上方，正式挂载 `ContinueWatchingRow`：
       ```tsx
       {/* 追剧与继续观看横滑动态流 */}
       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 sm:-mt-8 relative z-30 mb-6">
         <ContinueWatchingRow
           cmsRemarksMap={remarksQuery.data?.remarksMap}
           onNavigate={handleNavigateWatch}
         />
       </div>
       ```
  2. `src/components/continue-watching-row.tsx`：
     - 现已包含对 `db.favorites` 的 `useLiveQuery` 监听与 `checkHasNewEpisodes` 逻辑；
     - 进一步强化 UI：增加“🔴 更新 N 集”脉冲发光角标，并在卡片底部标明“已看至第 X 集 / 更新至第 Y 集”；
     - 点击更新卡片直达播放：直接读取 `latestEpisodes` 并定位到下一未看集，避免重复选集。
- **技术难点与潜在风险**：
  - **采集源备注文本非结构化**：如“更新至24集”、“全40集”、“第12期”、“HD中字”。
    - *规避方案*：`src/lib/db.ts` 中的 `extractEpisodeNumber` 已经包含健全的正则。补充对完结剧（“全XX集”）不再误报“更新”状态的守卫，仅在连载状态且总集数增长时点亮红点。
- **工程工作量预估**：**0.5 ~ 1 人天**。

---

### 2.5 【REQ-P0-05】播放线路 QoS 综合监控雷达抽屉与“一键秒切极速源”

- **可行性结论**：**极高 (A+ / 算法健全，重构界面形态)**
- **具体实现路径与代码改动点**：
  1. 新建 `src/features/watch/qos-radar-drawer.tsx`：
     - 采用右侧滑出（桌面端）/ 底部半屏滑出（移动端）的现代 Drawer 形式，彻底替代老旧的居中阻塞式 `SwitchSourceModal`；
     - 复用 `useWatchEngine` 已有的 `candidates`、`streamMatchedList` 与 `source-circuit-breaker` 中的 EWMA 指标，**无需重复发起全网请求**；
     - 呈现全景雷达看板：每条线路实时展示源名、Ping 延迟（毫秒）、QoS 健康等级（S/A/B/C）、集数覆盖度（如“40集全，覆盖当前集”）以及熔断器状态；
     - 顶部设计常驻极速源秒切 Banner：“🚀 发现更优线路 [源名 · XXms]，较当前源提速 XX%”，点击即刻在 ≤ 1.5s 内平滑完成换源。
  2. `src/app/watch/page.tsx`：
     - 移除旧的 `SwitchSourceModal`，以 `QoSRadarDrawer` 统一接管顶部导航“测速换源”按钮与播放器下方“测速面板”入口。
- **技术难点与潜在风险**：
  - **切源导致的集数断档**：部分源更新慢（如只到 10 集，用户在看 12 集），秒切后视频报错。
    - *规避方案*：极速源优选算法中增加硬门禁：`c.episodeCount >= currentIndex + 1`，集数不足的线路禁止列为一键秒切目标。
- **工程工作量预估**：**1 ~ 1.5 人天**。

---

### 2.6 【REQ-P1-01】外挂字幕时间轴毫秒级步进微调（±0.5s~±2.5s）与本地记忆

- **可行性结论**：**极高 (A+ / 轻量改动，高回报)**
- **具体实现路径与代码改动点**：
  1. `src/features/player/use-subtitle-track.ts`：
     - 增加字幕偏移本地持久化：基于 `showKey`（片名/剧集唯一键）存入 `localStorage`（`libretv:sub_offset:${showKey}`）；
     - 扩展 `adjustOffset` 方法，支持多档步进调节（`±0.5s`, `±1.0s`, `±2.5s`）及一键归零重置；
  2. `src/features/player/subtitle-layer.tsx`：
     - 右上角微调胶囊升级为阶梯式快速调节栏，并在 ArtPlayer 设置菜单中增加“字幕时间轴微调”滑动条。
- **技术难点与潜在风险**：
  - 换集是否继承时间轴偏移：同一部剧不同集可能片头压缩不一致。
    - *规避方案*：换集时默认沿用该剧设定的偏移，但弹出轻量 Toast 提示：“已沿用本剧字幕偏移 +1.5s [点击重置]”。
- **工程工作量预估**：**0.5 人天**。

---

### 2.7 【REQ-P1-02】演职员档案全网代表作穿透探索（基于 `/api/media/person`）

- **可行性结论**：**中等 (B+ / 存在现实架构断层，需适配改造)**
- **架构断层诊断（关键发现）**：
  - PM 规划中假设直接调用 `/api/media/person` 即可呈现演职员代表作；
  - **实地代码检查表明**：`src/app/api/media/person/route.ts` 源码第 22~25 行：
    ```ts
    const idx = id.indexOf(':');
    if (idx <= 0 || id.slice(0, idx) !== 'tvmaze' || !/^\d+$/.test(id.slice(idx + 1))) {
      return jsonError('人物 id 格式无效（应为 tvmaze:<数字>）', 400);
    }
    ```
    该接口**仅接收 TVMaze ID（且仅限欧美英文电视剧）**！
  - 前端详情中演员列表均为**中文姓名纯字符串**（如“沈腾”、“张艺谋”、“诺兰”）。直接传姓名会导致 400 报错。
- **推荐技术实现路径**：
  1. **服务端接口升级**（`src/app/api/media/person/route.ts`）：
     - 增加对 `?name=姓名` 查询参数的支持；
     - 结合现有豆瓣/TMDB 客户端或全网采集源聚合检索，快速查出该演员参与的主要代表作列表（返回统一的 `OverseasMediaItem[]`）；
  2. **前端落地**（`src/features/watch/person-drawer.tsx`）：
     - 点击 `WatchSidebar` 中的导演或演员卡片，呼出侧滑“演职员艺术生平与代表作”抽屉；
     - 展示演员标准头像、职务角色及代表作卡片瀑布流；
     - 点击代表作卡片直通全网 JIT 换源秒播。
- **技术难点与潜在风险**：
  - 国内演员在 TVMaze 中查不到数据，必须依赖多源聚合搜索兜底。
- **工程工作量预估**：**1.5 ~ 2 人天**。

---

## 3. 总体评估汇总表与架构影响矩阵

| 需求 ID | 需求名称 | PM 优先级 | 研发可行性 | 推荐方案 | 核心改动文件 | 预估工时 | 风险规避与关键门禁 |
| :--- | :--- | :---: | :---: | :--- | :--- | :---: | :--- |
| **REQ-P0-01** | HLS 视频多画质档位选择与锁定 | P0 | **极高 (A+)** | 监听 Hls.js levels，注入 ArtPlayer 菜单，ABR/锁定双模 | `use-hls-pipeline.ts`<br>`player-shell.tsx` | 0.5~1d | 单码率源优雅隐藏；弱网持续卡顿自动切回 Auto 兜底 |
| **REQ-P0-02** | 内置多语言音频轨道无缝切换 | P0 | **极高 (A+)** | 监听 audioTracks，无缝热切 audioTrack | `use-hls-pipeline.ts`<br>`player-shell.tsx` | 0.5~1d | 单音轨源自动隐藏；切换期间给出平滑过渡提示 |
| **REQ-P0-03** | 1000 集长剧虚拟滚动重构 | P0 | **极高 (A+)** | `@tanstack/react-virtual` 按行虚拟化网格，保留百集锚点 | `watch-sidebar.tsx` | 1~1.5d | 容器响应式断点动态 measure；倒序后焦点重新计算 |
| **REQ-P0-04** | 首页“我的追剧·最近更新”动态流 | P0 | **极高 (A+)** | 挂载既有 `ContinueWatchingRow`，联动集数对比与红点 | `src/app/page.tsx`<br>`continue-watching-row.tsx` | 0.5~1d | 非结构化备注过滤；完结剧防误触发红点 |
| **REQ-P0-05** | QoS 线路监控雷达抽屉与一键秒切 | P0 | **极高 (A+)** | 半屏抽屉形态，复用后台测速指标，展示 S/A/B/C 评级 | `qos-radar-drawer.tsx`<br>`watch/page.tsx` | 1~1.5d | 极速源必须满足当前集数完整度要求；60s 测速防刷节流 |
| **REQ-P1-01** | 外挂字幕时间轴微调与本地记忆 | P1 | **极高 (A+)** | 阶梯微调（±0.5s~±2.5s），按剧本地存储记忆与重置 | `use-subtitle-track.ts`<br>`subtitle-layer.tsx` | 0.5d | 换集提示沿用偏移量，支持一键复位 |
| **REQ-P1-02** | 演职员档案全网代表作穿透探索 | P1 | **中等 (B+)** | 接口增加 `?name=` 支持，前端侧滑抽屉展示代表作网格 | `api/media/person/route.ts`<br>`person-drawer.tsx` | 1.5~2d | 彻底解除 tvmaze 仅英文 ID 限制，多源聚合兜底 |

---

## 4. 研发建议与落地排期策略

### 4.1 版本研发排期汇总

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LibreTV v1.2 研发工期规划                        │
├────────────────────────────────────────────────────────────────────────┤
│ 阶段一：P0 核心攻坚 (3.5 ~ 5 人天)                                       │
│   - Day 1: REQ-P0-01 (画质切换) + REQ-P0-02 (音轨切换)                   │
│   - Day 2: REQ-P0-03 (长剧虚拟滚动 @tanstack/react-virtual 重构)        │
│   - Day 3: REQ-P0-04 (首页追剧更新流挂载与红点交互打磨)                    │
│   - Day 4: REQ-P0-05 (QoS 监控雷达抽屉与一键秒切极速源)                  │
│                                                                        │
│ 阶段二：P1 体验增强 (2 ~ 2.5 人天)                                       │
│   - Day 5: REQ-P1-01 (外挂字幕时间轴阶梯微调与按剧记忆)                   │
│   - Day 6: REQ-P1-02 (演职员接口 ?name= 改造与代表作抽屉)                │
│                                                                        │
│ 阶段三：循环联调与回归 (1.5 ~ 2 人天)                                    │
│   - Day 7: 单元测试补全 (对齐 368+ 测试项) + 真实切片流回归走查          │
│   - 交付 QA 循环复测与 UI 还原度走查                                     │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2 研发核心建议
1. **范围建议**：强烈赞同 PM 推荐的 **“4 个 P0 + 2 个 P1”** 组合。其中 P0 项对性能基建与观影体验具有决定性意义，且大部分技术底座已有半成品或现成依赖（工期高度可控）；
2. **演职员接口（REQ-P1-02）专项提醒**：不可按原设想直接对接 `/api/media/person`，必须安排 1 天时间完成服务端 `?name=` 姓名聚合转接层，以保障华语影视演职员的探索体验；
3. **架构稳定性保证**：所有改动严格遵守前端最小侵入原则，不破坏 Dexie 既有历史结构，不新增重型服务端依赖，保证全流程纯净、轻量与敏捷。
