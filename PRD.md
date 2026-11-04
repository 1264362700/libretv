# LibreTV / cl.tv 产品需求文档（PRD 草稿）

**版本**：v1.0（草稿）  
**产品**：LibreTV（cl.tv）视频聚合播放平台  
**技术栈**：Next.js 15 + TypeScript + Tailwind CSS  
**原则**：基于现有代码库能力，无需新增后端；元数据中心化 + JIT 多源切片流匹配；本地优先与纯隐私保护；无商业广告。

---

## 0. 总览

| 模块 | 路由 | 优先级 | 一句话定位 |
|------|------|--------|------------|
| 首页 | `/` | P0 | Hero 轮播 + TMDB 官方搜索 + 采集源深度扫描 |
| 片库页 | `/catalog` | P0 | 分频道片库、多维筛选、聚合卡片 |
| 播放页 | `/watch` | P0 | 多源并发测速、自动故障转移、选集、追剧单、离线下载 |
| 历史页 | `/history` | P1 | 观看历史列表、搜索、清空 |
| 登录页 | `/login` | P0 | 账号登录 / 邀请码注册，登录拦截全站受保护页 |
| 设置页 | `/settings` | P1 | 源管理、偏好设置、配置导入导出 |

优先级定义：
- **P0**：核心流程，必须先实现，直接影响观影体验。
- **P1**：重要增强，提升易用性与留存。
- **P2**：未来迭代，本版本暂不纳入（如用户账号体系、云同步、评论弹幕等）。

---

## 1. 首页（`/`）

### 1.1 功能点

| 序号 | 功能点 | 描述 |
|------|--------|------|
| 1.1.1 | Hero 巨幕轮播 | 展示 TMDB 官方 4K 趋势大片，支持点击进入播放页 |
| 1.1.2 | 左图右榜双栏楼层 | 左侧为推荐内容卡片，右侧为热播榜单 |
| 1.1.3 | 官方精准搜索 | 输入关键词，调用 TMDB 官方资料库，返回标准海报、正规剧名、真实评分、年份 |
| 1.1.4 | 底层采集源深度扫描 | 展开后调用多源并发搜索，按源逐条流式返回结果 |
| 1.1.5 | 登录拦截 | 未登录点击播放时跳转 `/login?redirect=`，登录后回跳 |
| 1.1.6 | 源选择与成人过滤 | 用户可在设置页勾选参与搜索的源；成人过滤开启时成人源不参与搜索 |

### 1.2 对应 API / lib 能力

| 能力 | 对应 API / lib | 说明 |
|------|----------------|------|
| 首页状态 | `GET /api/status` | 返回 passwordRequired、verified、defaultSources、defaultRecommendSource 等 |
| 官方搜索 | `src/lib/media-library-service.ts` `fetchTmdbClient` | TMDB 官方影视资料，趋势/搜索 |
| 底层搜索 | `POST /api/search`（流式 `?stream=1`） | 多源并发聚合搜索，NDJSON 逐源推送 |
| 源健康度 | `src/lib/store.ts` `sourceHealth`、`recordSourceHealth` | 连续失败自动停用，阶梯惩罚 |
| 登录状态 | `src/components/auth.tsx` `useAuth` | 登录/验证状态 |
| 登录跳转 | `src/lib/utils.ts` `buildWatchUrl` | 构造播放页 URL |

### 1.3 验收标准

1. 打开首页，Hero 轮播在 3 秒内加载并显示 6 部官方趋势大片。
2. 输入有效关键词，TMDB 官方搜索结果在 2 秒内出现卡片网格。
3. 展开“底层采集源深度扫描”后，各源结果逐条流式出现，坏源不阻塞好源。
4. 未登录用户点击任意卡片播放，跳转 `/login?redirect=/watch?...`，登录成功后回跳播放页。
5. 成人过滤开启时，搜索结果中不包含标记为 `isAdult` 的源结果。

### 1.4 优先级：P0

---

## 2. 片库页（`/catalog`）

### 2.1 功能点

| 序号 | 功能点 | 描述 |
|------|--------|------|
| 2.1.1 | 分频道片库 | 电影 / 电视剧 / 动漫 / 综艺 / 纪录片等频道，每频道独立图标与副标题 |
| 2.1.2 | 多维筛选 | 按地区、类型、年份、排序方式筛选；筛选条件持久化到 URL |
| 2.1.3 | 频道内深度搜索 | 输入关键词，在当前频道全库中搜索；支持“切换为全网聚合直搜” |
| 2.1.4 | 热门搜索词 | 每频道展示高频热词，点击直接搜索 |
| 2.1.5 | 官方片库卡片 | 基于 TMDB/豆瓣官方资料展示高清海报卡片，支持分页 |
| 2.1.6 | 聚合卡片 | 底层采集源聚合结果以聚合卡片形式展示 |
| 2.1.7 | 登录拦截 | 点击卡片播放前校验登录态 |
| 2.1.8 | 分页导航 | 当前页 / 总页数，支持跳页 |

### 2.2 对应 API / lib 能力

| 能力 | 对应 API / lib | 说明 |
|------|----------------|------|
| 官方片库目录 | `GET /api/media/catalog?type=&sort=&showId=` | 海外影视资料目录（Cinemeta/TVMaze） |
| 官方搜索 | `src/lib/media-library-service.ts` `fetchTmdbClient` | TMDB 官方影视资料 |
| 底层搜索 | `POST /api/search` | 多源并发聚合搜索 |
| 片库查询参数 | `src/features/catalog/use-catalog-query.ts` | 频道/地区/类型/年份/排序/分页 |
| 登录状态 | `src/components/auth.tsx` `useAuth` | 登录/验证状态 |

### 2.3 验收标准

1. 切换频道，页面标题、副标题、图标、可用筛选维度随频道变化。
2. 选择地区/类型/年份后，片库卡片列表重新加载并反映筛选条件。
3. 输入关键词并点击“深搜”，显示“正在【频道】全库深度搜索”横幅与结果计数。
4. 分页点击后，URL 更新并保持筛选条件，刷新页签不丢失筛选状态。
5. 未登录用户点击卡片，跳转登录页并携带 redirect 参数。

### 2.4 优先级：P0

---

## 3. 播放页（`/watch`）

### 3.1 功能点

| 序号 | 功能点 | 描述 |
|------|--------|------|
| 3.1.1 | 视频播放 | ArtPlayer + hls.js，支持 HLS / HTTP-FLV，0.5x~3.0x 倍速，键盘快捷键 |
| 3.1.2 | 多源并发测速 | 播放时并发探测多条线路，显示延迟与 QoS 评级，优选最快线路 |
| 3.1.3 | 自动故障转移 | 播放中线路卡顿/切片异常时，毫秒级自动切换备用线路，保留进度 |
| 3.1.4 | 选集 | 剧集列表支持百集分段折叠，点击集数切换 |
| 3.1.5 | 追剧单 | 加入/移出追剧单，更新时首页红点提醒，自动同步最新已知集数 |
| 3.1.6 | 观看进度持久化 | 播放进度、总时长保存在 IndexedDB，下次续播 |
| 3.1.7 | 跨屏接力 | 生成二维码，手机/电视扫码从当前秒数续播 |
| 3.1.8 | 离线下载 | 当前集 MP4 离线下载（基于 m3u8-downloader + mp4-transmuxer） |
| 3.1.9 | 影院宽屏模式 | 收起右侧选集栏，视区扩大 |
| 3.1.10 | 剧集简介 / 演职员 | 官方元数据优先，采集源数据兜底；展示导演、演员、剧情、海报墙 |
| 3.1.11 | 登录拦截 | 未登录进入播放页跳转登录 |

### 3.2 对应 API / lib 能力

| 能力 | 对应 API / lib | 说明 |
|------|----------------|------|
| 视频详情 | `GET /api/detail?id=&source=` | 单源详情，返回剧集列表与播放地址 |
| 官方详情 | `GET /api/media/detail?id=&title=&year=` | 官方高清海报、演职员、剧情 |
| 剧集看点 | `GET /api/media/episode-intro?title=&episode=&type=` | 单集简介、播出日期、时长 |
| 播放代理 | `GET /api/proxy/[url]` | 视频流代理，SSRF 校验 |
| 源测速 | `src/lib/client-api.ts` `api.detailSpeed`、`api.testSource` | 详情接口耗时测速 |
| 播放器 | `src/components/player-shell.tsx` | ArtPlayer + hls.js 播放器壳 |
| 进度管理 | `src/features/watch/use-watch-progress.ts` | IndexedDB 进度持久化、续播 |
| 换源引擎 | `src/features/watch/use-watch-engine.ts` | 多源候选、测速、故障转移、速度建议 |
| 下载 | `src/components/download-manager.tsx` `enqueueDownload` | 离线下载入口 |
| 追剧单 | `src/lib/db.ts` `toggleFavorite`、`markFavoriteSeenEpisodes` | IndexedDB 收藏表 |
| 登录状态 | `src/components/auth.tsx` `useAuth` | 登录/验证状态 |

### 3.3 验收标准

1. 播放页打开后，自动拉取详情并开始播放首集；若当前源无播放地址，显示“立即切换至备用线路”按钮。
2. 多源测速面板显示各源名称、延迟、QoS 等级，点击任意源立即切换并继续播放。
3. 播放中若当前线路异常，自动在 5 秒内切换至下一条高速线路，不中断观看。
4. 切换集数后，URL 参数 `index` 更新，页面不刷新，新集自动加载。
5. 点击“加入追剧单”后，星标变为填充状态；该剧有新集时首页出现红点提醒。
6. 刷新播放页后，视频从上次停留位置续播（误差 < 2 秒）。
7. 点击“跨屏接力”生成二维码，扫码后在另一设备打开对应 URL 从相同时间点续播。
8. 点击“下载本集”进入下载队列，支持 MP4 格式，下载完成后可在下载管理页查看。
9. 未登录用户直接访问 `/watch`，跳转 `/login?redirect=/watch?...`。

### 3.4 优先级：P0

---

## 4. 历史页（`/history`）

### 4.1 功能点

| 序号 | 功能点 | 描述 |
|------|--------|------|
| 4.1.1 | 观看历史列表 | 按时间倒序展示最近观看记录，含海报、标题、集数、进度条、相对时间 |
| 4.1.2 | 历史搜索 | 按标题关键词过滤历史记录 |
| 4.1.3 | 删除单条 | 滑动/点击删除单条记录，支持“撤销” |
| 4.1.4 | 清空历史 | 确认弹窗后清空全部记录，不可撤销 |
| 4.1.5 | 点击续播 | 点击记录直接跳转对应播放页并恢复进度 |

### 4.2 对应 API / lib 能力

| 能力 | 对应 API / lib | 说明 |
|------|----------------|------|
| 历史存储 | `src/lib/db.ts` `db.history`、`upsertHistory`、`removeHistory`、`clearAllHistory` | IndexedDB 本地存储，无后端 |
| 历史条目 | `src/lib/db.ts` `type HistoryEntry` | 包含 title、pic、episodeIndex、totalEpisodes、playbackPosition、duration、timestamp |
| 播放页跳转 | `src/lib/utils.ts` `buildWatchUrl` | 构造播放页 URL |
| 图片模式 | `src/components/smart-image.tsx` `SmartImage` | 封面图加载模式（direct/proxy/custom） |

### 4.3 验收标准

1. 历史页按时间倒序显示最近 50 条记录，超出部分可通过搜索查找。
2. 每条记录显示进度条（观看进度 >10% 且 <95% 时显示百分比）。
3. 搜索关键词后，列表实时过滤匹配标题的记录。
4. 点击“删除”单条记录，出现“已删除”提示并提供 5 秒“撤销”入口，撤销后记录恢复。
5. 点击“清空历史”并确认后，全部记录删除，显示“暂无观看记录”。
6. 点击任意记录，跳转 `/watch?source=...&id=...&index=...` 并从上次进度续播。

### 4.4 优先级：P1

---

## 5. 登录页（`/login`）

### 5.1 功能点

| 序号 | 功能点 | 描述 |
|------|--------|------|
| 5.1.1 | 账号登录 | 输入账号名称 + 密码，登录成功后跳转 redirect 或首页 |
| 5.1.2 | 邀请码注册 | 输入邀请码 + 账号（≥3 字符） + 密码（≥6 字符）+ 确认密码，注册成功并自动登录 |
| 5.1.3 | 登录/注册 Tab 切换 | 两种模式共用同一卡片，切换时清空错误 |
| 5.1.4 | 被顶号/封禁提示 | URL 携带 `kickNotice` 时展示危险提示条 |
| 5.1.5 | 已登录自动跳转 | 已验证用户访问登录页自动跳回首页或 redirect |

### 5.2 对应 API / lib 能力

| 能力 | 对应 API / lib | 说明 |
|------|----------------|------|
| 登录 | `POST /api/auth` (`action=login`) | 返回 success、user、message |
| 注册 | `POST /api/auth` (`action=register`) | 需要 inviteCode |
| 状态查询 | `GET /api/status` | 返回 passwordRequired、verified 等 |
| 环境预置同步 | `src/lib/subscription-sync.ts` `applyEnvPresets` | 登录后同步部署者预置的源与订阅 |
| 认证状态 | `src/components/auth.tsx` `useAuth` | 登录/验证状态与 401 拦截 |

### 5.3 验收标准

1. 未设置 PASSWORD 时，访问任何页提示管理员配置密码。
2. 输入正确账号密码，登录成功后跳转 redirect 参数指定的页或首页。
3. 输入错误密码，显示“登录失败，请检查账号密码”错误条。
4. 注册时邀请码为空、账号<3 字符、密码<6 字符、两次密码不一致，分别给出对应校验提示。
5. 注册成功后自动登录并跳转。
6. 已登录用户访问 `/login`，自动跳回首页。

### 5.4 优先级：P0

---

## 6. 设置页（`/settings`）

### 6.1 功能点

| 序号 | 功能点 | 描述 |
|------|--------|------|
| 6.1.1 | 点播源管理 | 添加/编辑/删除自定义点播源（Apple CMS API 地址），勾选参与搜索的源 |
| 6.1.2 | 数据源订阅 | 添加订阅 URL，一键同步导入点播源与直播源；查看同步状态与失败原因 |
| 6.1.3 | 播放与过滤 | 自动连播开关、成人内容过滤开关、广告过滤开关 |
| 6.1.4 | 封面图加载 | 直连 / 代理 / 自定义代理三种模式，支持自定义代理地址 |
| 6.1.5 | 首页与内容 | 推荐数据源选择（豆瓣/Bangumi/热榜/Top250 等） |
| 6.1.6 | 配置导入导出 | 导出当前配置为 JSON 文件，导入 JSON 恢复配置；支持撤销删除 |
| 6.1.7 | 直播源管理 | 添加/编辑/删除 M3U 直播源，勾选启用、收藏频道、查看最近观看 |

### 6.2 对应 API / lib 能力

| 能力 | 对应 API / lib | 说明 |
|------|----------------|------|
| 全局设置 | `src/lib/store.ts` `useAppStore`（Zustand + localStorage） | 所有设置持久化 |
| 源管理 | `src/features/source-manager/panel-vod.tsx` | 点播源增删改查 |
| 数据源订阅 | `src/features/source-manager/panel-subs.tsx` | 订阅添加、同步、状态 |
| 偏好设置 | `src/features/source-manager/panel-prefs.tsx` | 播放/图片/首页偏好 |
| 配置导入导出 | `src/features/source-manager/panel-io.tsx` | JSON 导入导出 |
| 源探活 | `api.testSource` `POST /api/source/test` | 测试单个点播源可用性 |
| 订阅拉取 | `api.fetchSourceList` `GET /api/source-list` | 拉取并解析订阅 |

### 6.3 验收标准

1. 添加自定义点播源后，源出现在点播源列表并可勾选参与搜索。
2. 添加订阅 URL 并点击同步，订阅下的点播源与直播源批量导入，同步结果显示数量与状态。
3. 开启成人内容过滤后，已勾选的成人源自动取消勾选，搜索中不再出现。
4. 切换封面图加载模式为“代理”，全站封面图走服务端代理，不直接请求上游。
5. 点击“导出配置”下载 JSON 文件；在另一设备导入同一文件，设置与源列表恢复一致。
6. 删除源后出现撤销提示，5 秒内点击撤销可恢复。

### 6.4 优先级：P1

---

## 7. 页面流（路由跳转关系）

```
┌─────────┐     未登录访问受保护页     ┌─────────┐
│  首页   │ ─────────────────────→   │ 登录页   │
│   /     │  (redirect=/watch?...)   │  /login │
└─────────┘                          └────┬─────┘
       │                                 │ 登录/注册成功
       │ 登录后                          │ 回跳 redirect
       ▼                                 ▼
┌─────────┐                       ┌─────────────┐
│ 片库页   │                       │  播放页     │
│ /catalog│                       │   /watch   │
└────┬────┘                       └──────┬──────┘
     │ 点击卡片播放                        │ 设置入口
     ▼                                    ▼
┌─────────────┐                   ┌─────────────┐
│  播放页     │                   │  设置页     │
│   /watch    │                   │  /settings  │
└──────┬──────┘                   └──────┬──────┘
       │ 历史记录入口                         │ 数据导入导出
       ▼                                    ▼
┌─────────────┐                   ┌─────────────┐
│  历史页     │                   │  源管理页   │
│  /history   │                   │ (/settings) │
└─────────────┘                   └─────────────┘
```

**关键跳转规则：**
- 任何未登录状态访问 `/watch`、`/catalog`（点击卡片）时，先跳转 `/login?redirect=<当前完整 URL>`，登录成功后 `window.location.href = redirect`。
- 播放页内“设置”入口跳转 `/settings`；设置页内“返回首页”跳转 `/`。
- 历史记录点击后跳转 `/watch?source=...&id=...&index=...&position=...`，恢复进度。

---

## 8. 字段与 API 对应关系表（关键页面）

### 8.1 首页（`/`）

| 页面字段 | 来源 API / lib | 字段名 | 备注 |
|----------|----------------|--------|------|
| 登录状态 | `GET /api/status` | `verified` | 是否已验证 |
| 预置源 | `GET /api/status` | `defaultSources` | 部署者预置的点播源 |
| 推荐数据源 | `GET /api/status` | `defaultRecommendSource` | 首页推荐默认值 |
| Hero 大片 | `src/lib/media-library-service.ts` `fetchTmdbClient` | `items[]` | TMDB 趋势列表，取前 6 条 |
| 搜索关键词 | URL 参数 | `s` | 输入框值，长度≤100 |
| 官方搜索结果 | `fetchTmdbClient({type:'movie', query})` | `items[]` | 标准海报、剧名、评分、年份 |
| 底层搜索结果 | `POST /api/search?stream=1` | `SourceSearchOutcome.list[]` | 逐源流式，`sourceKey`/`name`/`vodId`/`pic`/`year` |
| 源健康标志 | `store.sourceHealth` | `ok`/`ms`/`timedOut` | 琥珀色区分超时 vs 失败 |

### 8.2 片库页（`/catalog`）

| 页面字段 | 来源 API / lib | 字段名 | 备注 |
|----------|----------------|--------|------|
| 当前频道 | `src/features/catalog/catalog-config.ts` | `CHANNEL_HOT_KEYWORDS` | 电影/电视剧/动漫等 |
| 筛选：地区 | URL 参数 / `useCatalogFilters` | `currentRegion` | 如 中国大陆、美国、日本 |
| 筛选：类型 | URL 参数 | `currentGenre` | 如 剧情、动作、喜剧 |
| 筛选：年份 | URL 参数 | `currentYear` | 如 2024、2023 |
| 筛选：排序 | URL 参数 | `currentSort` | 如 top、latest |
| 分页 | URL 参数 | `currentPage` / `totalPages` | 当前页/总页数 |
| 官方片库 | `GET /api/media/catalog?type=&sort=` | `list[]` | Cinemeta/TVMaze 目录 |
| 搜索关键词 | URL 参数 | `wd` / `catalogKeyword` | 频道内深搜词 |
| 聚合卡片 | `POST /api/search` | `SearchResultItem[]` | `sourceKey`/`vodId`/`name`/`pic`/`year` |

### 8.3 播放页（`/watch`）

| 页面字段 | 来源 API / lib | 字段名 | 备注 |
|----------|----------------|--------|------|
| 视频标题 | URL 参数 / 详情接口 | `title` / `videoInfo.title` | 优先官方元数据 |
| 剧集列表 | `GET /api/detail` | `episodes[]` | 播放地址数组 |
| 当前集索引 | URL 参数 | `index` | 0-based |
| 播放地址 | `episodes[index]` | `url` | HLS / HTTP-FLV |
| 官方海报 | `GET /api/media/detail` | `cover` / `backdrop` | 官方高清图 |
| 演职员 | `GET /api/media/detail` | `actors[]` / `directors[]` | 官方名录 |
| 剧情简介 | `GET /api/media/detail` | `overview` | 官方纯净剧情 |
| 单集看点 | `GET /api/media/episode-intro` | `title`/`desc`/`airdate` | 当前集简介 |
| 源名称 | URL 参数 / store | `sourceKey` / `source.name` | 当前播放源 |
| QoS 等级 | `src/lib/source-circuit-breaker.ts` | `getSourceQoSBadge` | 等级/标签 |
| 测速延迟 | `use-watch-engine.ts` | `c[].ms` | 每条线路延迟 ms |
| 追剧单状态 | `src/lib/db.ts` `db.favorites` | `favoriteIdOf(title)` | 是否已收藏 |
| 播放进度 | `src/lib/db.ts` `db.history` | `playbackPosition` / `duration` | IndexedDB 持久化 |

### 8.4 历史页（`/history`）

| 页面字段 | 来源 API / lib | 字段名 | 备注 |
|----------|----------------|--------|------|
| 历史记录 | `src/lib/db.ts` `db.history` | `HistoryEntry[]` | `title`/`pic`/`episodeIndex`/`totalEpisodes`/`playbackPosition`/`duration`/`timestamp` |
| 进度百分比 | 计算得出 | `playbackPosition / duration * 100` | 仅 10%~95% 显示 |
| 相对时间 | `src/lib/utils.ts` `formatRelativeTime` | `timestamp` | 如“3 小时前” |
| 播放页跳转 | `src/lib/utils.ts` `buildWatchUrl` | `sourceKey`/`vodId`/`index`/`title` | 构造 `/watch` URL |

### 8.5 登录页（`/login`）

| 页面字段 | 来源 API / lib | 字段名 | 备注 |
|----------|----------------|--------|------|
| 登录模式 | 本地状态 | `mode` | `login` / `register` |
| 账号 | 表单输入 | `username` | ≥3 字符 |
| 密码 | 表单输入 | `password` | ≥6 字符 |
| 邀请码 | 表单输入 / URL 参数 | `inviteCode` / `invite` | 注册必填 |
| 登录接口 | `POST /api/auth` | `action=login` | 返回 `success`/`user` |
| 注册接口 | `POST /api/auth` | `action=register` | 需 `inviteCode` |
| 跳转目标 | URL 参数 | `redirect` | 登录后回跳 URL |
| 被顶号提示 | URL 参数 | `kickNotice` | 危险提示条文案 |

### 8.6 设置页（`/settings`）

| 页面字段 | 来源 API / lib | 字段名 | 备注 |
|----------|----------------|--------|------|
| 自定义点播源 | `store.customAPIs` | `SourceConfig[]` | `key`/`name`/`url`/`isAdult`/`timeoutMs` |
| 选中源 | `store.selectedKeys` | `string[]` | 参与搜索的源 key 列表 |
| 成人过滤 | `store.yellowFilter` | `boolean` | 开启后成人源不参与搜索 |
| 自动连播 | `store.autoplayNext` | `boolean` | 播放结束自动下一集 |
| 封面图模式 | `store.imageProxyMode` | `'direct'\|'proxy'\|'custom'` | 图片加载方式 |
| 推荐数据源 | `store.recommendSource` | `'douban'\|'banguni'...` | 首页推荐来源 |
| 订阅列表 | `store.subscriptions` | `SourceSubscription[]` | `url`/`name`/`lastSync`/`lastStatus` |
| 订阅同步 | `GET /api/source-list?url=` | `SourceListPayload` | `sources[]`/`liveSources[]`/`stats` |
| 源探活 | `POST /api/source/test` | `{url}` | 返回 `ok`/`ms`/`count`/`error` |
| 配置导出 | `store.partialize` | JSON | 可持久化字段子集 |
| 配置导入 | `src/lib/db.ts` `importConfig` | JSON | 合并或覆盖当前配置 |

---

## 9. 需求范围外（P2 / 未来迭代）

以下功能当前代码库无直接后端支持或超出本阶段范围，暂不纳入：
- 用户个人资料编辑（头像、昵称、邮箱）
- 云端同步（登录后将本地历史/收藏/设置同步至服务器）
- 评论、弹幕、评分
- 订阅剧集更新推送（WebSocket / 推送通知）
- 付费会员与支付
- 管理后台页面（当前 admin 能力仅通过 API 提供，无前端页面）

---

## 10. 交付里程碑（预计）

| 阶段 | 交付物 | 负责 | 预计时间 |
|------|--------|------|----------|
| 需求评估 | PRD 草稿（本文档） | Product Manager | 已完成 |
| 原型输出 | 关键页面原型说明 | Product Manager | 本文档后续章节 |
| UI 设计 | 设计稿（Figma/图片） | UI Designer | PRD 确认后 |
| 全栈开发 | 页面与组件代码 | Fullstack Engineer | 设计稿确认后 |
| 测试验证 | 测试用例与缺陷修复 | Test Engineer | 开发完成后 |

---

下一章节为关键页面原型说明，将作为独立文件交付给 UI 设计师。
