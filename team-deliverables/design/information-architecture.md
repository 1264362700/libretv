# information-architecture.md — 信息架构与页面流程

**产品**：LibreTV（cl.tv）视频聚合播放平台  
**版本**：v1.0（基于 PRD.md v1.0 草稿）  
**编制**：UI/UX 设计师（ui-ux-designer）  
**依据**：`PRD.md`、`PROTOTYPE.md`、`DEVELOPMENT.md`、`PRD-IMAGE-OPT.md`  
**状态**：待 Lead 审阅 → 交付 fullstack-developer 实施

---

## 0. 总览

LibreTV 是一个元数据中心化 + JIT 多源切片流匹配的视频聚合播放平台，基于 Next.js 15 + TypeScript + Tailwind CSS 构建，采用“门面元数据层（TMDB/豆瓣/Bangumi/Cinemeta/TVMaze 等）+ 播放解析层（AppleCMS/TVBox/IPTV 采集源）”双层架构。前端为纯前端渲染，本地优先、纯隐私保护，无商业广告。

全站共 **6 个页面路由**，优先级均为 P0（除历史页、设置页为 P1）：

| 路由 | 页面 | 一句话定位 | 优先级 | 是否受登录保护 |
|------|------|------------|--------|----------------|
| `/` | 首页 | Hero 轮播 + TMDB 官方搜索 + 采集源深度扫描 | P0 | 部分（播放入口需登录） |
| `/catalog` | 片库页 | 分频道片库、多维筛选、聚合卡片 | P0 | 部分（点击播放需登录） |
| `/watch` | 播放页 | 多源并发测速、自动故障转移、选集、追剧单、离线下载 | P0 | 是（全部） |
| `/history` | 历史页 | 观看历史列表、搜索、清空 | P1 | 否（本地 IndexedDB，无后端） |
| `/login` | 登录页 | 账号登录 / 邀请码注册，登录拦截全站受保护页 | P0 | 否（已登录自动跳回） |
| `/settings` | 设置页 | 源管理、偏好设置、配置导入导出 | P1 | 否（建议登录后使用） |

---

## 1. 网站地图（Sitemap）

以下按页面层级与导航归属组织，供开发与 QA 参考。

```
cl.tv (LibreTV)
├── / 首页 (Home)
│   ├── Header：Logo | 搜索入口 | 设置 | 用户状态/登录
│   ├── Hero 巨幕轮播（TMDB 官方趋势大片 ×6，带播放按钮）
│   ├── 左图右榜双栏楼层
│   │   ├── 左侧：推荐内容卡片网格（官方海报卡片 MediaCard）
│   │   └── 右侧：热播榜单（文字列表）
│   ├── 底层采集源深度扫描（可展开，NDJSON 流式逐源返回）
│   └── SiteFooter
├── /catalog 片库页 (Catalog)
│   ├── 页头：频道图标 + 频道标题 + 副标题
│   ├── 搜索表单：输入框 + 深搜按钮 + 清空按钮
│   ├── 搜索结果横幅（仅有搜索词时显示）
│   ├── 热门搜索词（仅无搜索词时显示）
│   ├── 多维筛选面板（地区 / 类型 / 年份 / 排序；移动端底部弹窗）
│   ├── 统计与加载状态行（结果总数 + 实时更新动画）
│   ├── 内容网格（官方片库卡片 / 聚合卡片）
│   ├── 分页导航（仅无搜索词时显示）
│   └── 浮动回到顶部按钮
├── /watch 播放页 (Watch)
│   ├── 顶部自适应导航栏（sticky）：返回 | 首页 | 标题 + 源名 + 第 X/Y 集 | 操作组
│   ├── 左主视区（1fr）：环境光影 | 播放器（ArtPlayer + hls.js） | 视频信息与快捷控制栏 | 播放线路栏（水平滚动）
│   ├── 右侧栏（360–380px，桌面端固定；移动端折叠为底部选集栏）：
│   │   ├── 剧集选集（百集分段折叠，当前集高亮）
│   │   ├── 本集看点
│   │   ├── 影片档案（导演 / 演员 / 类型 / 地区 / 剧情简介）
│   │   ├── 演职员探索图谱
│   │   └── 海报墙
│   ├── 全宽“猜你喜欢”智能推荐专区
│   └── 弹层：SwitchSourceModal | QrHandoffModal | SpeedSuggestionDialog | WatchFallbackState
├── /history 历史页 (History)
│   ├── 页头：返回 | 标题“观看历史” | 总数（N） | 清空历史按钮
│   ├── 搜索栏：搜索图标 + 输入框 + 清空按钮
│   ├── 列表区：空态 | 提示（共 N 条，最近 50 条）| 历史记录列表（缩略图 / 标题 / 副标题 / 进度条 / 删除）
│   └── ConfirmDialog（清空历史确认）
├── /login 登录页 (Login)
│   ├── 全屏背景：流光装饰
│   ├── 品牌区：Logo | 标题 | 副标题
│   ├── 卡片容器：被顶号提示 | Tab（账号登录 / 邀请码注册）| 错误提示条 | 登录表单 | 注册表单 | 底部链接
│   └── SiteFooter
└── /settings 设置页 (Settings)
    ├── 页头：返回 | 标题“设置”
    ├── 一级 Tab：源管理 | 偏好设置 | 数据
    ├── 二级 Tab（随一级变化）：
    │   ├── 源管理：点播源 | 数据源订阅
    │   ├── 偏好设置：播放与过滤 | 封面图加载 | 首页与内容
    │   └── 数据：配置导入导出
    └── 内容区（随子 Tab 变化）
```

### 1.1 全局布局骨架

所有页面共享以下全局结构（移动端另行适配，见 §4）：

```
┌─────────────────────────────────────────────────────────────┐
│ Header（固定顶部）：Logo | 搜索 | 设置 | 用户状态             │
├─────────────────────────────────────────────────────────────┤
│ 主内容区（max-w-7xl mx-auto，页面差异化区域）              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
│ SiteFooter                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 页面流（User Flow / 路由跳转关系）

### 2.1 全局跳转规则（关键）

1. **登录拦截**：任何未登录状态访问 `/watch`，或在 `/`、`/catalog` 点击播放入口，统一跳转 `/login?redirect=<当前完整 URL>`；登录成功后 `window.location.href = redirect` 回跳。
2. **401 响应**：统一通过 `libretv:unauthorized` 全局事件触发登录框。
3. **播放页内设置入口**：跳转 `/settings`；设置页内“返回首页”跳转 `/`。
4. **历史记录点击**：跳转 `/watch?source=...&id=...&index=...&position=...`，恢复进度。
5. **已登录访问 `/login`**：自动跳回 redirect 参数指定的页或首页。

### 2.2 主要用户流（Mermaid 流程图）

#### 流程 A：冷启动 → 浏览首页 → 播放影片（未登录）

```mermaid
flowchart TD
    A[用户打开 cl.tv /] --> B[首页：Hero 轮播 + 推荐卡片 + 搜索]
    B --> C{用户点击某张卡片播放}
    C -- 已登录 --> D[/watch 直接播放，保留进度]
    C -- 未登录 --> E[/login?redirect=/watch?...]
    E --> F[账号登录 / 邀请码注册]
    F -- 成功 --> G[回跳 redirect 指定的 /watch 页面]
    F -- 失败 --> E[显示错误提示，重新输入]
```

#### 流程 B：片库深搜 → 播放

```mermaid
flowchart TD
    A[/catalog 片库页：选择频道] --> B[多维筛选：地区/类型/年份/排序]
    B --> C[官方片库卡片网格 / 聚合卡片]
    C --> D[点击卡片播放]
    D -- 未登录 --> E[/login?redirect=/watch?...]
    D -- 已登录 --> F[/watch?source=...&id=...&title=...&year=...]
    E --> G[登录/注册成功] --> F
```

#### 流程 C：播放中换源与故障转移

```mermaid
flowchart TD
    A[/watch 播放页：自动拉取详情并开始播放首集] --> B{当前源是否有播放地址?}
    B -- 否 --> C[显示“立即切换至备用线路”按钮 + WatchFallbackState]
    B -- 是 --> D[多源并发测速：显示延迟 + QoS 等级]
    D --> E[优选最快线路播放]
    E --> F{播放中线路卡顿/切片异常?}
    F -- 是 --> G[5 秒内自动切换下一条高速线路，保留进度]
    F -- 否 --> H[继续播放]
    G --> E
```

#### 流程 D：观看历史 → 续播

```mermaid
flowchart TD
    A[/history 历史页：按时间倒序显示最近 50 条] --> B[搜索过滤匹配标题]
    B --> C[点击某条记录]
    C --> D[/watch?source=...&id=...&index=...&position=...]
    D --> E[从上次停留位置续播（误差 < 2 秒）]
```

#### 流程 E：设置页配置（源管理 / 偏好 / 配置导入导出）

```mermaid
flowchart TD
    A[/settings 设置页：一级 Tab 源管理 / 偏好设置 / 数据] --> B{选择子 Tab}
    B -- 点播源 --> C[添加 / 编辑 / 删除自定义点播源；勾选参与搜索]
    B -- 数据源订阅 --> D[添加订阅 URL；一键同步导入点播源与直播源；查看同步状态]
    B -- 播放与过滤 --> E[自动连播 / 成人过滤 / 广告过滤开关]
    B -- 封面图加载 --> F[直连 / 代理 / 自定义代理三选一]
    B -- 首页与内容 --> G[推荐数据源选择：豆瓣 / Bangumi / 热榜 / Top250 等]
    B -- 配置导入导出 --> H[导出 JSON / 导入 JSON 恢复配置]
```

### 2.3 路由参数与状态传递矩阵

| 来源页 | 目标页 | 关键 URL 参数 | 说明 |
|--------|--------|---------------|------|
| `/` | `/watch` | `title`, `year`, `douban_id` (或 `source`, `id`) | 首页卡片点击播放 |
| `/` | `/login` | `redirect=/watch?...` | 未登录播放拦截 |
| `/catalog` | `/watch` | `source`, `id`, `title`, `year` | 片库卡片点击播放 |
| `/catalog` | `/login` | `redirect=/watch?...` | 未登录播放拦截 |
| `/history` | `/watch` | `source`, `id`, `index`, `position`, `title` | 历史记录续播 |
| `/login` | `/` 或 `redirect` | `redirect` | 登录成功回跳 |
| `/watch` | `/settings` | 无 | 播放页内设置入口 |
| `/settings` | `/` | 无 | 设置页返回首页 |

---

## 3. 页面信息架构（逐页内容结构）

### 3.1 首页 `/`

| 区块 | 内容来源 | 关键字段 | 状态处理 |
|------|----------|----------|----------|
| Header | 本地状态 | `verified` | 决定播放入口是否拦截 |
| Hero 轮播 | `fetchTmdbClient({type:'trending'})` | `items[].id/title/cover/year/rating` (前 6 条) | 加载态 Spinner；空态 EmptyState |
| 左栏推荐卡片 | TMDB / 推荐数据源 | `items[].id/title/cover/year/rating/overview` | 骨架屏加载；空态 EmptyState |
| 右栏热播榜单 | 官方/聚合数据 | 文字列表 | 可点击跳转 `/watch` |
| 底层采集源扫描 | `POST /api/search?stream=1` | `SourceSearchOutcome[].list[]` (`sourceKey/sourceName/vodId/name/pic/year/area/remarks`) | 流式逐源；坏源琥珀色标记；不阻塞好源 |
| 搜索框 | URL 参数 `s` | 关键词，长度≤100 | 跳转 `/catalog?wd=<词>` 或首页内展示结果 |
| 登录状态 | `GET /api/status` | `verified` | 决定播放跳转拦截 |
| 预置源 | `GET /api/status` | `defaultSources` | 默认勾选参与搜索的源 |
| 源健康 | `store.sourceHealth` | `ok/ms/timedOut/error` | 绿/琥珀/红色点 |

### 3.2 片库页 `/catalog`

| 区块 | 内容来源 | 关键字段 | 状态处理 |
|------|----------|----------|----------|
| 频道标题/图标/副标题 | `catalog-config.ts` | `activeChannelConfig.icon/label/subTitle/regions/genres` | 随频道变化 |
| 搜索表单 | URL 参数 `wd` / `catalogKeyword` | 关键词 | 深搜按钮触发 |
| 热门搜索词 | `CHANNEL_HOT_KEYWORDS` | 词列表 | 药丸按钮，点击填入并搜索 |
| 多维筛选 | `useCatalogFilters` | `currentRegion/currentGenre/currentYear/currentSort` | 持久化到 URL；移动端底部弹窗 |
| 搜索结果横幅 | `POST /api/search` | 结果计数 | “正在【频道】全库深度搜索 X（找到约 N 部）” |
| 内容网格 | `GET /api/media/catalog` 或 `POST /api/search` | `list[].id/title/cover/year/rating` | 分页；骨架屏加载；空态 🍿 图标 |
| 分页 | `currentPage` / `totalPages` | 第 X / Y 页 | URL 更新，筛选条件保留，刷新不丢失 |

### 3.3 播放页 `/watch`

| 区块 | 内容来源 | 关键字段 | 状态处理 |
|------|----------|----------|----------|
| 视频标题 | URL / `GET /api/media/detail` | `title` / `videoInfo.title` | 优先官方元数据；截断显示 |
| 剧集列表 | `GET /api/detail` | `episodes[]` (播放地址数组) | 百集分段折叠；当前集高亮 |
| 当前集 | URL 参数 `index` | 0-based | URL 更新，页面不刷新，新集自动加载 |
| 播放地址 | `episodes[index].url` | HLS / HTTP-FLV | ArtPlayer + hls.js；无地址时显示错误 + 切换按钮 |
| 官方海报/背景 | `GET /api/media/detail` | `cover` / `backdrop` | 环境光影 + 海报墙 |
| 演职员 | `GET /api/media/detail` | `actors[]` / `directors[]` | 头像小图 + 姓名 |
| 剧情简介 | `GET /api/media/detail` | `overview` | 可展开折叠 |
| 单集看点 | `GET /api/media/episode-intro` | `title/desc/airdate/duration` | 当前集 |
| 源名称 / QoS | store / `source-circuit-breaker.ts` | `source.name` / `sourceKey` / `getSourceQoSBadge` | 绿/琥珀/红点；延迟 ms |
| 追剧单状态 | `db.favorites` | `favoriteIdOf(title)` | 填充/空心星标；新集首页红点 |
| 播放进度 | `db.history` | `playbackPosition` / `duration` | IndexedDB 持久化，刷新续播 |

### 3.4 历史页 `/history`

| 区块 | 内容来源 | 关键字段 | 状态处理 |
|------|----------|----------|----------|
| 历史记录 | `db.history` | `HistoryEntry[]` (`title/pic/episodeIndex/totalEpisodes/playbackPosition/duration/timestamp`) | 按时间倒序；最近 50 条 |
| 进度百分比 | 计算得出 | `playbackPosition / duration * 100` | 仅 10%~95% 显示 |
| 相对时间 | `formatRelativeTime` | `timestamp` | 如“3 小时前” |
| 搜索过滤 | 本地输入 | 关键词 | 实时过滤匹配标题 |
| 删除单条 | `removeHistory` | 条目 | toast“已删除” + 5 秒撤销 |
| 清空历史 | `clearAllHistory` | 全部 | ConfirmDialog 确认；不可撤销；空态 |

### 3.5 登录页 `/login`

| 区块 | 内容来源 | 关键字段 | 状态处理 |
|------|----------|----------|----------|
| 登录模式 | 本地状态 | `mode` (`login` / `register`) | Tab 切换，清空错误 |
| 账号 | 表单输入 | `username` (≥3 字符) | 登录/注册均需 |
| 密码 | 表单输入 | `password` (≥6 字符) | 登录/注册均需 |
| 邀请码 | 表单输入 / URL 参数 | `inviteCode` / `invite` | 注册必填 |
| 登录接口 | `POST /api/auth` (`action=login`) | `success/user/message` | 成功后跳 redirect 或首页 |
| 注册接口 | `POST /api/auth` (`action=register`) | 需 `inviteCode` | 成功后自动登录并跳转 |
| 被顶号提示 | URL 参数 `kickNotice` | 危险提示条文案 | 危险色条展示 |
| 已登录自动跳转 | `GET /api/status` `verified` | `true` | 自动跳回首页或 redirect |

### 3.6 设置页 `/settings`

| 一级 Tab | 二级 Tab | 内容来源 | 关键字段 |
|----------|----------|----------|----------|
| 源管理 | 点播源 | `store.customAPIs` | `key/name/url/isAdult/timeoutMs/priority` |
| 源管理 | 数据源订阅 | `store.subscriptions` | `url/name/lastSync/lastStatus/lastError` |
| 偏好设置 | 播放与过滤 | `store.autoplayNext` / `store.yellowFilter` | 布尔开关 |
| 偏好设置 | 封面图加载 | `store.imageProxyMode` | `direct` / `proxy` / `custom` |
| 偏好设置 | 首页与内容 | `store.recommendSource` | 枚举值 |
| 数据 | 配置导入导出 | `store.partialize` / `importConfig` | JSON 导出/导入 |

---

## 4. 响应式与移动端适配信息架构

| 组件 | 桌面端表现 | 移动端（375px）表现 |
|------|-----------|-------------------|
| 顶部导航 | 固定顶部导航栏 | 底部标签栏（`mobile-bottom-bar.tsx`）：首页、片库、历史、设置、我的 |
| 多维筛选 | 顶部筛选面板 | 底部弹窗（`mobile-filter-sheet.tsx`） |
| 播放页右侧栏 | 固定宽度 360–380px | 折叠为底部选集栏 |
| 影院宽屏模式 | 右侧栏收起，视区扩大至 84vh | 同上逻辑 |
| 卡片尺寸 | `w-[125px] sm:w-[145px] md:w-[160px] shrink-0`，轨道高度 ~210px | 同等比例自适应，保持 aspect-ratio |
| 骨架屏 | 与真实卡片 1:1 几何对齐 | 同上 |

---

## 5. 数据状态与全局组件归属

| 状态域 | 存储位置 | 持久化方式 | 关联页面 |
|--------|----------|------------|----------|
| 登录/验证状态 | `src/components/auth.tsx` `useAuth` | 内存 + 401 拦截 | 全局（登录拦截） |
| 全局设置 | `src/lib/store.ts` `useAppStore` | Zustand + localStorage | 设置页、首页、播放页 |
| 历史记录 | `src/lib/db.ts` `db.history` | IndexedDB | 历史页、播放页（续播） |
| 追剧单/收藏 | `src/lib/db.ts` `db.favorites` | IndexedDB | 播放页、首页（红点） |
| 源健康度 | `store.sourceHealth` / `recordSourceHealth` | 内存 | 首页源卡片、播放页线路栏 |
| 播放进度 | `src/features/watch/use-watch-progress.ts` | IndexedDB | 播放页 |

---

## 6. 交付确认清单（供 Lead 与 PM 验收）

- [ ] 网站地图涵盖全部 6 个页面路由及导航归属
- [ ] 主要用户流（冷启动播放、片库深搜播放、换源故障转移、历史续播、设置配置）完整
- [ ] 路由参数与状态传递矩阵完整
- [ ] 逐页信息架构与字段来源对齐 PRD.md §8
- [ ] 响应式与移动端适配信息架构明确
- [ ] 全局数据状态与组件归属清晰

---

**下一步**：信息架构确认后，进入 `wireframes.md` 低保真原型设计。