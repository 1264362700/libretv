# LibreTV / cl.tv 关键页面原型说明

**版本**：v1.0（草稿）  
**用途**：交付给 UI 设计师出设计稿  
**形式**：文字 + 结构化描述（页面流、关键交互、字段与 API 对应关系）  
**对齐文档**：`PRD.md`（需求功能点、验收标准、优先级）

---

## 0. 设计基调与全局规范

- **品牌**：cl.tv，极简现代，深色主题为主，支持浅色/深色切换（Tailwind + `theme.tsx`）。
- **配色**：主色为 amber/accent（`#f59e0b` 系），背景 `bg-page`、表面 `bg-surface`、`bg-card`、边框 `border-line`，文字 `text-content` / `text-muted` / `text-faint`。
- **圆角**：统一 `rounded-xl` / `rounded-2xl`，卡片与弹窗使用阴影 `shadow-sm` / `shadow-xl`。
- **字体**：系统默认无衬线，标题 `font-bold` / `font-extrabold`，正文 `text-sm` / `text-base`，辅助文字 `text-xs` / `text-[11px]`。
- **布局**：顶部固定导航栏（Header），主内容区 `max-w-7xl mx-auto`，底部页脚（SiteFooter）。
- **无商业广告**：全站不出现插屏、贴片广告、弹窗广告；仅保留功能性提示（加载中、空状态、错误）。
- **响应式**：移动端使用底部标签栏（`mobile-bottom-bar.tsx`）+ 抽屉/底部弹窗（`mobile-filter-sheet.tsx`）；桌面端使用左侧内容 + 右侧侧栏（播放页）。

---

## 1. 首页（`/`）

### 1.1 页面结构（自上而下）

```
[Header 顶部导航]
  └─ Logo (cl.tv) | 搜索入口（可折叠）| 设置入口 | 用户状态/登录入口

[Hero 巨幕轮播]
  └─ 6 张 TMDB 官方趋势大片轮播，每张带标题、评分、年份、播放按钮
  └─ 加载态：Spinner；空态：EmptyState

[左右双栏楼层]
  ├─ 左侧：推荐内容卡片网格（官方海报卡片 MediaCard，5-6 列）
  └─ 右侧：热播榜单（文字列表，可点击跳转）

[底部页脚]
```

### 1.2 关键交互

| 交互点 | 触发方式 | 行为 |
|--------|----------|------|
| 搜索框输入 | 输入关键词，回车或失焦 | 跳转 `/catalog?wd=<关键词>` 或在首页内展示搜索结果区 |
| Hero 卡片点击 | 点击海报或“立即播放” | 若未登录 → `/login?redirect=/watch?...`；已登录 → 直接 `/watch?title=...&year=...&douban_id=...` |
| 底层采集源扫描按钮 | 点击“展开底层采集源深度扫描” | 展开 NDJSON 流式结果区，各源结果逐条出现，坏源以琥珀色标记 |
| 源结果卡片点击 | 点击聚合卡片 | 构造 `/watch?source=...&id=...&title=...&year=...`，登录校验后跳转 |
| 登录状态变更 | 未登录访问受保护能力 | 弹出登录框或跳转登录页，携带 redirect |

### 1.3 字段与 API 对应（首页）

| UI 字段 | 来源 | 字段 | 说明 |
|---------|------|------|------|
| 登录状态 | `GET /api/status` | `verified` | 决定是否拦截播放跳转 |
| 预置源列表 | `GET /api/status` | `defaultSources` | 用于默认勾选参与搜索的源 |
| 推荐数据源 | `GET /api/status` | `defaultRecommendSource` | 首页推荐 Tab 默认值 |
| Hero 大片 | `fetchTmdbClient({type:'trending'})` | `items[].id/title/cover/year/rating` | 取前 6 条 |
| 官方搜索结果 | `fetchTmdbClient({type:'movie', query})` | `items[].id/title/cover/year/rating/overview` | 关键词搜索 |
| 底层搜索结果 | `POST /api/search?stream=1` | `SourceSearchOutcome[].list[]` | `sourceKey/sourceName/vodId/name/pic/year/area/remarks` |
| 源健康 | `store.sourceHealth` | `ok/ms/timedOut/error` | 决定源卡片显示状态（绿/琥珀/红） |

### 1.4 原型备注给设计师

- Hero 轮播需预留“加载中”与“空态”两种占位。
- 搜索结果需区分“官方资料库结果”（优先展示，标准海报）与“底层采集源结果”（可折叠展开，按源分组）。
- 源卡片需显示源名称、延迟 ms、QoS 等级（绿/琥珀/红色点）。
- 空状态：未搜到匹配影视时，展示 EmptyState 并给出“尝试通过底层采集源深度直搜”入口。

---

## 2. 片库页（`/catalog`）

### 2.1 页面结构

```
[Header]
[页头]
  ├─ 频道图标 + 频道标题（如“电影片库大厅”）+ 副标题
  └─ 搜索表单：输入框 + “深搜”按钮 + 清空按钮

[搜索结果横幅]（仅有搜索词时显示）
  ├─ “正在【电影】全库深度搜索 “X” （找到约 N 部影片）”
  └─ “✕ 清空返回片单” | “🌐 切换为全网聚合直搜”

[热门搜索词]（仅无搜索词时显示）
  ├─ 🔥 大家都在搜：[词1][词2][词3]（药丸按钮，点击填入搜索框）

[多维筛选面板]（仅无搜索词时显示）
  ├─ 地区筛选 | 类型筛选 | 年份筛选 | 排序筛选
  ├─ 激活筛选数提示 | “重置所有筛选”按钮

[统计与加载状态行]
  ├─ 左：结果总数 / 分页信息
  └─ 右：实时更新中动画（加载时）

[内容网格]
  ├─ 官方片库卡片（DoubanCard，5-6 列，海报 + 标题 + 年份）
  └─ 或者 聚合卡片（AggregatedCard，底层源结果）

[分页导航]（仅无搜索词时显示）
  └─ 第 X / Y 页，可跳页

[浮动回到顶部按钮]
[SiteFooter]
```

### 2.2 关键交互

| 交互点 | 触发方式 | 行为 |
|--------|----------|------|
| 频道切换 | 顶部频道标签 | 页面标题、副标题、图标、可用筛选维度、热词全部随频道变化 |
| 筛选选择 | 地区/类型/年份/排序下拉或按钮 | URL 参数更新，卡片列表重新加载，保持当前页 |
| 搜索提交 | 输入关键词点击“深搜” | 显示搜索结果横幅，加载片库目录或全网源结果 |
| 热词点击 | 点击药丸按钮 | 填入搜索框并自动触发搜索 |
| 卡片点击 | 点击海报卡片 | 未登录 → `/login?redirect=/watch?...`；已登录 → `/watch?source=...&id=...&title=...&year=...` |
| 分页点击 | 点击页码 | URL 更新 `page` 参数，列表刷新，筛选条件保留 |
| 回到顶部 | 浮动按钮 | 平滑滚动至页顶 |

### 2.3 字段与 API 对应（片库页）

| UI 字段 | 来源 | 字段 | 说明 |
|---------|------|------|------|
| 当前频道 | `catalog-config.ts` | `activeChannelConfig.icon/label/subTitle/regions/genres` | 决定筛选可选值 |
| 地区/类型/年份/排序 | `useCatalogFilters` | `currentRegion/currentGenre/currentYear/currentSort` | 持久化到 URL |
| 搜索关键词 | URL 参数 | `wd` / `catalogKeyword` | 频道内深搜 |
| 官方片库 | `GET /api/media/catalog?type=&sort=` | `list[].id/title/cover/year/rating` | Cinemeta/TVMaze 目录 |
| 聚合结果 | `POST /api/search` | `SearchResultItem[].sourceKey/vodId/name/pic/year` | 底层源聚合 |
| 分页 | `currentPage` / `totalPages` | 计算得出 | 第 X / Y 页 |

### 2.4 原型备注给设计师

- 筛选面板在移动端以底部弹窗（`mobile-filter-sheet.tsx`）形式展开。
- 卡片需预留“加载中骨架屏”（`CatalogSkeleton`）。
- 空状态：频道下无影片或搜索无结果时，展示 🍿 图标与“尝试清空筛选条件”按钮。
- 激活筛选时，筛选条件以标签（tag）形式展示并可单独移除。

---

## 3. 播放页（`/watch`）

### 3.1 页面结构（桌面端）

```
[顶部自适应导航栏（sticky）]
  ├─ 返回按钮 | 首页按钮
  ├─ 视频标题（截断）+ 源名 + 第 X/Y 集
  └─ 操作组：主题切换 | 追剧单星标 | 跨屏接力二维码 | 下载本集 | 测速换源

[主内容区（grid: 左主视区 1fr | 右侧栏 360-380px）]
  [左主视区]
    ├─ 动态环境光影（海报模糊背景）
    ├─ 播放器区域（ArtPlayer + hls.js，aspect-video）
    │   ├─ 暂无播放地址时：显示错误 + “立即切换至备用线路”按钮
    │   └─ 播放控制：倍速、快捷键提示、影院模式切换
    ├─ 视频信息与快捷控制栏
    │   ├─ 标题 | 源名标签 | 第 X 集（共 Y 集）+ 备注
    │   ├─ 上一集 / 下一集按钮 | 影院宽屏切换 | 自动连播复选框
    └─ 播放线路栏（水平滚动，按源名排列）
        ├─ 每条线路：源名 + 延迟 ms + QoS 等级 + 当前/受阻标记
        └─ “测速面板”按钮（打开换源弹窗）

  [右侧栏]
    ├─ 剧集选集（百集分段折叠，当前集高亮）
    ├─ 本集看点（标题、简介、播出日期、时长）
    ├─ 影片档案：导演、演员、类型、地区、备注、剧情简介（可展开）
    ├─ 演职员探索图谱（头像小图 + 姓名）
    └─ 海报墙（点击海报切换主海报）

[全宽“猜你喜欢”智能推荐专区]
  └─ 卡片网格，基于当前分类推荐

[弹层（按需弹出）]
  ├─ SwitchSourceModal：完整测速与换源面板（源列表、延迟、QoS、集数）
  ├─ QrHandoffModal：跨屏接力二维码 + 当前播放时间
  ├─ SpeedSuggestionDialog：测速建议换源对话框
  └─ WatchFallbackState：源失效时的兜底状态

[SiteFooter]
```

### 3.2 关键交互

| 交互点 | 触发方式 | 行为 |
|--------|----------|------|
| 播放/暂停 | 空格键或点击播放器 | 播放器切换状态 |
| 快退/快进 | ← / → 键 | ±5 秒 |
| 音量 | ↑ / ↓ 键 | 增减音量 |
| 全屏 | F 键 | 进入/退出全屏 |
| 上一集/下一集 | Alt + ← / Alt + → 或点击按钮 | URL `index` 参数更新，新集加载，进度重置 |
| 选集点击 | 点击右侧栏集数 | 跳转到对应集，保持源不变 |
| 影院模式 | 点击“影院宽屏模式” | 右侧栏收起，视区扩大至 84vh |
| 追剧单切换 | 点击星标按钮 | 加入/移出追剧单， toast 提示，首页红点同步 |
| 线路切换 | 点击播放线路栏中的源按钮 | 立即切换源并继续播放，保留当前进度 |
| 测速换源 | 点击“测速换源”按钮 | 打开 SwitchSourceModal，展示所有候选源延迟与 QoS |
| 跨屏接力 | 点击 📱 按钮 | 生成二维码，包含当前 URL 与 position 秒数 |
| 下载本集 | 点击下载按钮 | 调用 `enqueueDownload`，进入下载队列 |
| 自动连播 | 勾选复选框 | 播放结束后自动加载下一集 |

### 3.3 字段与 API 对应（播放页）

| UI 字段 | 来源 | 字段 | 说明 |
|---------|------|------|------|
| 视频标题 | URL / 详情接口 | `title` / `videoInfo.title` | 优先官方元数据 |
| 剧集列表 | `GET /api/detail` | `episodes[]` | 播放地址数组 |
| 当前集 | URL 参数 | `index` | 0-based |
| 播放地址 | `episodes[index]` | `url` | HLS / HTTP-FLV |
| 官方海报 | `GET /api/media/detail` | `cover` / `backdrop` | 环境光影与海报墙 |
| 演职员 | `GET /api/media/detail` | `actors[]` / `directors[]` | 官方名录 |
| 剧情简介 | `GET /api/media/detail` | `overview` | 可展开折叠 |
| 单集看点 | `GET /api/media/episode-intro` | `title/desc/airdate/duration` | 当前集 |
| 源名称 | store / URL | `source.name` / `sourceKey` | 当前播放源 |
| QoS 等级 | `source-circuit-breaker.ts` | `getSourceQoSBadge(key)` | 等级 / 标签 |
| 延迟 ms | `use-watch-engine.ts` | `c[].ms` | 每条线路探测耗时 |
| 追剧单状态 | `db.favorites` | `favoriteIdOf(title)` | 填充/空心星标 |
| 播放进度 | `db.history` | `playbackPosition` / `duration` | IndexedDB 持久化，续播用 |

### 3.4 原型备注给设计师

- 播放器区域需预留“加载中 Spinner”与“无播放地址错误态”两种占位。
- 播放线路栏为水平滚动，每条线路显示源名、延迟、QoS 等级（绿点/琥珀点/红点）。
- 右侧栏在移动端折叠为底部选集栏；桌面端固定宽度 360-380px。
- 剧集选集支持“百集分段折叠”，需预留折叠/展开交互。
- 跨屏接力二维码需显示当前视频标题、集数、总集数、续播秒数。

---

## 4. 历史页（`/history`）

### 4.1 页面结构

```
[页头]
  ├─ 返回箭头 | 标题“观看历史” | 总数（N）
  └─ （总数>0 时显示“清空历史”按钮）

[搜索栏]（总数>0 时显示）
  ├─ 搜索图标 | 输入框“搜索观看历史...” | 清空按钮
  └─ 右侧：“清空历史”按钮

[列表区]
  ├─ 空态：EmptyState “暂无观看记录”
  ├─ 提示：共 N 条记录，仅显示最近 50 条
  └─ 历史记录列表（每条）
      ├─ 缩略图（海报，加载失败显示占位图标）
      ├─ 标题（截断）
      ├─ 副标题：第 X/Y 集 · 播放时间 · 相对时间（如“3 小时前”）
      ├─ 进度条（10%~95% 时显示百分比）
      └─ 删除按钮（悬停显示，点击后出现“撤销” toast）

[ConfirmDialog]（清空历史确认）
  └─ “清空全部观看历史？将删除 N 条记录，此操作不可撤销。” | 取消 / 清空

[SiteFooter]
```

### 4.2 关键交互

| 交互点 | 触发方式 | 行为 |
|--------|----------|------|
| 历史记录点击 | 点击列表项 | 跳转 `/watch?source=...&id=...&index=...&position=...`，恢复进度 |
| 搜索过滤 | 输入关键词 | 列表实时过滤匹配标题的记录 |
| 删除单条 | 点击条目右侧删除图标 | 记录移除，toast 显示“已删除”并提供 5 秒“撤销”入口 |
| 清空历史 | 点击“清空历史”按钮 | 弹出确认对话框，确认后全部删除，显示空态 |
| 撤销删除 | toast 中点击“撤销” | 恢复被删除的记录 |

### 4.3 字段与 API 对应（历史页）

| UI 字段 | 来源 | 字段 | 说明 |
|---------|------|------|------|
| 历史记录 | `db.history` | `HistoryEntry[]` | `title/pic/episodeIndex/totalEpisodes/playbackPosition/duration/timestamp` |
| 进度百分比 | 计算 | `playbackPosition / duration * 100` | 仅 10%~95% 显示 |
| 相对时间 | `formatRelativeTime` | `timestamp` | 如“3 小时前” |
| 播放页跳转 | `buildWatchUrl` | `sourceKey/vodId/index/title/sourceUrl/detail` | 构造 `/watch` URL |

---

## 5. 登录页（`/login`）

### 5.1 页面结构

```
[全屏背景：流光装饰]
[品牌区]
  ├─ Logo (cl.tv)
  ├─ 标题：“登录您的账号” / “创建新账号”
  └─ 副标题：“影院级超清影视探索平台 · 跨端云同步”

[卡片容器（bg-surface-raised，rounded-2xl，阴影）]
  ├─ 被顶号/下线提示（kickNotice，危险色条，如有）
  ├─ Tab 切换：“账号登录” | “邀请码注册”
  ├─ 错误提示条（如有 errorMsg）
  ├─ 登录表单：
  │   ├─ 账号名称输入框（autoComplete="username"）
  │   ├─ 登录密码输入框（autoComplete="current-password"）
  │   └─ “立即登录”按钮（加载时显示 spinner）
  ├─ 注册表单：
  │   ├─ 注册邀请码输入框（placeholder: LTV-XXXX-XXXX）
  │   ├─ 账号名称输入框（≥3 字符）
  │   ├─ 设置密码输入框（≥6 字符）
  │   ├─ 确认密码输入框
  │   └─ “注册并登录”按钮
  └─ 底部：“返回首页”链接 | 标语“自由观影 · 极速秒播”

[SiteFooter]
```

### 5.2 关键交互

| 交互点 | 触发方式 | 行为 |
|--------|----------|------|
| Tab 切换 | 点击“账号登录”/“邀请码注册” | 切换表单，清空错误提示 |
| 登录提交 | 点击“立即登录” | 校验非空，调用 `POST /api/auth` (action=login)，成功后跳转 redirect 或首页 |
| 注册提交 | 点击“注册并登录” | 校验邀请码/账号长度/密码长度/两次密码一致，调用 `POST /api/auth` (action=register)，成功后自动登录并跳转 |
| 邀请码 URL 参数 | URL 带 `invite`/`code`/`inviteCode` | 自动切换到注册模式并填入邀请码 |
| 已登录访问 | 检测到 `verified=true` | 自动跳转 redirect 或首页 |
| 返回首页 | 点击底部链接 | 跳转 `/` |

### 5.3 字段与 API 对应（登录页）

| UI 字段 | 来源 | 字段 | 说明 |
|---------|------|------|------|
| 登录模式 | 本地状态 | `mode` | `login` / `register` |
| 账号 | 表单输入 | `username` | 登录/注册均需 |
| 密码 | 表单输入 | `password` | ≥6 字符 |
| 邀请码 | 表单输入 / URL 参数 | `inviteCode` / `invite` | 注册必填 |
| 登录接口 | `POST /api/auth` | `action=login` | 返回 `success/user/message` |
| 注册接口 | `POST /api/auth` | `action=register` | 需 `inviteCode` |
| 跳转目标 | URL 参数 | `redirect` | 登录后回跳 URL |
| 被顶号提示 | URL 参数 | `kickNotice` | 危险提示条文案 |

---

## 6. 设置页（`/settings`）

### 6.1 页面结构

```
[页头]
  ├─ 返回箭头 | 标题“设置”

[主导航（一级 Tab）]
  ├─ 源管理 | 偏好设置 | 数据

[子导航（二级 Tab，随一级变化）]
  源管理：点播源 | 数据源订阅
  偏好设置：播放与过滤 | 封面图加载 | 首页与内容
  数据：配置导入导出

[内容区（随子 Tab 变化）]

[SiteFooter]
```

### 6.2 各子页面原型

#### 6.2.1 点播源（VodSourcesPanel）

```
[表格/卡片列表]
  每行：源名 | API 地址 | 是否成人（标签） | 勾选框（参与搜索） | 操作（编辑 / 删除）
[添加源表单]
  ├─ 源名称 | API 根地址 | 详情页地址（可选） | 成人内容开关 | 搜索优先级 | 超时时间
  └─ “添加源”按钮
[删除后撤销 toast]（5 秒内可撤销）
```

#### 6.2.2 数据源订阅（SourceSubscriptions）

```
[订阅列表]
  每行：订阅名称 | 订阅 URL | 同步状态（成功/错误/未同步） | 上次同步时间 | 导入数量（点播/直播） | 操作（同步 / 启停 / 删除）
[添加订阅]
  ├─ 订阅 URL | 名称（可选） | “添加订阅”按钮
[订阅详情]（展开）
  ├─ 同步统计：跳过原因分类（spider/xml/unsearchable/nonM3uLive/invalidUrl） | 截断数量
```

#### 6.2.3 播放与过滤（PlaybackPanel）

```
[开关列表]
  ├─ 自动连播（开关）
  ├─ 成人内容过滤（开关，开启后成人源自动取消勾选）
  ├─ 广告过滤（开关）
```

#### 6.2.4 封面图加载（ImagePanel）

```
[单选按钮组]
  ├─ 直连（默认，省服务器流量）
  ├─ 代理（走服务端代理，最稳定）
  └─ 自定义代理（输入自定义代理地址）
```

#### 6.2.5 首页与内容（HomePanel）

```
[下拉选择]
  推荐数据源：豆瓣分类 / Bangumi 新番 / 影视周榜 / 百度实时榜 / 豆瓣 Top250 / 360热播 / 猫眼大盘 / 爱奇艺热榜 / 热门短剧
```

#### 6.2.6 配置导入导出（ConfigIoPanel）

```
[导出区]
  └─ “导出配置”按钮 → 下载 JSON 文件
[导入区]
  ├─ 文件选择输入（.json）
  └─ “导入配置”按钮 → 覆盖或合并当前配置
```

### 6.3 关键交互

| 交互点 | 触发方式 | 行为 |
|--------|----------|------|
| 添加点播源 | 填写表单点击“添加源” | 校验 URL 格式，调用 `store.addCustomApi`，列表新增并可勾选 |
| 删除点播源 | 点击“删除” | 返回快照，toast 显示撤销入口，5 秒内可恢复 |
| 添加订阅 | 输入 URL 点击“添加订阅” | 调用 `store.addSubscription`，列表新增 |
| 同步订阅 | 点击“同步” | 调用 `api.fetchSourceList`，导入点播源与直播源，显示同步结果 |
| 启停订阅 | 切换订阅开关 | 调用 `store.setSubscriptionEnabled`，停用后源不参与搜索但不删除 |
| 导出配置 | 点击“导出配置” | 下载包含 `partialize` 字段的 JSON 文件 |
| 导入配置 | 选择 JSON 文件点击“导入” | 调用 `importConfig`，合并或覆盖当前设置 |
| 成人过滤开关 | 切换开关 | 开启后自动取消勾选所有成人源，搜索中不再出现 |

### 6.4 字段与 API 对应（设置页）

| UI 字段 | 来源 | 字段 | 说明 |
|---------|------|------|------|
| 自定义点播源 | `store.customAPIs` | `SourceConfig[]` | `key/name/url/isAdult/timeoutMs/priority` |
| 选中源 | `store.selectedKeys` | `string[]` | 参与搜索的源 key |
| 成人过滤 | `store.yellowFilter` | `boolean` | 开启后成人源不参与搜索 |
| 自动连播 | `store.autoplayNext` | `boolean` | 播放结束自动下一集 |
| 封面图模式 | `store.imageProxyMode` | `'direct'/'proxy'/'custom'` | 图片加载方式 |
| 推荐数据源 | `store.recommendSource` | 枚举 | 首页推荐来源 |
| 订阅列表 | `store.subscriptions` | `SourceSubscription[]` | `url/name/lastSync/lastStatus/lastError` |
| 订阅拉取 | `GET /api/source-list?url=` | `SourceListPayload` | `sources[]/liveSources[]/stats` |
| 源探活 | `POST /api/source/test` | `{url}` | 返回 `ok/ms/count/error` |
| 配置导出/导入 | `store.partialize` / `importConfig` | JSON | 可持久化字段子集 |

---

## 7. 全局组件与状态说明（供设计师参考）

### 7.1 登录拦截（全局）

- 任何未登录状态访问 `/watch` 或点击播放入口，统一跳转 `/login?redirect=<当前完整 URL>`。
- 登录成功后 `window.location.href = redirect` 回跳。
- 401 响应统一通过 `libretv:unauthorized` 全局事件触发登录框。

### 7.2 加载态与空态

- **加载态**：`Spinner` 组件，尺寸 sm/md/lg，用于搜索加载、详情加载、播放器加载。
- **空态**：`EmptyState` 组件，包含图标 + 标题 + 描述 + 可选操作按钮。
- **骨架屏**：`CatalogSkeleton`，用于片库页列表加载。

### 7.3 提示组件

- **Toast**：顶部或右下角轻提示，支持 success/info/danger 类型，可带操作按钮（如“撤销”）。
- **ConfirmDialog**：危险操作确认框，如清空历史、删除源。

### 7.4 移动端适配

- 底部标签栏（`mobile-bottom-bar.tsx`）：首页、片库、历史、设置、我的。
- 筛选底部弹窗（`mobile-filter-sheet.tsx`）：片库页多维筛选在移动端以底部弹窗展开。
- 播放器在移动端支持长按 3 倍速快进。

---

## 8. 交付确认清单

UI 设计师出稿后，产品经理将按以下清单验收：

- [ ] 首页：Hero 轮播、官方搜索、底层源扫描、登录拦截跳转
- [ ] 片库页：频道切换、多维筛选、深搜、分页、空态
- [ ] 播放页：播放器、多源线路栏、选集、追剧单、跨屏接力、下载、故障转移态
- [ ] 历史页：列表、搜索过滤、删除单条、清空、撤销
- [ ] 登录页：登录/注册 Tab、校验提示、邀请码、被顶号提示、自动跳转
- [ ] 设置页：一级/二级 Tab、点播源增删、订阅同步、偏好开关、配置导入导出
- [ ] 全局：深色/浅色主题、加载态、空态、Toast、ConfirmDialog、移动端适配

如有模块优先级或范围调整，请先与 Lead 确认后再反馈给设计师。
