# LibreTV / cl.tv 技术选型与架构说明

**产品**：LibreTV（cl.tv）视频聚合播放平台  
**版本**：v1.1（MVP 阶段 1：核心观影流程）  
**编制**：全栈开发者（fullstack-developer）  
**依据**：`team-deliverables/pm/prd.md`、`team-deliverables/pm/roadmap.md`、`team-deliverables/pm/user-stories.md`、`team-deliverables/design/*`、`DEVELOPMENT.md`  
**生效日期**：2026-11-04  
**状态**：草稿，待 Lead 确认后冻结

---

## 1. 技术选型总览

| 层级 | 选型 | 版本 | 理由 |
|------|------|------|------|
| 前端框架 | Next.js (App Router) | 15.1 | React Server Components + 服务端 API 路由，轻量、SEO 友好、部署简单（Vercel/Render 一键部署） |
| 前端语言 | TypeScript | 5.7 | 全链路类型安全，减少运行时缺陷 |
| 样式方案 | Tailwind CSS | 3.4 | 语义化设计 Token（`tailwind.config.ts`）、暗色主题优先、原子类加速 UI 迭代 |
| 状态管理 | Zustand | 5.0 | 轻量全局 store（登录态、源配置、图片模式等），持久化到 localStorage |
| 服务端状态 | TanStack Query (React Query) | 5.59 | 搜索/详情/推荐数据缓存、`staleTime` 控制、流式搜索 NDJSON 消费 |
| 路由 | Next.js App Router | 15.1 | 基于文件系统的路由，`/`、`/catalog`、`/watch`、`/history`、`/login`、`/settings` |
| 播放器 | ArtPlayer + hls.js | 5.2 / 1.5 | 支持 HLS / HTTP-FLV、倍速 0.5x~3.0x、键盘快捷键、影院宽屏模式 |
| 本地数据库 | Dexie (IndexedDB 封装) | 4.0 | 搜索历史、观看历史、播放进度、追剧单/收藏 100% 本地存储，无云同步 |
| 二维码 | 内置轻量实现 | — | 跨屏接力二维码生成（播放页） |
| 构建工具 | Next.js 内建 (SWC/Turbopack) | — | 零配置构建，生产产物优化 |
| 代码检查 | ESLint | 9.39 | `eslint-config-next`，CI 门禁 |
| 类型检查 | TypeScript `tsc --noEmit` | 5.7 | `npm run typecheck` |
| 单元测试 | Vitest | 2.1 | `src/lib/` 核心模块单测，单 fork 模式避免 OOM |
| E2E 测试 | Playwright | 1.64 | `e2e/` 关键业务流程端到端测试 |
| 包管理 | npm | >=10 | `npm ci` 锁定依赖，`package-lock.json` 提交 |
| 运行时 | Node.js | 22 | `.nvmrc`、`package.json engines` 与 Docker/CI 一致 |
| 部署平台 | Render / Vercel（无服务器/边缘） | — | 轻量栈，零运维，持续部署监听 Master 分支 |

**后端**：无需新增后端。全部复用现有 Next.js 服务端 API 路由（`src/app/api/*`），基于 Node.js 运行时。

**数据库**：前端本地 IndexedDB（Dexie）；服务端仅用于会话/源配置，无业务关系型数据库，运维负担最低。

---

## 2. 架构概览

### 2.1 整体分层（双层解耦，参考 PRD §1.2 与 DEVELOPMENT.md §三）

```
┌─────────────────────────────────────────────────────────────┐
│ 客户端 UI (Next.js 15 App Router / React 客户端组件)          │
└──────────────────┬──────────────────────────────────────────┘
                   │ 海报/评分/分集剧情 / 播放直链/换源重试
┌──────────────────▼──────────────────────────────────────────┐
│ 1. 门面元数据层 (Facade) — TMDB / 豆瓣 / Bangumi / Cinemeta / TVMaze │
│    负责片名、海报、评分、演职员表、单集剧情、更新状态          │
└──────────────────┬──────────────────────────────────────────┘
                   │ 播放直链/换源重试
┌──────────────────▼──────────────────────────────────────────┐
│ 2. 播放解析层 (Playback) — AppleCMS 采集站 / TVBox 聚合源 / IPTV │
│    负责采集站解析、TVBox 规则源、直播流提取，最优线路测速     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 前端目录结构（MVP 交付）

```
team-deliverables/dev/
├── package.json               # Node 22, npm >=10, scripts: dev/build/start/lint/typecheck/test/check
├── tsconfig.json
├── tailwind.config.ts         # 语义化设计 Token (bg-page/surface/card/chip/line/content/muted/faint/accent/...)
├── postcss.config.mjs
├── next.config.ts
├── .env.example               # 环境变量模板 (PASSWORD, DEFAULT_SOURCES, DEFAULT_IMAGE_MODE, ...)
├── .nvmrc                     # node 22
├── src/
│   ├── app/
│   │   ├── layout.tsx         # 根布局、主题先行脚本、Providers
│   │   ├── globals.css        # CSS 变量 (--c-page/--c-surface/...)、字体、重置
│   │   ├── page.tsx           # 首页 / (Hero 轮播 + 官方搜索 + 底层源扫描 + 图片优化)
│   │   ├── catalog/           # 片库页 (频道切换、多维筛选、分页)
│   │   ├── watch/             # 播放页 (ArtPlayer + hls.js、测速、故障转移、选集、追剧单)
│   │   ├── history/           # 历史页 (列表、搜索、删除、清空、续播)
│   │   ├── login/             # 登录页 (登录/注册 Tab、邀请码、拦截回跳)
│   │   ├── settings/          # 设置页 (源管理、偏好、封面图模式、配置导入导出)
│   │   └── api/               # Next.js 服务端 API 路由 (status/auth/search/detail/media/...)
│   ├── components/
│   │   ├── ui/                # Button/Input/Spinner/Badge/Checkbox/Switch/Select/Tabs/Avatar
│   │   ├── feedback/          # Toast/ConfirmDialog/EmptyState/Alert
│   │   ├── media/             # SmartImage/CatalogSkeleton/VideoPlayer/QRCode
│   │   ├── layout/            # Header/SiteFooter/HeroCarousel/MediaCard/AggregatedCard
│   │   ├── catalog/           # ChannelSwitcher/FilterPanel/mobile-filter-sheet
│   │   ├── watch/             # EpisodeList/SourceBar/SwitchSourceModal/QrHandoffModal/SpeedSuggestionDialog/WatchFallbackState
│   │   ├── auth/              # LoginForm/useAuth
│   │   ├── settings/          # SourceListPanel/SubscriptionPanel/PreferencePanel/ConfigIoPanel
│   │   └── shared/            # mobile-bottom-bar/toast/theme/states
│   ├── lib/
│   │   ├── store.ts           # Zustand 全局设置 (useAppStore)
│   │   ├── client-api.ts      # 客户端 API 封装 (api.status/login/register/search/detail/...)
│   │   ├── types.ts           # TS 类型定义 (SourceConfig/SearchResultItem/VideoDetail/...)
│   │   ├── utils.ts           # cn()/buildWatchUrl/validateSourceUrl 等
│   │   ├── db.ts              # Dexie IndexedDB 实例 (history/favorites)
│   │   ├── ssrf.ts            # checkUpstreamAllowed (安全红线：内网地址阻断)
│   │   ├── api-guard.ts       # 服务端 API 统一守卫
│   │   ├── fetch-utils.ts     # fetchUpstream/getCache/setCache (缓存与超时)
│   │   ├── i18n.ts            # 中文国际化文案
│   │   ├── url-obfuscator.ts  # encodeUrlToken/decodeUrlToken
│   │   └── *.test.ts          # 核心模块单元测试
│   └── features/
│       ├── catalog/           # useCatalogFilters
│       ├── player/            # hls-loader/playback-recovery
│       ├── source-manager/    # 源增删改与订阅同步
│       └── watch/             # use-watch-progress (IndexedDB 断点续播)
├── e2e/
│   └── image-optim.spec.ts    # 首页图片优化 E2E 测试 (Playwright)
└── public/                    # 静态资源 (favicon/icons/manifest)
```

### 2.3 数据流向

1. **首页浏览**：客户端 → `GET /api/status` (站点状态与预置源) → `fetchTmdbClient` (TMDB 趋势大片) → `SmartImage` (海报直连/代理，骨架屏 + 懒加载)。
2. **搜索**：客户端 → `POST /api/search?stream=1` (NDJSON 流式，多源并发，坏源隔离) → 聚合卡片展示。
3. **播放**：客户端 → `GET /api/detail?id=&source=` (取 `episodes[]` 播放地址数组) → ArtPlayer + hls.js 播放；多源并发测速 → 自动故障转移。
4. **本地数据**：搜索历史/观看历史/播放进度/追剧单 → Dexie IndexedDB，页面刷新不丢失，无云端同步。
5. **鉴权**：`POST /api/auth` 签发 httpOnly Session Cookie → 客户端 `useAuth` 校验 `verified` → 401 时触发 `libretv:unauthorized` 全局事件，跳转 `/login?redirect=`。

### 2.4 多源并发测速与断路器优选架构 (R2 Architecture)

```
┌────────────────────────────────────────────────────────────┐
│ 播放页调度器 (use-watch-engine / StreamSourceMatcher)       │
└─────────────────────────────┬──────────────────────────────┘
                              │ 1. 触发并发测速 (Promise.allSettled)
                              ▼
┌────────────────────────────────────────────────────────────┐
│ 断路器健康门禁 (canProbeSource / source-circuit-breaker)    │
│   · 熔断态 (Open, 3次连败冷却3min) -> 跳过探测，防连接池耗尽 │
│   · 正常/半开 (Closed/Half-Open)   -> 允许发起探测          │
└─────────────────────────────┬──────────────────────────────┘
                              │ 2. 单源硬超时截断 (3000ms Timeout)
                              ▼
┌────────────────────────────────────────────────────────────┐
│ 客户端测速探针 (api.detailSpeed, AbortController 组合信号)  │
└─────────────────────────────┬──────────────────────────────┘
                              │ 3. 结果回调与动态指标收敛
                              ▼
┌────────────────────────────────────────────────────────────┐
│ 动态 QoS 评分引擎 (EWMA 移动平均时延 + 成功率惩罚模型)      │
│   · 极速 (S/绿, <500ms)    · 良好 (A/绿, 500-1000ms)       │
│   · 一般 (B/琥珀, 1-1.5s)  · 受阻 (C/红, 熔断或>1.5s)      │
└────────────────────────────────────────────────────────────┘
```

---

## 3. 核心技术决策

| 决策点 | 方案 | 依据 |
|--------|------|------|
| **前端渲染** | Next.js App Router + 客户端组件 (`'use client'`) | 播放器、轮播、搜索需交互，客户端组件更合适；页头与页脚可服务端渲染 |
| **状态持久化** | Zustand + localStorage (全局设置) + Dexie IndexedDB (历史/收藏/进度) | PRD 本地优先、纯隐私保护，无云同步 |
| **图片策略** | `SmartImage` 默认 `direct` 直连，仅遇防盗链 (403/418) 时按配置降级 `proxy`/`custom`；骨架屏 + 懒加载 + 兜底占位 | PRD-IMAGE-OPT.md P0：LCP ≤ 3s，CLS ≈ 0，失败率 ≤ 1%，禁止无脑代理图片 |
| **搜索流式** | `POST /api/search?stream=1` NDJSON，逐源回调，坏源不阻塞好源 | PRD §4.1.4 底层采集源深度扫描 |
| **鉴权模式** | 站点访问密码 (PASSWORD)，httpOnly Session Cookie，无个人资料/昵称/头像/邮箱 | PRD §7.2 用户账号边界 |
| **SSRF 防护** | 所有服务端外部请求经 `checkUpstreamAllowed` 校验，阻断 `127.0.0.1`、`10.0.0.0/8`、`192.168.0.0/16`、`172.16.0.0/12` | DEVELOPMENT.md §三 服务端安全防线，安全红线 |
| **图片代理白名单** | 未登录仅放行白名单图片域 (豆瓣/bgm.tv/qhimg.com/bdstatic.com)；已登录受 SSRF 防护 | PRD §7.1 图片代理限制 |
| **缓存策略** | 服务端 `getCache/setCache` (内存，90s 搜索/60s 详情) + TanStack Query `staleTime` | DEVELOPMENT.md §五 接口缓存 |
| **分支与 CI** | `feature/*`/`fix/*`/`hotfix/*`/`docs/*` 分支 + PR，CI 四门禁 (typecheck/lint/test/build)，严禁直接 Push Master | DEVELOPMENT.md §一 Git 工作流 |

---

## 4. 环境变量

| 变量 | 说明 | 示例 | 是否必填 |
|------|------|------|----------|
| `PASSWORD` | 站点访问密码，未设置时提示管理员配置 | `changeme` | 是 |
| `DEFAULT_SOURCES` | 部署者预置点播源 JSON | `[{"key":"...","name":"...","url":"..."}]` | 否 |
| `DEFAULT_IMAGE_MODE` | 默认封面图加载方式 `direct\|proxy\|null` | `direct` | 否 |
| `DEFAULT_RECOMMEND_SOURCE` | 默认首页推荐数据源 | `douban` | 否 |
| `SEARCH_SOURCE_TIMEOUT_MS` | 单源搜索超时 (ms) | `6000` | 否 |
| `COOKIE_SECURE` | Session Cookie Secure 标志 | `true` | 否 |
| `APP_VERSION` | 站点版本号 | `2.16.12` | 否 |

新增环境变量须同步 `.env.example`、`README.md` 环境变量表、`docker-compose.yml`（DEVELOPMENT.md §六.4）。

---

## 5. 质量门禁

提交前必须运行 `npm run check`（依次执行）：

1. `npm run typecheck` — `tsc --noEmit`，类型检查必须无错误
2. `npm run lint` — `eslint src`
3. `npm test` — `vitest run`，单 fork 模式，所有测试必须通过，不允许 `.skip`
4. `npm run build` — `next build` 生产构建

CI 对 PR 分支并行运行以上四个 job，全部通过后才允许自动合并到 Master。

---

## 6. 部署方式

- **开发**：`npm run dev`，监听 `http://localhost:8080`
- **生产构建**：`npm run build`，输出 `.next`
- **生产启动**：`npm run start -p 8080`
- **部署平台**：Render（推荐，持续部署监听 Master）或 Vercel（零配置 Next.js）
- **Docker**：提供 `Dockerfile` 与 `docker-compose.yml`，可自建内网部署

---

## 7. 安全红线（不可违反）

1. **Master 分支红线**：严禁直接 Push 到 Master，必须通过 PR 与 CI 门禁。
2. **SSRF 红线**：所有服务端外部请求必须经过 `checkUpstreamAllowed` 校验，严禁请求内网私有地址。
3. **无新增后端**：MVP 基于现有 API/lib 能力，无需新增后端接口。
4. **无商业广告**：全站不插入插屏、贴片广告、弹窗广告。
5. **本地优先**：搜索历史、收藏、播放进度、设置均存储在浏览器本地，无云端同步。

---

## 8. 后续演进（非 MVP）

- 离线下载 (MP4)、速度建议弹窗、配置导入导出、直播源管理（Could 优先级，阶段 4）
- 如需云同步、评论弹幕、付费会员，另立后端服务，与当前轻量栈解耦
