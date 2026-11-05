# LibreTV / cl.tv 首页图片加载优化 — PRD 补充需求单

**版本**：v1.0（补充需求单，附属于主 PRD.md）  
**产品**：LibreTV（cl.tv）视频聚合播放平台  
**问题站点**：https://cl-libretv.onrender.com/  
**核心问题**：首页图片加载慢，导致首屏 LCP 长、海报空白、加载失败率高，影响留存与播放转化  
**已有能力（无需新增后端）**：`SmartImage` 候选链降级、`/api/proxy?url=` 图片代理、`env-image-mode` 部署者默认模式、`store` 用户图片模式设置

---

## 1. 任务背景与目标

Lead 原因分析结论：首页图片加载慢主要由以下因素导致：
1. 第三方图片源直连，跨国延迟高；
2. 未启用站点图片代理（所有图片直连上游）；
3. 无首屏预加载与懒加载区分（首屏外图片可能提前并发下载，首屏图片未优先加载）；
4. 无骨架屏兜底（图片加载期间海报位显示空白）；
5. 图片尺寸未自适应（布局抖动 CLS，海报位高宽不固定）；
6. Render 实例网络限制（上游请求慢）。

**优化目标**：在不新增后端的前提下，利用现有 `SmartImage`、`/api/proxy`、图片模式设置等能力，对首页图片加载进行分层优化，提升首屏体验与播放转化。

---

## 2. 业务影响评估

| 维度 | 当前问题 | 预期优化影响 |
|------|----------|--------------|
| 首屏体验（LCP） | Hero 轮播图片与首屏卡片海报加载慢，用户进入站点后长时间看到空白占位 | 首屏 LCP 图片 ≤ 3s，首屏内容快速可见，降低跳出率 |
| 内容感知 | 海报是影视内容的主要识别信息，图片缺失或延迟导致用户无法快速判断内容 | 海报位 100% 有骨架屏兜底，加载失败有兜底占位，内容感知完整 |
| 播放转化 | 用户需先看到海报并产生点击意愿才会进入播放页；图片慢会直接减少点击 | 首屏图片快速呈现，提升卡片点击率与播放页转化 |
| 移动端留存 | 移动端网络更不稳定，图片直连跨国延迟更明显 | 启用图片代理 + 懒加载，减少移动端首屏流量与等待时间 |
| 布局稳定性（CLS） | 图片尺寸未固定，加载后页面抖动 | 海报位固定 aspect-ratio，消除图片加载引起的布局抖动 |

**量化目标（P0 验收）：**
- 首屏 LCP 图片加载时间 ≤ 3s（4G/WiFi 下）
- 图片加载失败率 ≤ 1%（所有候选链耗尽后展示兜底占位，不展示破损图标）
- 骨架屏覆盖所有首屏海报位（Hero 轮播 + 首屏卡片网格）

---

## 3. 优化模块与优先级

| 优先级 | 模块 | 描述 | 涉及页面 |
|--------|------|------|----------|
| **P0** | 3.1 Hero 轮播图片优化 | 首屏 Hero 当前可见图片使用 `loading='eager'` 立即加载；预加载下一张轮播图；骨架屏兜底；固定尺寸 | 首页 `/` |
| **P0** | 3.2 首屏卡片图片优化 | 首屏可见卡片海报使用 `loading='eager'`；骨架屏兜底；图片代理模式遵循用户/部署者设置 | 首页 `/` |
| **P1** | 3.3 非首屏卡片懒加载 | 非首屏图片使用 `loading='lazy'` + `IntersectionObserver`（rootMargin 200px），仅在进入视口附近时加载，避免首屏外并发下载抢占带宽 | 首页 `/`、片库页 `/catalog` |
| **P2** | 3.4 图片预加载与 DNS 预解析 | Hero 当前轮播图使用 `<link rel=preload>`；对常用图片域（doubanio.com、bgm.tv 等）配置 `dns-prefetch` / `preconnect` | 全站首页 |
| **P2** | 3.5 图片尺寸自适应与格式 | 海报位固定 aspect-ratio（2:3 / 16:9）；根据视口与 DPR 输出适配尺寸（srcset / sizes）；优先 WebP/AVIF | 全站图片 |

---

## 4. 每个模块验收标准

### 4.1 P0：Hero 轮播图片优化（3.1）

1. 首屏 Hero 当前可见轮播图在页面加载后 **≤ 3s** 完成渲染（LCP 指标）。
2. Hero 当前图片使用 `loading='eager'`，不延迟到视口进入或 JS 执行后才加载。
3. Hero 轮播切换时，下一张图片预加载，切换无空白闪烁。
4. 图片加载期间，Hero 位置显示骨架屏占位（非纯空白）。
5. 图片所有候选链耗尽（加载失败）时，显示兜底占位图 + 抖动提示（`FAILED_SHAKE_CLASS`），不展示破损图标。

### 4.2 P0：首屏卡片图片优化（3.2）

1. 首屏可见卡片网格中的海报使用 `loading='eager'`，优先加载。
2. 每个卡片海报位在图片加载前显示骨架屏（`bg-slate-800/20` 或脉冲动画占位）。
3. 图片加载完成后，以 `opacity-0 → opacity-100` 平滑淡入（`duration-300`），避免突兀出现。
4. 图片加载失败率 ≤ 1%；失败后展示兜底占位，且不影响卡片点击进入播放页。
5. 图片加载方式遵循用户设置（`store.imageProxyMode`）与部署者默认值（`/api/status` `defaultImageMode`）：direct / proxy / custom。

### 4.3 P1：非首屏卡片懒加载（3.3）

1. 非首屏图片使用 `loading='lazy'`，仅在进入视口附近 200px 时设置 `src`。
2. 快速滚动页面时，不触发首屏外大量图片并发下载，不抢占首屏图片带宽。
3. 图片进入视口后加载，期间保持骨架屏占位。

### 4.4 P2：图片预加载与 DNS 预解析（3.4）

1. Hero 当前轮播图在 `<head>` 中使用 `<link rel="preload" as="image">` 预加载。
2. 常用图片源域（如 `doubanio.com`、`bgm.tv`、`qhimg.com`、`bdstatic.com`）配置 `dns-prefetch` / `preconnect`，降低首次连接握手延迟。
3. 图片代理请求走 `/api/proxy?url=`，图片响应命中 `Cache-Control: public, max-age=2592000`（30天缓存）。

### 4.5 P2：图片尺寸自适应与格式（3.5）

1. 所有海报位固定 `aspect-ratio`（如 2:3 电影海报、16:9 剧集海报），图片加载前后布局不抖动（CLS ≈ 0）。
2. 根据视口宽度与设备像素比输出适配图片尺寸（`srcset` / `sizes`），避免在小屏幕下加载过大图片。
3. 优先请求 WebP / AVIF 格式，上游不支持时自动降级。

---

## 5. 字段与 API 对应关系表

### 5.1 涉及核心模块

| 模块 | 文件路径 | 职责（与本优化相关） |
|------|----------|---------------------|
| SmartImage 组件 | `src/components/smart-image.tsx` | 封面图加载组件，支持候选链降级、lazy/eager、IntersectionObserver、加载失败抖动、onExhausted 回调 |
| 图片候选链构建 | `src/lib/utils.ts` `buildImageCandidates` | 根据 `mode`/`customProxy` 生成图片候选地址链（直连 / 代理 / 自定义代理） |
| 图片模式默认值 | `src/lib/env-image-mode.ts` `getEnvImageMode()` | 读取 `DEFAULT_IMAGE_MODE` env，返回 `direct` | `proxy` | `undefined` |
| 图片代理接口 | `src/lib/proxy-handlers.ts` `handleProxyRequest` | `/api/proxy?url=` 代理图片请求；未登录仅放行白名单图片域（豆瓣、bgm.tv、qhimg.com、bdstatic.com）；已登录受 SSRF 防护；图片响应 `Cache-Control: public, max-age=2592000` |
| 全局设置存储 | `src/lib/store.ts` `useAppStore` | `imageProxyMode`（'direct' | 'proxy' | 'custom'）、`customImageProxy`、`imageProxyModeTouched`、`updateSettings` |
| 部署者默认模式 | `src/lib/types.ts` `AuthStatusResponse` | `defaultImageMode`：部署者通过 `DEFAULT_IMAGE_MODE` 下发的默认图片加载方式 |
| API 状态 | `GET /api/status` | 返回 `defaultImageMode`、`verified`（决定代理是否需登录） |

### 5.2 字段与 API 对应（首页图片优化）

| UI 字段 / 行为 | 来源 | 字段名 | 说明 |
|----------------|------|--------|------|
| 图片加载方式 | `store.imageProxyMode` / `getEnvImageMode()` / `/api/status` `defaultImageMode` | `'direct' \| 'proxy' \| 'custom'` | 决定图片是直连上游还是走 `/api/proxy` 代理 |
| 自定义代理地址 | `store.customImageProxy` | `string` | 用户在设置页手填的代理模板，mode 为 custom 时生效 |
| 加载策略 | `SmartImage` `loading` | `'eager' \| 'lazy'` | 首屏图片用 eager，非首屏用 lazy |
| 候选链索引 | `SmartImage` `idx`（内部状态） | `number` | 加载失败时递增，尝试下一个候选地址 |
| 全部失败回调 | `SmartImage` `onExhausted` | `() => void` | 所有候选链耗尽后触发，调用方切换兜底占位 UI |
| 骨架屏占位 | `SmartImage` 渲染逻辑 | `!shouldLoad` / `allFailed` | 加载前显示 `bg-slate-800/20` 占位；全部失败显示抖动提示占位 |
| 图片代理 API | `GET /api/proxy?url=<encoded>` | `proxy-handlers.ts` | 未登录仅放行 `isAnonymousImageHost` 白名单域；已登录受 SSRF 防护；图片 30 天缓存 |
| 部署者默认模式 | `GET /api/status` | `defaultImageMode` | 未配置时返回 `null`，前端沿用内置默认 `direct` |

---

## 6. 给 UI 设计师的原型/设计要点

### 6.1 骨架屏（所有海报位必填）
- 加载中状态：海报位显示灰色占位（`bg-slate-800/20` 或脉冲动画 `animate-pulse`），固定 `aspect-ratio`，不留空白。
- Hero 轮播：当前轮播位在图片加载前显示骨架屏，切换轮播时保持占位，避免闪烁。

### 6.2 加载失败兜底
- 所有候选链耗尽后：显示“封面加载失败”占位图，带轻微抖动提示（`FAILED_SHAKE_CLASS`），`aria-label` 说明失败原因。
- 失败占位不应影响卡片点击进入播放页的交互。

### 6.3 渐进显示
- 图片加载完成后：`opacity-0 → opacity-100` 平滑淡入（`duration-300 ease-out`），避免图片突兀弹出。

### 6.4 尺寸与布局稳定性
- 所有海报卡片固定 `aspect-ratio`（电影 2:3、剧集 16:9 等），图片加载前后布局不抖动（CLS ≈ 0）。
- 移动端与桌面端海报尺寸自适应，但比例保持一致。

### 6.5 图片代理模式设置（设置页已有）
- 设置页「封面图加载」：直连 / 代理 / 自定义代理三选一；首页图片加载遵循该设置。

---

## 7. 交付确认清单（设计稿验收）

- [ ] 首屏 Hero 轮播当前图片 eager 加载 + 骨架屏兜底
- [ ] 首屏卡片网格海报 eager 加载 + 骨架屏兜底 + 平滑淡入
- [ ] 非首屏卡片懒加载（loading='lazy' + IntersectionObserver 200px）
- [ ] 图片加载失败兜底占位 + 抖动提示（所有候选链耗尽）
- [ ] 图片代理模式切换（direct/proxy/custom）在首页生效，遵循用户设置
- [ ] 海报位固定 aspect-ratio，图片加载前后无布局抖动（CLS ≈ 0）
- [ ] Hero 预加载下一张轮播图（P2）
- [ ] DNS 预解析 / preload（P2，可后续）

如有字段或交互细节需要补充，请随时告知。设计稿出稿后，我将按上述清单进行验收。

抄送：@lead
