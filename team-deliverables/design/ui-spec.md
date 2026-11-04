# ui-spec.md — UI 设计规范与组件清单

**产品**：LibreTV（cl.tv）视频聚合播放平台  
**版本**：v1.0（基于 PRD.md v1.0、PROTOTYPE.md v1.0、DEVELOPMENT.md §四、PRD-IMAGE-OPT.md）  
**编制**：UI/UX 设计师（ui-ux-designer）  
**状态**：待 Lead 审阅 → 交付 fullstack-developer 实施；QA 据此确认界面可测试点

---

## 0. 设计基调与全局原则

| 项 | 规范 |
|----|------|
| 品牌 | cl.tv，极简现代，影院级沉浸感暗黑风格 |
| 主题 | 深色主题为主，支持浅色/深色切换（Tailwind + `theme.tsx`） |
| 广告 | 无商业广告：全站不出现插屏、贴片广告、弹窗广告；仅保留功能性提示（加载中、空状态、错误） |
| 圆角 | 统一 `rounded-xl` / `rounded-2xl`；卡片与弹窗使用阴影 `shadow-sm` / `shadow-xl` |
| 字体 | 系统默认无衬线；标题 `font-bold` / `font-extrabold`；正文 `text-sm` / `text-base`；辅助文字 `text-xs` / `text-[11px]` |
| 布局 | 顶部固定导航栏（Header）；主内容区 `max-w-7xl mx-auto`；底部页脚（SiteFooter） |
| 响应式 | 移动端底部标签栏 + 抽屉/底部弹窗；桌面端左侧内容 + 右侧侧栏（播放页） |
| 无障碍 | 图标按钮必须有 `aria-label`；装饰性图片 `alt=""`；内容图片提供降级文案；自动轮播在键盘聚焦、触摸与 `prefers-reduced-motion` 下暂停并提供暂停按钮；抽屉/弹窗/播放器支持键盘 Tab / Esc 回归 |

---

## 1. 设计系统基础（Token）

所有颜色、间距、圆角优先使用 `tailwind.config.ts` 中的语义化 CSS 变量，不要将具名颜色散落各处。

### 1.1 配色（语义化 Token）

| Token | 用途 | 尾wind 类名（参考） |
|-------|------|-------------------|
| `bg-page` | 页面基础背景 | `bg-page` |
| `bg-surface` | 表面层（卡片容器背景） | `bg-surface` |
| `bg-surface-raised` | 提升表面（登录卡片、弹窗） | `bg-surface-raised` |
| `bg-chip` | 芯片/标签背景 | `bg-chip` |
| `text-content` | 主要文本 | `text-content` |
| `text-muted` | 次要文本 | `text-muted` |
| `text-faint` | 辅助/占位文本 | `text-faint` |
| `border-line` | 边框线色 | `border-line` |
| `border-line/60` | 半透明边框 | `border-line/60` |
| `bg-accent` / `text-accent` / `border-accent` / `text-on-accent` | 品牌主色（amber/accent `#f59e0b` 系） | `bg-accent` 等 |

### 1.2 状态色（语义化）

| 状态 | 用途 | 视觉表现 |
|------|------|----------|
| 成功（success） | Toast 成功、操作完成 | 绿色系 |
| 信息（info） | 提示、引导 | 蓝色系 |
| 危险（danger） | 错误条、确认删除、被顶号 | 红色系 |
| 警告/琥珀 | 源超时、部分失败 | 琥珀色 `#f59e0b` 系 |
| QoS 绿点 | 源健康 `ok` | 绿色实心点 |
| QoS 琥珀点 | 源健康 `timedOut` | 琥珀色实心点 |
| QoS 红点 | 源健康 `error` | 红色实心点 |

### 1.3 字体规范

| 类型 | 尺寸 | 粗细 | 行高 | 使用场景 |
|------|------|------|------|----------|
| 标题 H1 | `text-[24px]` / `text-2xl` | `font-extrabold` | `tight` | 页面主标题 |
| 标题 H2 | `text-[20px]` / `text-xl` | `font-bold` | `tight` | 区块标题 |
| 标题 H3 | `text-[18px]` / `text-lg` | `font-bold` | `normal` | 卡片标题、子标题 |
| 正文 | `text-base` / `text-[16px]` | `font-normal` | `normal` | 正文说明、剧情简介 |
| 辅助正文 | `text-sm` / `text-[14px]` | `font-normal` | `normal` | 副标题、元数据 |
| 辅助小字 | `text-xs` / `text-[12px]` | `font-normal` | `normal` | 年份、评分、相对时间 |
| 标注极小 | `text-[11px]` | `font-normal` | `normal` | 标签、QoS 等级文字 |

### 1.4 间距规范

| Token | 值 | 使用场景 |
|-------|-----|----------|
| `space-xs` | `4px` | 紧凑内间距 |
| `space-sm` | `8px` | 组件内元素间距 |
| `space-md` | `16px` | 卡片内边距、区块间距 |
| `space-lg` | `24px` | 大区块间距 |
| `space-xl` | `32px` | 页面主区块间距 |
| `space-2xl` | `48px` | 主要页面分区间距 |

卡片尺寸参考：`w-[125px] sm:w-[145px] md:w-[160px] shrink-0`，轨道高度收敛在 ~210px。

### 1.5 圆角与阴影

| 项 | 值 | 使用场景 |
|----|-----|----------|
| `rounded-xl` | `8px` | 一般卡片、按钮、输入框 |
| `rounded-2xl` | `12px` | 登录卡片、弹窗、Hero 轮播容器 |
| `shadow-sm` | 轻阴影 | 卡片悬停、表格行 |
| `shadow-xl` | 重阴影 | 弹窗、抽屉、登录卡片 |

---

## 2. 组件清单（供全栈开发者实施）

### 2.1 基础原子组件

| 组件名 | 用途 | 关键属性/状态 | 测试点（QA） |
|--------|------|---------------|--------------|
| `Button` | 主要操作按钮 | variant: primary/ghost/danger；size: sm/md/lg；loading: boolean；disabled: boolean | 点击触发、loading 状态下禁用、disabled 置灰、键盘 Enter 触发 |
| `Input` | 文本输入 | type: text/password；placeholder；disabled；error: boolean；aria-label | 聚焦/失焦、校验错误显示、密码可见切换 |
| `Spinner` | 加载指示 | size: sm/md/lg | 展示/隐藏、尺寸正确 |
| `Badge` | 状态标签 | variant: success/info/danger/warning；text | 文字显示、颜色对应状态 |
| `Checkbox` | 布尔选择 | checked；disabled；onChange | 勾选/取消、无障碍标签 |
| `Switch` | 开关 | checked；disabled；onChange | 开/关状态、动画 |
| `Select` | 下拉选择 | options；value；onChange；disabled | 展开/收起、选中值显示、搜索（如有） |
| `Tabs` | 标签页 | items；activeIndex；onChange | 切换激活态、键盘 Tab 导航 |
| `Avatar` | 头像 | src；alt；size；fallback | 图片加载成功/失败兜底、alt 文案 |

### 2.2 状态反馈组件

| 组件名 | 用途 | 关键属性/状态 | 测试点（QA） |
|--------|------|---------------|--------------|
| `Toast` | 轻量提示 | type: success/info/danger；message；duration；action（如“撤销”） | 出现/自动消失、操作按钮触发、危险类型颜色 |
| `ConfirmDialog` | 危险操作确认 | title；content；confirmText；cancelText；onConfirm；onCancel | 弹出/关闭、确认/取消回调、Esc 关闭 |
| `EmptyState` | 空状态 | icon；title；description；action（可选按钮） | 图标显示、文案、操作按钮跳转 |
| `Alert` | 错误/警告条 | type: error/warning/info；message；dismissible | 显示错误文案、可关闭、颜色对应类型 |

### 2.3 图片与媒体组件

| 组件名 | 用途 | 关键属性/状态 | 测试点（QA） |
|--------|------|---------------|--------------|
| `SmartImage` | 封面图加载（候选链降级） | src；mode (direct/proxy/custom)；loading (eager/lazy)；aspect-ratio；onExhausted；aria-label | 骨架屏占位、加载成功淡入、所有链失败后兜底占位+抖动、lazy 懒加载 |
| `CatalogSkeleton` | 片库列表骨架屏 | count；cardSize | 与真实卡片 1:1 几何对齐、脉冲动画 |
| `VideoPlayer` | 播放器壳（ArtPlayer + hls.js） | src；poster；autoplay；controls；onError；onEnded | 播放/暂停、倍速、全屏、错误态、进度条 |
| `QRCode` | 跨屏接力二维码 | value；size | 二维码生成、可扫码、包含当前时间点 |

### 2.4 页面级组件

| 组件名 | 用途 | 关键属性/状态 | 测试点（QA） |
|--------|------|---------------|--------------|
| `Header` | 顶部导航 | logo；search；settings；userState (login/logout) | Logo 跳转首页、搜索入口、设置跳转、用户状态切换 |
| `SiteFooter` | 底部页脚 | 固定内容 | 显示、链接可点击 |
| `HeroCarousel` | Hero 轮播 | items[]（6 条）；autoplay；onItemClick；preload | 自动轮播、手动切换、预加载下一张、无空白闪烁、键盘/触摸暂停 |
| `MediaCard` | 官方海报卡片 | item；onClick；loading；failed | 点击跳转播放、海报加载状态、失败兜底 |
| `AggregatedCard` | 聚合卡片（底层源） | sourceKey/name/vodId/pic/year；onClick；health | 源名显示、QoS 色点、点击跳转 |
| `ChannelSwitcher` | 频道切换 | channels[]；activeChannel；onChange | 频道切换后标题/图标/筛选维度随之变化 |
| `FilterPanel` | 多维筛选 | regions/genres/years/sorts；activeFilters；onChange；mobileSheet | 筛选条件持久化到 URL、标签可单独移除、移动端底部弹窗 |
| `EpisodeList` | 剧集选集 | episodes[]；currentIndex；onEpisodeClick；collapse | 百集分段折叠、当前集高亮、点击切换集数 |
| `SourceBar` | 播放线路栏 | sources[]；activeSource；onSwitch；QoS | 水平滚动、源名+延迟+QoS、点击切换源保留进度 |
| `WatchFallbackState` | 播放源失效兜底 | message；actionButton；onAction | 显示错误、切换备用线路按钮 |
| `SwitchSourceModal` | 测速换源弹层 | sources[]；onSwitch；onClose | 弹出/关闭、源列表+延迟+QoS、切换源 |
| `QrHandoffModal` | 跨屏接力弹层 | title；episode；total；position；qrValue；onClose | 二维码生成、显示标题/集数/续播秒数 |
| `SpeedSuggestionDialog` | 测速建议换源对话框 | suggestion；onAccept；onDismiss | 建议展示、接受/驳回 |
| `LoginForm` | 登录表单 | mode (login/register)；onSubmit；onModeChange；error | 登录/注册切换、校验提示、邀请码填充、被顶号条 |
| `SourceListPanel` | 点播源管理 | sources[]；onAdd；onEdit；onDelete；onToggle | 添加/编辑/删除、勾选参与搜索、删除撤销 toast |
| `SubscriptionPanel` | 数据源订阅 | subscriptions[]；onAdd；onSync；onToggle；onDelete | 同步状态显示、导入数量、启停 |
| `PreferencePanel` | 偏好设置 | autoplayNext；yellowFilter；adFilter；imageProxyMode；recommendSource | 开关切换、成人过滤联动取消成人源勾选、图片模式三选一 |
| `ConfigIoPanel` | 配置导入导出 | onExport；onImport；file | 导出 JSON、导入 JSON 合并/覆盖 |
| `HistoryList` | 观看历史列表 | entries[]；onSearch；onDelete；onUndo；onClear；onItemClick | 按时间倒序、搜索过滤、删除/撤销、清空确认、点击续播 |

---

## 3. 关键页面视觉说明（文字/Markdown 描述）

### 3.1 首页 `/`

**整体布局**：顶部固定 Header → Hero 巨幕轮播 → 左图右榜双栏楼层 → 底部页脚。

**Header**：
- 左侧 `cl.tv` Logo（文本 + 图标标志）
- 中间：可折叠搜索入口（输入框 + 搜索按钮）
- 右侧：设置入口（齿轮图标）、用户状态/登录入口（头像或“登录”文字）

**Hero 巨幕轮播**：
- 容器圆角 `rounded-2xl`，固定 `aspect-ratio`（16:9），加载前显示 `bg-slate-800/20` 骨架屏
- 6 张 TMDB 官方趋势大片横向轮播，每张带：标题（截断）、评分、年份、“▶ 播放”按钮
- 轨道下方小圆点指示器，当前页高亮
- 左右箭头（悬停显示），支持自动轮播与 `prefers-reduced-motion` 暂停

**左图右榜双栏**：
- 左侧：推荐内容卡片网格，5–6 列，每张卡片 `MediaCard`（海报 + 标题 + 年份 + 评分）
- 右侧：热播榜单，文字列表，每项带排名数字、片名、评分、年份，可点击跳转

**底层采集源深度扫描**：
- 默认折叠，点击“展开”后显示 NDJSON 流式结果区
- 各源结果逐条出现，格式：[源名][延迟 ms][QoS 色点][标题]
- 坏源以琥珀色标记，不阻塞好源继续流式返回

**空态**：未搜到匹配影视时，显示 `EmptyState`（图标 🔍 + 标题“未找到匹配影视” + 描述 + “尝试通过底层采集源深度直搜”按钮）

---

### 3.2 片库页 `/catalog`

**页头**：频道图标 + 频道标题（如“电影片库大厅”）+ 副标题（如“海外影视资料目录”）

**搜索表单**：输入框 + “深搜”按钮 + “清空”按钮，横向排列

**搜索结果横幅**（仅有搜索词时显示）：
- 文案：“正在【电影】全库深度搜索“X”（找到约 N 部影片）”
- 操作：“✕ 清空返回片单” | “🌐 切换为全网聚合直搜”

**热门搜索词**（仅无搜索词时显示）：
- “🔥 大家都在搜：” + 药丸按钮组（词1/词2/词3），点击填入搜索框并自动触发搜索

**多维筛选面板**：
- 地区筛选 | 类型筛选 | 年份筛选 | 排序筛选（下拉或按钮组）
- 激活筛选数提示 + “重置所有筛选”按钮
- 激活筛选以标签（tag）形式展示，可单独移除
- 移动端：底部弹窗（`mobile-filter-sheet.tsx`）

**统计与加载状态行**：
- 左侧：结果总数 / 分页信息（“共 N 部结果”）
- 右侧：加载时显示“实时更新中”动画

**内容网格**：
- 官方片库卡片（`MediaCard`，5–6 列，海报 + 标题 + 年份）或 聚合卡片（`AggregatedCard`）
- 加载时显示 `CatalogSkeleton`（与真实卡片 1:1 几何对齐）

**分页导航**（仅无搜索词时显示）：
- “第 X / Y 页”，页码按钮，支持跳页输入

**浮动回到顶部按钮**：右下角，平滑滚动

**空态**：频道下无影片或搜索无结果时，显示 🍿 图标 + “该频道下暂无影片” + “尝试清空筛选条件” / “尝试全网聚合直搜”按钮

---

### 3.3 播放页 `/watch`

**顶部自适应导航栏（sticky）**：
- 左侧：返回按钮 | 首页按钮
- 中间：视频标题（截断）+ 源名 + 第 X/Y 集
- 右侧操作组：主题切换 | 追剧单星标 | 跨屏接力二维码 | 下载本集 | 测速换源

**左主视区（1fr）**：
- 动态环境光影：海报模糊背景
- 播放器区域（ArtPlayer + hls.js，aspect-video）：
  - 控制：暂停/播放、快退/快进 ±5s、音量、倍速 0.5x~3.0x、全屏、影院模式切换
  - 无播放地址时：显示错误 + “立即切换至备用线路”按钮
  - 加载时：Spinner lg
- 视频信息与快捷控制栏：标题 | 源名标签 | 第 X 集（共 Y 集）+ 备注 | 上一集/下一集 | 影院宽屏切换 | 自动连播复选框
- 播放线路栏（水平滚动）：每条线路显示源名 + 延迟 ms + QoS 等级（绿/琥珀/红点）+ 当前/受阻标记 | “测速换源”按钮

**右侧栏（360–380px，桌面端固定；移动端折叠为底部选集栏）**：
- 剧集选集：百集分段折叠，当前集高亮，点击集数切换
- 本集看点：标题、简介、播出日期、时长
- 影片档案：导演、演员、类型、地区、备注、剧情简介（可展开折叠）
- 演职员探索图谱：头像小图 + 姓名
- 海报墙：点击海报切换主海报

**全宽“猜你喜欢”智能推荐专区**：卡片网格，基于当前分类推荐

**弹层**：
- `SwitchSourceModal`：完整测速与换源面板（源列表、延迟、QoS、集数）
- `QrHandoffModal`：跨屏接力二维码 + 当前播放时间 + 视频标题 + 集数
- `SpeedSuggestionDialog`：测速建议换源对话框
- `WatchFallbackState`：源失效时的兜底状态

**影院宽屏模式**：右侧栏收起，视区扩大至 84vh

---

### 3.4 历史页 `/history`

**页头**：返回箭头 | 标题“观看历史” | 总数（N） | （总数>0 时显示“清空历史”按钮）

**搜索栏**（总数>0 时显示）：搜索图标 | 输入框“搜索观看历史...” | 清空按钮

**列表区**：
- 空态：`EmptyState` “暂无观看记录”
- 提示：共 N 条记录，仅显示最近 50 条
- 历史记录列表，每条：
  - 缩略图（海报，加载失败显示占位图标）
  - 标题（截断）
  - 副标题：第 X/Y 集 · 播放时间 · 相对时间（如“3 小时前”）
  - 进度条（10%~95% 时显示百分比）
  - 删除按钮（悬停显示，点击后出现“撤销” toast）

**ConfirmDialog**（清空历史确认）：
- “清空全部观看历史？将删除 N 条记录，此操作不可撤销。” | [取消] [清空]

---

### 3.5 登录页 `/login`

**全屏背景**：流光装饰

**品牌区**：
- Logo (cl.tv)
- 标题：“登录您的账号” / “创建新账号”
- 副标题：“影院级超清影视探索平台 · 跨端云同步”

**卡片容器**（bg-surface-raised，rounded-2xl，阴影 shadow-xl）：
- 被顶号/下线提示（kickNotice，危险色条，如有）
- Tab 切换：“账号登录” | “邀请码注册”（切换时清空错误）
- 错误提示条（如有 errorMsg，danger 类型）
- 登录表单：账号名称输入框 | 登录密码输入框 | “立即登录”按钮（加载时显示 Spinner）
- 注册表单：注册邀请码输入框（placeholder: LTV-XXXX-XXXX）| 账号名称输入框（≥3 字符）| 设置密码输入框（≥6 字符）| 确认密码输入框 | “注册并登录”按钮
- 底部：“返回首页”链接 | 标语“自由观影 · 极速秒播”

---

### 3.6 设置页 `/settings`

**页头**：返回箭头 | 标题“设置”

**一级 Tab**：源管理 | 偏好设置 | 数据

**二级 Tab**（随一级变化）：
- 源管理：点播源 | 数据源订阅
- 偏好设置：播放与过滤 | 封面图加载 | 首页与内容
- 数据：配置导入导出

**点播源**：表格/卡片列表（源名 | API 地址 | 是否成人标签 | 勾选框参与搜索 | 操作编辑/删除） + 添加源表单（源名 | API 根地址 | 详情页地址 | 成人开关 | 搜索优先级 | 超时时间 | “添加源”按钮） + 删除后撤销 toast（5 秒）

**数据源订阅**：订阅列表（订阅名称 | 订阅 URL | 同步状态 | 上次同步时间 | 导入数量 | 操作同步/启停/删除） + 添加订阅（URL | 名称 | 按钮） + 订阅详情展开（同步统计分类）

**播放与过滤**：开关列表（自动连播 | 成人内容过滤 | 广告过滤）

**封面图加载**：单选按钮组（直连默认 | 代理 | 自定义代理 + 自定义代理地址输入框）

**首页与内容**：下拉选择（推荐数据源：豆瓣分类 / Bangumi 新番 / 影视周榜 / 百度实时榜 / 豆瓣 Top250 / 360热播 / 猫眼大盘 / 爱奇艺热榜 / 热门短剧）

**配置导入导出**：导出区（“导出配置”按钮 → 下载 JSON） + 导入区（文件选择输入 .json | “导入配置”按钮 → 覆盖或合并）

---

## 4. 图片加载与性能设计要点（来自 PRD-IMAGE-OPT.md）

| 要点 | 规范 |
|------|------|
| 骨架屏 | 所有海报位必填；加载中显示 `bg-slate-800/20` 或 `animate-pulse` 脉冲动画，固定 aspect-ratio，不留空白；Hero 轮播切换时保持占位 |
| 加载失败兜底 | 所有候选链耗尽后显示“封面加载失败”占位图，带轻微抖动提示（`FAILED_SHAKE_CLASS`），`aria-label` 说明失败原因；不影响卡片点击播放 |
| 渐进显示 | 图片加载完成后 `opacity-0 → opacity-100` 平滑淡入（`duration-300 ease-out`） |
| 尺寸与布局稳定性 | 所有海报卡片固定 aspect-ratio（电影 2:3、剧集 16:9），图片加载前后布局不抖动（CLS ≈ 0）；移动端与桌面端比例保持一致 |
| 加载策略 | 首屏图片 `loading='eager'`；非首屏图片 `loading='lazy'` + `IntersectionObserver`（rootMargin 200px） |
| 图片代理模式 | 遵循用户设置 `store.imageProxyMode`（direct/proxy/custom）与部署者默认值 `/api/status` `defaultImageMode` |
| 预加载（P2） | Hero 当前轮播图 `<link rel=preload>`；常用图片域 `dns-prefetch` / `preconnect` |

---

## 5. 交付确认清单（供 Lead、PM 与 QA 验收）

- [ ] 设计系统 Token：配色、字体、间距、圆角、阴影与 `tailwind.config.ts` 语义化变量对齐
- [ ] 全局组件：Button / Input / Spinner / Badge / Checkbox / Switch / Select / Tabs / Avatar 规范完整
- [ ] 状态反馈组件：Toast / ConfirmDialog / EmptyState / Alert 规范完整
- [ ] 图片与媒体组件：SmartImage / CatalogSkeleton / VideoPlayer / QRCode 规范完整（含骨架屏、失败兜底、渐进显示）
- [ ] 页面级组件：Header / SiteFooter / HeroCarousel / MediaCard / AggregatedCard / ChannelSwitcher / FilterPanel / EpisodeList / SourceBar / WatchFallbackState / SwitchSourceModal / QrHandoffModal / SpeedSuggestionDialog / LoginForm / SourceListPanel / SubscriptionPanel / PreferencePanel / ConfigIoPanel / HistoryList 规范完整
- [ ] 关键页面视觉说明：首页 / 片库页 / 播放页 / 历史页 / 登录页 / 设置页均有文字描述
- [ ] 图片优化要点：骨架屏、失败兜底、渐进显示、aspect-ratio、加载策略、图片代理模式均已覆盖
- [ ] 响应式与无障碍：移动端底部标签栏 / 筛选底部弹窗 / 播放器右侧栏折叠；aria-label / alt / 键盘 Tab / Esc / prefers-reduced-motion

---

**下一步**：UI 规范确认后，将三份交付物（`information-architecture.md`、`wireframes.md`、`ui-spec.md`）发送给 `fullstack-developer` 实施，同步提交 `lead` 审阅，并配合 `qa-engineer` 确认界面可测试点。