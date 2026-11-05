# information-architecture.md — LibreTV v1.2 信息架构与状态流转设计

**产品**：LibreTV (cl.tv) 流媒体与聚合视听平台  
**版本**：v1.2 (Gate 2 / R2 UI 设计交付)  
**设计角色**：UI/UX 设计师 (ui-ux-designer)  
**基准需求**：`team-deliverables/pm/iteration-plan.md` (Gate 1 用户裁决方案 B)  
**技术约束**：`team-deliverables/dev/tech-feasibility-assessment.md`  
**交付归属**：`team-deliverables/design/information-architecture.md`  
**生效日期**：2026-11-05  

---

## 0. 设计定位与升级背景

在 LibreTV v1.2 迭代中，根据系统主管与用户的正式裁决（方案 B：稳健收敛），针对 6 大核心体验断层实施全套 UI/UX 架构升级：
1. **REQ-P0-01**：HLS 视频多清晰度（画质档位）选择与锁定（Auto / 1080P / 720P / 4K）；
2. **REQ-P0-02**：内置多语言音频轨道无缝切换（国英双语 / 原声日语 / 粤语等）；
3. **REQ-P0-03**：1000 集长剧选集 `@tanstack/react-virtual` 虚拟化滚动重构；
4. **REQ-P0-04**：首页“我的追剧·最近更新”动态流专区与智能红点提示（Hero 巨幕下方、推荐流上方；追平或为空时自适应优雅折叠）；
5. **REQ-P0-05**：播放线路 QoS 综合监控雷达抽屉与“一键秒切极速源”；
6. **REQ-P1-01**：外挂字幕时间轴毫秒级阶梯步进微调与按剧持久化。

本文档详细定义页面层级拓扑、导航结构、数据实体关系及核心功能的状态转移图（State Machine Flow），为线框图原型（`wireframes.md`）、视觉规范（`ui-spec.md`）及后续研发与验收提供严密依据。

---

## 1. 系统全景地图与层级结构 (Sitemap & Page Hierarchy)

```
LibreTV (cl.tv)
├── / 首页 (HomePage)
│   ├── Header 顶部玻璃导航栏 (Logo / 全局搜索 / 频道切换 / 设置 / 登录状态)
│   ├── Hero 巨幕大轮播 (4K 趋势海报 / 快速起播 / 影视档案入口)
│   ├── 🌟 [v1.2 核心] 追剧动态与无缝续播横滑专区 (ContinueWatchingRow)
│   │   ├── 胶囊选项卡：【▶ 继续观看】 / 【⭐ 我的追剧 (🔴有新集更新)】
│   │   ├── 追剧动态卡片 (更新红点 / 最新集数差量 / 一键直达最新未看集)
│   │   └── 续播历史卡片 (精准进度百分比 / 秒数续播 / 单条删除及撤销)
│   ├── 左图右榜双栏楼层 (推荐影视流 MediaCard + 热门飙升榜)
│   ├── 底层采集源深度流式扫描视图 (可展开，流式并发探针)
│   └── SiteFooter 全局页脚
├── /watch 播放页 (WatchPage)
│   ├── 顶部自适应悬浮导航条 (返回 / 标题 / 当前源名与延迟徽章 / 测速换源抽屉触发器 / 跨屏接力 / 追剧开关)
│   ├── 左主视区：环境光影 + 播放器核心 (PlayerShell)
│   │   ├── ArtPlayer 播放内核 (Web/系统全屏 / 倍速 / 比例 / 截图)
│   │   ├── 🌟 [v1.2 核心] 控制栏清晰度切换菜单 (Auto / 1080P / 720P / 4K 档位热切与锁定)
│   │   ├── 🌟 [v1.2 核心] 设置面板音频轨道切换子项 (国语 / 英语 / 日语 / 粤语等内置音轨热切)
│   │   ├── 🌟 [v1.2 核心] 外挂字幕渲染与右上角阶梯微调胶囊 (±0.5s / ±1.0s / ±2.5s / 重置)
│   │   ├── 播放器内右侧悬浮感应贴边选集抽屉 (全屏模式选集)
│   │   └── 播放器底部主控与快捷线路栏 (含当前线路延迟与雷达抽屉快捷入口)
│   ├── 右侧栏 (WatchSidebar，桌面端常驻 / 移动端折叠)
│   │   ├── 🌟 [v1.2 核心] 1000 集长剧虚拟化滚动选集面板 (Virtual Episode Grid)
│   │   │   ├── 顶部排序与控制栏 (剧集总数 / 正序倒序切换)
│   │   │   ├── 百集快速区间锚点条 (1-100 / 101-200 / 201-300 / ...)
│   │   │   └── 虚拟化视口网格容器 (恒定 48~60 DOM 节点，当前集居中焦点高亮)
│   │   ├── 本集剧情看点 (动漫/剧集单集简介展开)
│   │   ├── 影视资料与海报墙 (年份 / 地区 / 分类 / 演职员纯文本 / 剧照)
│   │   └── 猜你喜欢相关推荐流
│   └── 🌟 [v1.2 核心] 全局右侧滑出 QoS 线路雷达监控抽屉 (QoSRadarDrawer)
│       ├── 抽屉顶部：线路全景统计 + 测速刷新按钮
│       ├── 顶置推荐：常驻极速源一键秒切 Banner (🚀 提速百分比 / 目标延迟 / 一键秒切)
│       ├── QoS 线路雷达列表 (EWMA 毫秒延迟 / S-A-B-C 评级徽章 / 集数覆盖度 / 熔断器状态)
│       └── 抽屉底部操作栏 (手动重新并发测速 / 线路筛选)
├── /catalog 片库大厅 (CatalogPage)
├── /history 观看历史页 (HistoryPage)
├── /settings 设置中心 (SettingsPage)
└── /login 登录与邀请注册 (LoginPage)
```

---

## 2. 6 大核心功能信息架构图

### 2.1 首页“我的追剧·最近更新”动态流架构 (REQ-P0-04)

```mermaid
flowchart TD
    HomePage["首页 (/)"] --> HeroBanner["HeroBillboardBanner 巨幕轮播"]
    HeroBanner --> ContinueRow["ContinueWatchingRow 专属横滑楼层 (z-20)"]
    ContinueRow --> RecommendSection["RecommendSection 推荐流与飙升榜"]

    subgraph DataEngine["本地数据与比对引擎"]
        DexieFav["Dexie db.favorites (追剧收藏)"]
        DexieHist["Dexie db.history (观看历史)"]
        RemarksSync["CMS 主采集源 remarksQuery (集数静默同步)"]
        DiffAlgorithm["checkHasNewEpisodes 算法 (正则比对最新集数)"]
        DexieFav --> DiffAlgorithm
        RemarksSync --> DiffAlgorithm
    end

    DiffAlgorithm --> UpdateCount{"是否有新集更新？"}
    UpdateCount -->|"是 (count > 0)"| ShowPulseBadge["点亮专属红点呼吸胶囊: 🔴 更新 N 集"]
    UpdateCount -->|"否"| ShowNormalBadge["显示常规状态: ★ 追剧中"]

    ContinueRow --> SwitchTabs{"横滑专区选项卡"}
    SwitchTabs -->|"Tab 1"| HistoryTab["继续观看 · 无缝续播"]
    SwitchTabs -->|"Tab 2"| FavTab["我的追剧 · 更新提醒"]

    HistoryTab --> HistCard["续播卡片 (海报 + 进度条 + 剩余秒数 + 快捷删除)"]
    FavTab --> FavCard["追剧卡片 (海报 + 状态角标 + 最新集数备注 + 一键直达最新集)"]

    FavCard --> DirectPlay["点击卡片: 自动定位至未看第一集或最新集, 标记已看, 跳转 /watch"]
```

### 2.2 播放器画质与多音轨二级控制流架构 (REQ-P0-01 & REQ-P0-02)

```mermaid
flowchart TD
    HlsInstance["Hls.js 播放器管线 (useHlsPipeline)"] --> ManifestEvent["MANIFEST_PARSED / LEVEL_LOADED"]
    
    subgraph LevelDetection["画质档位探测与管理"]
        ManifestEvent --> CheckLevels{"hls.levels.length > 1 ?"}
        CheckLevels -->|"是 (多码率源)"| ParseLevels["解析 Levels (4K 2160P / 1080P / 720P)"]
        ParseLevels --> MountLevelMenu["注入 ArtPlayer 控制栏 [画质/清晰度] 菜单"]
        CheckLevels -->|"否 (单码率源)"| HideLevelMenu["自适应隐藏或显示默认原画 (不渲染破损项)"]
        MountLevelMenu --> UserSelectLevel["用户点击切换档位"]
        UserSelectLevel --> SetHlsLevel["hls.currentLevel = index (-1 为 Auto)"]
        SetHlsLevel --> ABRState{"切换目标"}
        ABRState -->|"Auto"| EnableABR["恢复 Hls.js 自适应码率"]
        ABRState -->|"固定档位"| LockResolution["锁定分辨率 + 存入 localStorage 偏好"]
    end

    subgraph AudioTrackDetection["内置音轨探测与管理"]
        ManifestEvent --> CheckAudioTracks{"hls.audioTracks.length > 1 ?"}
        CheckAudioTracks -->|"是 (多语言音轨)"| ParseAudioTracks["解析 AudioTracks (国语 / 英语 / 粤语 / 日语等)"]
        ParseAudioTracks --> MountAudioMenu["注入 ArtPlayer Settings 面板 [音频轨道] 子菜单"]
        CheckAudioTracks -->|"否 (单音轨)"| HideAudioMenu["自适应隐藏音频选项"]
        MountAudioMenu --> UserSelectAudio["用户点击选择目标音轨"]
        UserSelectAudio --> SetAudioTrack["hls.audioTrack = trackId (无缝热切)"]
        SetAudioTrack --> AudioFeedback["展示轻量 Toast: 正在平滑切换音轨..."]
    end
```

### 2.3 1000 集长剧选集虚拟化与快速锚点联动架构 (REQ-P0-03)

```mermaid
flowchart TD
    WatchSidebar["播放页侧栏 (WatchSidebar)"] --> TotalCheck{"集数 totalEpisodes > 40 ?"}
    
    TotalCheck -->|"是 (长剧集场景)"| MountAnchorBar["渲染百集快速区间锚点条 (1-100, 101-200...)"]
    TotalCheck -->|"否 (普通短剧)"| NormalLayout["直接渲染虚拟化视口"]

    MountAnchorBar --> UserClickAnchor["用户点击百集锚点 (如 501-600)"]
    UserClickAnchor --> CalcTargetRow["计算行索引: Math.floor(500 / cols)"]
    CalcTargetRow --> VirtualScroll["调用 rowVirtualizer.scrollToIndex(targetRow, smooth)"]

    subgraph VirtualEngine["@tanstack/react-virtual 视口虚拟化引擎"]
        RowChunk["将剧集切分为行 (Desktop 4列, Mobile 6列)"]
        VirtualHook["useVirtualizer (estimateSize: 36px, overscan: 3)"]
        RowChunk --> VirtualHook
        VirtualHook --> MeasureObserver["ResizeObserver 监听容器宽度自适应列数"]
        VirtualHook --> DOMWindow["动态渲染视口内 6~8 行 DOM (总节点恒定 48~60 个)"]
    end

    VirtualScroll --> DOMWindow
    
    subgraph FocusCenter["当前播放集自动焦点与居中同步"]
        CurrentIndexChange["换集事件触发 (currentIndex 变更)"]
        CurrentIndexChange --> AutoCenter["自动定位到当前集所在行并滚动至视口中央"]
        AutoCenter --> ApplyFocusRing["激活当前集高亮发光与键盘焦点环 (Ring Accent)"]
    end

    DOMWindow --> ApplyFocusRing
```

### 2.4 播放线路 QoS 综合监控雷达抽屉与秒切状态流架构 (REQ-P0-05)

```mermaid
flowchart TD
    WatchPage["播放页大厅 (/watch)"] --> TriggerQoS["点击顶部线路标签 / 控制栏测速入口 / 快捷推荐胶囊"]
    TriggerQoS --> OpenDrawer["滑出 QoS 线路雷达监控抽屉 (QoSRadarDrawer)"]

    subgraph RadarHeader["抽屉顶部与极速秒切 Banner"]
        HeaderStat["线路总览: 共 X 条线路 · Y 条极速可用"]
        BestSourceBanner{"是否存在提速 ≥ 30% 且覆盖当前集的极速源？"}
        BestSourceBanner -->|"是"| ShowSpeedBanner["常驻极速源 Banner: 🚀 较当前源提速 XX% [一键秒切]"]
        BestSourceBanner -->|"否"| HideSpeedBanner["展示常规状态: 当前已处于最佳播放线路"]
    end

    OpenDrawer --> RadarHeader
    OpenDrawer --> RadarList["QoS 线路卡片列表 (按 EWMA 延迟升序实时排序)"]

    subgraph CardContent["每条线路卡片信息元数据"]
        CardName["源名称 (如 海外蓝光专线 / 优质切片源)"]
        CardPing["实时 Ping 延迟 (毫秒, 如 68ms)"]
        CardBadge["QoS 评级徽章 (S极速 / A良好 / B一般 / C受阻)"]
        CardCoverage["集数完整度覆盖 (如 40集全 · 覆盖当前第12集)"]
        CardCircuit["熔断状态 (健康闭合 / 半开探测 / 熔断冷却)"]
    end

    RadarList --> CardContent

    ShowSpeedBanner -->|"用户点击 [一键秒切] 或点击卡片 [立即切换]"| ExecuteSwitch["调用 useWatchEngine.switchSource()"]
    ExecuteSwitch --> SavePosition["记录当前播放时间戳 (精确至秒)"]
    SavePosition --> LoadNewStream["载入新线路切片流并复用已有播放器容器"]
    LoadNewStream --> RestoreSeek["恢复原播放时间戳 (误差 ≤ 1s), Toast 提示换源成功"]
```

### 2.5 外挂字幕时间轴阶梯微调与持久化架构 (REQ-P1-01)

```mermaid
flowchart TD
    SubtitleLoad["用户拖拽 / 载入外挂字幕 (SRT / VTT)"] --> SubtitleLayer["SubtitleLayer 激活右上角时间轴微调胶囊"]
    SubtitleLayer --> ReadStorage["读取 localStorage (`libretv:sub_offset:${showKey}`)"]
    ReadStorage --> RestoreOffset["恢复本剧历史字幕偏移 (如 +1.5s)"]

    subgraph StepperControls["阶梯式多档步进调节器"]
        StepHalf["±0.5s 微调按钮 (应对句尾轻微错位)"]
        StepOne["±1.0s 中档步进 (应对短句早出/晚出)"]
        StepTwoHalf["±2.5s 大档快调 (应对片头剪辑差异)"]
        ResetBtn["一键归零重置按钮 (Offset = 0s)"]
    end

    SubtitleLayer --> StepperControls
    StepperControls --> UpdateOffset["更新 offsetRef 与 state 双写"]
    UpdateOffset --> TimeUpdate["播放器 timeupdate 驱动 findActiveSubtitleText"]
    TimeUpdate --> RealtimeShift["实时位移对白文本渲染时间 (反馈延迟 ≤ 50ms)"]
    UpdateOffset --> SaveStorage["写回 localStorage 按剧独立持久化"]
```

---

## 3. 核心交互状态转移图 (State Transition Diagrams)

### 3.1 首页追剧专区状态转移机 (ContinueWatchingRow State Machine)

```mermaid
stateDiagram-v2
    [*] --> Initializing : 首页载入，初始化 Dexie 数据库连接
    
    Initializing --> EmptyHidden : 追剧单为空 且 观看历史为空
    note right of EmptyHidden : 专区优雅完全折叠，DOM 不留任何空白占位，确保首页视觉紧凑
    
    Initializing --> HistoryActive : 有历史记录 且 无追剧收藏
    Initializing --> FavoritesActive : 有追剧收藏 且 历史记录为空
    Initializing --> DefaultTab : 历史与追剧均存在 (默认展示继续观看)

    state DefaultTab {
        [*] --> HistoryView
        HistoryView --> FavoritesView : 用户点击【⭐ 我的追剧】标签
        FavoritesView --> HistoryView : 用户点击【▶ 继续观看】标签
    }

    state FavoritesView {
        [*] --> ComparingEpisodes : 后台比对 db.favorites 与 remarksQuery
        ComparingEpisodes --> AllCaughtUp : 所有追剧集数已追平 (无新集)
        note right of AllCaughtUp : 卡片显示“★ 追剧中”，底部标注“已更新至最新”
        
        ComparingEpisodes --> HasUpdates : 检测到新集数差量 (count > 0)
        note right of HasUpdates : 专区标题点亮“N 部有新集”，卡片高亮“🔴 更新 N 集”脉冲呼吸胶囊
        
        HasUpdates --> ClickToWatch : 用户点击更新卡片
        ClickToWatch --> MarkSeen : 自动将已看集数推进至最新集，标记 seenEpisodes
        MarkSeen --> NavigatePlayer : 直通 /watch 播放页自动播放下一未看集
    }

    state HistoryView {
        [*] --> ShowHistoryCards : 渲染最近观看卡片流
        ShowHistoryCards --> ClickResume : 用户点击卡片
        ClickResume --> ResumeWatch : 直通 /watch 从断点秒数精准续播
        ShowHistoryCards --> RemoveHistory : 用户点击右上角 [×] 移除
        RemoveHistory --> UndoToast : 弹出 Toast 带 5 秒撤销按钮
        UndoToast --> RestoreItem : 点击撤销，恢复记录
        UndoToast --> FinalDelete : 5 秒倒计时结束，物理移出 Dexie
    }
```

### 3.2 播放器画质档位热切与锁定状态转移机 (Video Quality State Machine)

```mermaid
stateDiagram-v2
    [*] --> ProbingLevels : 载入 HLS 视频切片清单 (Manifest)
    
    ProbingLevels --> SingleLevel : hls.levels.length <= 1
    note right of SingleLevel : 单码率切片源，控制栏自适应隐藏清晰度按钮或标示“原画/默认”

    ProbingLevels --> MultiLevelAuto : hls.levels.length > 1 (多码率)
    note right of MultiLevelAuto : 默认进入 Auto 自适应码率状态 (ABR)，hls.currentLevel = -1

    MultiLevelAuto --> ManualLocked : 用户手动选择具体画质 (如 1080P / 4K)
    state ManualLocked {
        [*] --> HotSwitching : hls.currentLevel = targetIndex
        HotSwitching --> BufferingNewLevel : Hls.js 平滑请求新码率分片 (≤ 1.5s)
        BufferingNewLevel --> PlayingLocked : 播放继续，时间戳跳变 < 1s，保持锁定
        
        PlayingLocked --> NetworkStalled : 遭遇弱网连续缓冲卡顿 (重试超过 3 次)
        NetworkStalled --> AutoFallbackToast : 弹出保护 Toast: “网络不稳定，已切回自适应画质”
        AutoFallbackToast --> [*] : 自动回退至 Auto 状态
    }

    ManualLocked --> MultiLevelAuto : 用户在菜单中重新勾选【自动 (Auto)】
```

### 3.3 QoS 综合监控雷达抽屉与秒切状态转移机 (QoS Radar Drawer State Machine)

```mermaid
stateDiagram-v2
    [*] --> DrawerClosed : 抽屉处于隐藏收拢态
    
    DrawerClosed --> OpeningDrawer : 用户点击换源按钮 / 快捷测速标签
    OpeningDrawer --> DrawerOpened : 桌面端从右侧平滑滑出 / 移动端从底部升起

    state DrawerOpened {
        [*] --> ReadingMetrics : 复用 useWatchEngine 现有 EWMA 延迟与评级
        
        ReadingMetrics --> EvaluatingBanner : 评估最快源是否满足提速 ≥ 30% 且覆盖当前集
        EvaluatingBanner --> BannerActive : 满足秒切条件，顶置呈现极速 Banner
        EvaluatingBanner --> BannerIdle : 不满足条件，顶置显示常规最优提示
        
        state UserActions {
            [*] --> IdleWaiting
            IdleWaiting --> ManualRetest : 点击【重新测速】按钮
            ManualRetest --> ParallelProbing : 并发探活 (超时严格截断至 3000ms)
            ParallelProbing --> UpdateSorting : 线路列表按响应耗时重新升序洗牌
            UpdateSorting --> IdleWaiting

            IdleWaiting --> ClickFastBanner : 点击顶部【一键秒切极速源】
            IdleWaiting --> ClickListItem : 点击列表内任意线路卡片【切换】
        }
    }

    ClickFastBanner --> ExecutingSwitch : 触发无缝换源流
    ClickListItem --> ExecutingSwitch : 触发无缝换源流

    state ExecutingSwitch {
        [*] --> FreezePlayback : 捕获并冻结当前播放精确时间戳
        FreezePlayback --> SwitchHlsSource : 销毁旧 Hls 实例并载入新切片源
        SwitchHlsSource --> SeekAndResume : 恢复至原时间戳，微调缓冲 (≤ 1.5s 完成)
        SeekAndResume --> ToastSuccess : 弹出 Toast: “已秒切至 [源名]，保留播放进度”
    }

    ToastSuccess --> DrawerClosed : 自动平滑关闭抽屉
    DrawerOpened --> DrawerClosed : 用户点击遮罩 / 关闭图标 / 键盘 Esc
```

---

## 4. 路由参数与跨页面持久化契约

### 4.1 URL 路由参数定义规范

| 路由 | 参数名 | 类型 | 说明 | 示例 |
|:---|:---|:---|:---|:---|
| `/watch` | `title` | string | 影视标准名称 (用于多源匹配) | `title=三体` |
| `/watch` | `year` | string | 上映年份 (用于辅助消歧) | `year=2023` |
| `/watch` | `index` | number | 当前播放集索引 (0-indexed) | `index=0` (第1集) |
| `/watch` | `sourceKey` | string | 选定点播源唯一标识 | `sourceKey=bfzym3u8` |
| `/watch` | `sourceUrl` | string | 点播源接口 URL (用于离线解析) | `sourceUrl=https%3A%2F%2F...` |
| `/watch` | `position` | number | 秒级续播断点时间戳 (可选) | `position=1420` (第23分40秒) |
| `/watch` | `quality` | string | 初始偏好画质锁 (可选) | `quality=1080p` |

### 4.2 本地存储 (LocalStorage & IndexedDB) 数据键契约

| 存储媒介 | Key 命名规则 | 数据结构 | 用途说明 |
|:---|:---|:---|:---|
| `Dexie db.favorites` | 表 `favorites` | `{ id, title, sourceKey, lastKnownEpisodes, seenEpisodes, remarks, timestamp }` | 首页追剧更新红点对比与集数追踪 |
| `Dexie db.history` | 表 `history` | `{ id, title, episodeIndex, playbackPosition, duration, timestamp }` | 首页继续观看断点续播 |
| `LocalStorage` | `libretv:sub_offset:${showKey}` | `number` (如 `1.5`, `-0.5`) | 外挂字幕时间轴微调按剧持久化 |
| `LocalStorage` | `libretv:preferred_quality` | `'auto' \| '4k' \| '1080p' \| '720p'` | 用户画质档位全局偏好记忆 |
| `LocalStorage` | `libretv:sidebar_reversed` | `boolean` | 长剧选集正序/倒序排列偏好 |