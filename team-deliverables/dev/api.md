# LibreTV / cl.tv API 接口文档

**产品**：LibreTV（cl.tv）视频聚合播放平台  
**版本**：v1.1（MVP 阶段 1：核心观影流程）  
**编制**：全栈开发者（fullstack-developer）  
**依据**：`team-deliverables/pm/prd.md` §6.5、实际源码 `src/app/api/*/route.ts`、`src/lib/client-api.ts`  
**生效日期**：2026-11-04  
**状态**：草稿，待 Lead 确认后冻结  
**供 QA 测试与开发自测使用**

---

## 1. 基础信息

| 项 | 说明 |
|------|------|
| 协议 | HTTP/1.1，JSON |
| 基地址 | 开发：`http://localhost:8080`；生产：部署域名 |
| 前缀 | 所有接口统一以 `/api/` 开头 |
| 认证 | 站点访问密码（PASSWORD），登录后签发 httpOnly Session Cookie；401 时前端触发 `libretv:unauthorized` 全局事件并跳转 `/login?redirect=` |
| 响应格式 | 成功返回 JSON 数据；失败返回 `{ error: string }` 并携带对应 HTTP 状态码 |
| 速率限制 | `/api/auth` 登录/注册按 IP 做速率限制（失败 10 分钟后再试，HTTP 429） |
| 安全 | 所有服务端外部请求须经过 `checkUpstreamAllowed` SSRF 校验，阻断 `127.0.0.1`、`10.0.0.0/8`、`192.168.0.0/16`、`172.16.0.0/12` |

---

## 2. 错误码与 HTTP 状态

| HTTP 状态 | 含义 | 典型场景 |
|-----------|------|----------|
| 200 | 成功 | 正常返回数据 |
| 400 | 请求参数错误 | 缺少必填参数、参数格式非法 |
| 401 | 未授权 | 未登录或会话过期，需跳转登录页 |
| 403 | 禁止访问 | SSRF 校验未通过（如订阅地址为内网） |
| 404 | 资源不存在 | 影视资料未找到 |
| 429 | 请求过于频繁 | 登录/注册失败次数过多，10 分钟后重试 |
| 502 | 上游错误 | 第三方源/采集站请求失败或返回非法数据 |
| 503 | 服务器未配置 | 未设置 PASSWORD，需管理员配置 |

前端 `ApiError` 类携带 `status` 字段，401/503 会自动分发全局事件打开登录框。

---

## 3. 接口详情

### 3.1 站点状态 — `GET /api/status`

返回当前会话有效性、用户信息、预置源与部署者默认配置。

**请求参数**：无  
**认证**：无（基于 Cookie 会话）

**响应示例**：
```json
{
  "passwordRequired": true,
  "verified": true,
  "user": { "username": "admin", "role": "admin" },
  "kickReason": null,
  "kickMessage": null,
  "version": "2.16.12",
  "defaultSources": [
    { "key": "example", "name": "示例源", "url": "https://example.com/api.php/provide/vod" }
  ],
  "defaultLiveSources": [],
  "defaultSubscriptions": [],
  "defaultRecommendSource": "douban",
  "defaultImageMode": "direct"
}
```

**关键字段**：
| 字段 | 类型 | 说明 |
|------|------|------|
| `passwordRequired` | boolean | 服务器是否配置了 PASSWORD |
| `verified` | boolean | 当前会话是否已验证 |
| `user` | object\|null | 当前登录用户 `{ username, role }` |
| `defaultSources` | SourceConfig[] | 部署者预置的点播源 |
| `defaultImageMode` | 'direct'\|'proxy'\|null | 部署者默认封面图加载方式 |
| `defaultRecommendSource` | string\|null | 默认首页推荐数据源 |

---

### 3.2 登录 / 注册 — `POST /api/auth`

**请求体**：
```json
{
  "action": "login" | "register",
  "username": "string (≥3 字符，注册必填)",
  "password": "string (≥6 字符)",
  "inviteCode": "string（注册必填，登录时可选）"
}
```

**登录**：`action=login`，可不传 `username` 时默认尝试 `admin` 账号。  
**注册**：`action=register`，需 `inviteCode`，成功后自动登录并设置 Session Cookie。

**响应示例（成功）**：
```json
{
  "success": true,
  "user": { "username": "admin", "role": "admin" },
  "message": "登录成功"
}
```

**响应示例（失败）**：
```json
{
  "success": false,
  "error": "用户名或密码错误",
  "field": "password"
}
```

**HTTP 状态**：200 成功；400 注册校验失败；401 登录失败；429 请求过于频繁。

**客户端调用**：`api.login({ username, password })` / `api.register({ username, password, inviteCode })`。

---

### 3.3 会话查询 — `GET /api/auth`

查询当前会话状态（支持顶号检测）。

**响应示例**：
```json
{
  "success": true,
  "verified": true,
  "user": { "username": "admin", "role": "admin" },
  "code": null,
  "message": null
}
```

---

### 3.4 退出登录 — `DELETE /api/auth`

清除 Session Cookie。

**响应示例**：
```json
{ "success": true, "message": "已安全登出" }
```

---

### 3.5 官方片库目录 — `GET /api/media/catalog`

海外影视资料目录浏览，基于 Cinemeta / TVMaze。

**查询参数**：
| 参数 | 类型 | 说明 | 默认 |
|------|------|------|------|
| `type` | string | `movie` \| `series` \| `anime` | `movie` |
| `sort` | string | 目录排序维度 | `top` |
| `showId` | string | TVMaze 剧集 ID（数字），带时返回分集清单 | — |

**响应示例（无 showId）**：
```json
{
  "type": "movie",
  "sort": "top",
  "total": 20,
  "list": [ { "id": "...", "title": "...", "cover": "...", ... } ]
}
```

**响应示例（有 showId）**：
```json
{
  "showId": 123,
  "total": 10,
  "episodes": [ { ... } ]
}
```

**缓存头**：`Cache-Control: private, max-age=7200, stale-while-revalidate=14400`（目录）；`max-age=3600`（分集）。

---

### 3.6 多源并发聚合搜索 — `POST /api/search` / `GET /api/search?stream=1`

多源并发搜索，支持一次性 JSON 与 NDJSON 流式两种模式。流式模式下每个源结算立即回调，坏源不阻塞好源。

**请求体（JSON 模式）**：
```json
{
  "wd": "搜索关键词（≤100 字符）",
  "sources": [ { "key": "...", "name": "...", "url": "..." } ],
  "filterAdult": false,
  "page": 1
}
```

**查询参数（流式模式 `?stream=1`）**：同 JSON 模式，通过请求体传参。

**响应示例（JSON）**：
```json
{
  "list": [
    { "sourceKey": "...", "sourceName": "...", "vodId": "...", "name": "...", "pic": "...", "year": "...", "area": "...", "remarks": "...", "isAdult": false }
  ],
  "failures": [ { "sourceKey": "...", "error": "...", "timedOut": false } ]
}
```

**NDJSON 流式事件（`SearchStreamEvent`）**：
- `{ type: "source", sourceKey, ok, list[], error?, timedOut?, ms? }` — 每个源结算立即推送
- `{ type: "done", list[], failures[] }` — 最终聚合结果

**客户端调用**：`api.search(wd, sources, filterAdult, { onSource, signal, page })`。

**缓存**：同一关键词 + 同一组源 + 同页在 90s 内直接返回命中缓存。

---

### 3.7 视频详情与剧集列表 — `GET /api/detail`

根据采集站源与内容 ID 拉取详情与全部集数播放地址。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | string | 视频 ID（`[\w-]+`），必填 |
| `source` | string | 经 `encodeUrlToken` 编码的 SourceConfig JSON，必填 |
| `baseUrl` | string | 可选，详情页根地址 |

**响应示例**：
```json
{
  "episodes": [
    { "url": "https://example.com/play/1.m3u8", "name": "第1集" }
  ],
  "videoInfo": {
    "title": "影片标题",
    "cover": "https://example.com/cover.jpg",
    "desc": "剧情简介",
    "typeName": "电影",
    "year": "2024",
    "area": "大陆",
    "director": "导演",
    "actor": "演员",
    "remarks": "更新至第12集",
    "sourceKey": "...",
    "sourceName": "示例源",
    "sourceUrl": "..."
  }
}
```

**缓存头**：`Cache-Control: private, max-age=60, stale-while-revalidate=300`。  
**SSRF**：请求上游前先经过 `checkUpstreamAllowed` 校验。

---

### 3.8 官方影视资料详情 — `GET /api/media/detail`

基于 TMDB / 豆瓣 / Bangumi / Cinemeta / TVMaze 等权威元数据库，查询影片详情、海报、评分、演职员。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | string | 条目 ID（如 TMDB ID、或 `cinemeta:tt...` 旧版 ID） |
| `title` | string | 片名，用于反查 |
| `year` | string | 年份 |
| `type` | string | 内容类型 |

**响应示例**：
```json
{
  "id": "123456",
  "title": "影片标题",
  "cover": "https://image.tmdb.org/t/p/original/...",
  "backdrop": "https://...",
  "rating": "8.9",
  "year": "2024",
  "overview": "剧情简介",
  "director": "...",
  "actors": [ ... ],
  "episodes_info": "..."
}
```

**缓存头**：`Cache-Control: public, max-age=3600, stale-while-revalidate=86400`。  
**404**：未找到对应影视资料。

---

### 3.9 单集看点 — `GET /api/media/episode-intro`

电视剧/动漫当前分集剧情介绍。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `title` | string | 剧名，必填 |
| `episode` | number | 当前集数（1-based），默认 1 |
| `type` | string | 视频分类（tv, anime 等） |

**响应示例**：
```json
{
  "title": "第1集标题",
  "desc": "本集看点简介",
  "airdate": "2024-01-01",
  "duration": 45
}
```

**缓存头**：`Cache-Control: private, max-age=1800, stale-while-revalidate=86400`。

---

### 3.10 图片 / 视频流代理 — `GET /api/proxy/[url]`

服务端代理请求上游图片或视频流，绕过 CORS 与防盗链。所有请求须经过 SSRF 校验。

**路径参数**：`[url]` — 经编码的上游目标地址。

**图片代理限制（PRD §7.1）**：
- 未登录仅放行白名单图片域（豆瓣、bgm.tv、qhimg.com、bdstatic.com）
- 已登录受 SSRF 防护

**注意**：`SmartImage` 组件默认 `direct` 直连，仅遇明确防盗链（403/418）时按配置降级 `proxy`/`custom`，禁止无脑代理图片（避免服务器连接池耗尽）。

---

### 3.11 源探活 — `POST /api/source/test`

以搜索 "test" 的响应耗时与结果量衡量点播源可用性。

**请求体**：
```json
{ "url": "https://example.com/api.php/provide/vod" }
```

**响应示例**：
```json
{ "ok": true, "ms": 420, "count": 30 }
```
或失败：
```json
{ "ok": false, "ms": 6000, "error": "超时" }
```

**SSRF**：校验上游地址，拒绝内网地址。

---

### 3.12 订阅拉取 — `GET /api/source-list?url=`

拉取并解析远程数据源订阅，自动识别 LibreTV-SourceList JSON 与 TVBOX 配置 JSON。

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `url` | string | 订阅地址，必填，须为 `http(s)` |

**响应示例**：
```json
{
  "name": "订阅名称",
  "sources": [ { "key": "...", "name": "...", "url": "..." } ],
  "liveSources": [ { "key": "...", "name": "...", "url": "...", "epg": "..." } ],
  "stats": { "format": "libretv", "skipped": 0, "skippedByReason": {}, "truncated": 0 }
}
```

**SSRF**：订阅地址与点播/直播源地址分别校验，点播源拒绝非公网地址。

---

### 3.13 其他接口（非 MVP 核心，供参考）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/media/search` | GET | 海外影视搜索 |
| `/api/media/feed` | GET | 影视热榜与全网实时大盘 |
| `/api/media/person` | GET | 演职员详情 |
| `/api/proxy` | GET | 旧路径形式通用代理（兼容） |
| `/api/source/test` | POST | 点播源探活 |
| `/api/source-list` | GET | 订阅拉取 |
| `/api/publish` | POST | 发布源列表到公开粘贴板 |
| `/api/live/playlist` | GET | 拉取并解析 M3U 直播订阅 |
| `/api/live/epg` | GET | 查询频道节目单 |
| `/api/live/probe` | POST | 批量直播测活 |
| `/api/admin` | GET/POST/DELETE | 管理后台（邀请码、用户、源、备份等，无前端页面） |
| `/api/user/sources` | GET/POST | 用户源配置同步 |

---

## 4. 客户端 API 封装（`src/lib/client-api.ts`）

前端通过 `api` 对象调用接口，所有请求均经 `throwForAuthStatus` 统一处理 401/503：

```ts
import { api } from '@/lib/client-api';

// 站点状态
const status = await api.status();

// 登录
await api.login({ username: 'admin', password: '123456' });

// 注册
await api.register({ username: 'newuser', password: '123456', inviteCode: 'LTV-XXXX' });

// 搜索（流式）
await api.search(wd, sources, filterAdult, {
  onSource: (outcome) => { /* 每个源结果立即回调 */ },
  signal: abortController.signal,
});

// 详情
const detail = await api.detail(id, source);

// 源探活
const result = await api.testSource(url);

// 订阅拉取
const payload = await api.fetchSourceList(url);
```

---

## 5. QA 测试检查清单

| 序号 | 接口 | 测试点 | 预期结果 |
|------|------|--------|----------|
| 1 | `GET /api/status` | 未登录 / 已登录 | `verified` 正确；返回 `defaultSources`、`defaultImageMode` |
| 2 | `POST /api/auth` (login) | 正确/错误密码 | 200 设置 Cookie / 401 返回错误 |
| 3 | `POST /api/auth` (register) | 缺少邀请码/账号过短/密码过短/两次不一致 | 400 返回对应 `field` 错误 |
| 4 | `POST /api/auth` | 短时间内多次失败 | 429 速率限制，retryAfterSec=600 |
| 5 | `DELETE /api/auth` | 退出登录 | Cookie 清除，`verified` 变 false |
| 6 | `GET /api/media/catalog` | 不同 type/sort | 返回列表，缓存头正确 |
| 7 | `POST /api/search` | 有效关键词 | 返回 `list[]` 与 `failures[]` |
| 8 | `GET /api/search?stream=1` | 多源并发，含坏源 | NDJSON 流式返回，坏源不阻塞好源 |
| 9 | `GET /api/detail` | 有效 id + source | 返回 `episodes[]` 与 `videoInfo` |
| 10 | `GET /api/media/detail` | TMDB ID / 片名 | 返回权威元数据，404 若未找到 |
| 11 | `GET /api/media/episode-intro` | 剧名 + 集数 | 返回单集看点 |
| 12 | `GET /api/proxy/[url]` | 白名单/非白名单图片域 | 未登录仅放行白名单域 |
| 13 | `POST /api/source/test` | 可用/不可用源 | `ok`/`ms`/`count` 或错误信息 |
| 14 | `GET /api/source-list?url=` | 有效订阅地址 | 返回 `sources[]` / `liveSources[]` / `stats` |
| 15 | 所有服务端请求 | 内网地址（127.0.0.1 等） | SSRF 阻断，返回 400/403 |

---

## 6. 数据类型简述（`src/lib/types.ts`）

| 类型 | 关键字段 |
|------|----------|
| `SourceConfig` | `key`/`name`/`url`/`detail?`/`isAdult?`/`timeoutMs?`/`priority?` |
| `SearchResultItem` | `sourceKey`/`sourceName`/`vodId`/`name`/`pic?`/`year?`/`area?`/`remarks?`/`isAdult?` |
| `VideoDetail` | `episodes[]` / `videoInfo` (`title`/`cover`/`desc`/`year`/`director`/`actor`/`remarks`) |
| `DoubanItem` | `id`/`title`/`cover`/`rating?`/`year?`/`region?`/`remarks?` |
| `AuthStatusResponse` | `passwordRequired`/`verified`/`user?`/`kickReason?`/`defaultSources[]`/`defaultImageMode?` |
| `SourceSearchOutcome` | `sourceKey`/`ok`/`list[]`/`error?`/`timedOut?`/`ms?` |
