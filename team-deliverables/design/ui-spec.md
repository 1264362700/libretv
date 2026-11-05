# ui-spec.md — LibreTV v1.2 UI 视觉设计规范与 Design Tokens

**产品**：LibreTV (cl.tv) 流媒体与聚合视听平台  
**版本**：v1.2 (Gate 2 / R2 UI 设计交付)  
**设计角色**：UI/UX 设计师 (ui-ux-designer)  
**基准需求**：`team-deliverables/pm/iteration-plan.md` (Gate 1 方案 B 核心 6 项)  
**技术约束**：`team-deliverables/dev/tech-feasibility-assessment.md`  
**交付归属**：`team-deliverables/design/ui-spec.md`  
**生效日期**：2026-11-05  

---

## 0. 设计系统核心原则 (Core Aesthetics & Design Tokens)

LibreTV 遵循 **NovaTV Cinema Ultra Dark（影院级沉浸暗黑）** 与 **Apple visionOS / iOS Spatial Liquid Glass（空间液态毛玻璃）** 设计哲学：
1. **绝对聚焦视听本身**：深邃曜石基底搭配极细腻玻璃折射，绝无任何商业广告与侵入式干扰；
2. **高对比度与高信噪比**：以影院鎏金（Amber `#F59E0B`）为视觉动眼锚点，关键指标（延迟、画质、红点）一目了然；
3. **触控与桌面双端自如**：统一 Tailwind CSS 语义化 Tokens，组件具备健全的键盘可达性（Focus Ring）与触控阻尼动效。

---

## 1. Design Tokens 基础参数体系

### 1.1 色彩系统 (Semantic Colors & CSS Variables)

基于项目 `tailwind.config.ts` 与 `src/app/globals.css` 中声明的 CSS 变量体系，全面实行语义化绑定：

#### A. 核心空间背景与文本色阶（深色模式为主）

| Token 语义名 | CSS 变量名 | 深色模式色值 (Dark) | 浅色模式色值 (Light) | 用途说明 |
|:---|:---|:---|:---|:---|
| `bg-page` | `--c-page` | `rgb(11 15 25)` (`#0B0F19`) | `rgb(244 245 248)` (`#F4F5F8`) | 全局页面基底背景（曜石深空黑） |
| `bg-surface` | `--c-surface` | `rgb(19 27 42)` (`#131B2A`) | `rgb(255 255 255)` (`#FFFFFF`) | 毛玻璃面板容器基底色 |
| `bg-surface-raised` | `--c-surface-raised`| `rgb(26 36 56)` (`#1A2438`) | `rgb(255 255 255)` (`#FFFFFF`) | 提升浮层（侧栏、抽屉、弹窗） |
| `bg-card` | `--c-card` | `rgb(15 21 35)` (`#0F1523`) | `rgb(255 255 255)` (`#FFFFFF`) | 视频卡片底层基底 |
| `bg-chip` | `--c-chip` | `rgb(24 33 50)` (`#182132`) | `rgb(235 238 244)` (`#EBEEF4`) | 胶囊按钮、标签、未激活项底色 |
| `bg-hover` | `--c-hover` | `rgb(34 46 68)` (`#222E44`) | `rgb(226 230 239)` (`#E2E6EF`) | 悬停互动激活高亮底色 |
| `border-line` | `--c-line` | `rgb(45 58 82)` (`#2D3A52`) | `rgb(218 223 233)` (`#DADFE9`) | 1px 细微玻璃边框与分隔线 |
| `text-content` | `--c-content` | `rgb(248 250 252)` (`#F8FAFC`)| `rgb(15 23 42)` (`#0F172A`) | 主标题、首要阅读文本（冰晶白） |
| `text-muted` | `--c-muted` | `rgb(148 163 184)` (`#94A3B8`)| `rgb(71 85 105)` (`#475569`) | 次要描述、元数据、集数信息 |
| `text-faint` | `--c-faint` | `rgb(100 116 139)` (`#64748B`)| `rgb(100 116 139)` (`#64748B`)| 三级辅助文本、微弱占位说明 |

#### B. 品牌流光金与语义状态色阶

| Token 语义名 | CSS 变量名 | 深色模式标准值 | 浅色模式标准值 | 核心使用场景 |
|:---|:---|:---|:---|:---|
| `accent` | `--c-accent` | `rgb(245 158 11)` (`#F59E0B`)| `rgb(14 165 233)` (`#0EA5E9`) | 品牌主色、流光金进度条、选集高亮 |
| `accent-hover` | `--c-accent-hover` | `rgb(251 191 36)` (`#FBBF24`)| `rgb(2 132 199)` (`#0284C7`) | 按钮悬停激活鎏金色 |
| `on-accent` | `--c-on-accent` | `rgb(11 15 25)` (`#0B0F19`) | `rgb(255 255 255)` (`#FFFFFF`)| 流光金实体底色上的反白/反黑文字 |
| `danger` | `--c-danger` | `rgb(248 113 113)` (`#F87171`)| `rgb(220 38 38)` (`#DC2626`) | 追剧更新红点、移除、错误 Toast |
| `success` | `--c-success` | `rgb(52 211 153)` (`#34D399`)| `rgb(22 163 74)` (`#16A34A`) | QoS S级极速徽章、更新至最新集 |
| `warning` | `--c-warning` | `rgb(251 191 36)` (`#FBBF24`)| `rgb(217 119 6)` (`#D97706`) | 弱网自动降级提示、QoS B级徽章 |
| `info` | `--c-info` | `rgb(56 189 248)` (`#38BDF8`)| `rgb(14 165 233)` (`#0EA5E9`) | QoS A级良好徽章、常规换源提示 |

---

### 1.2 空间立体毛玻璃与光影阴影 Tokens

```css
/* 1. 空间液态毛玻璃面板 */
.glass-panel {
  background: rgba(19, 27, 42, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.5);
}

/* 2. iOS 空间微型悬浮胶囊 */
.ios-pill {
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.14);
}

/* 3. 影院光环发光阴影 */
.shadow-glow-gold {
  box-shadow: 0 0 20px -3px rgba(245, 158, 11, 0.45);
}
.shadow-glow-emerald {
  box-shadow: 0 0 15px -2px rgba(16, 185, 129, 0.4);
}
.shadow-cinema {
  box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.85);
}
```

---

### 1.3 圆角与层级 (Radius & z-index Ladder)

- **圆角规范**：
  - `rounded-lg` (8px)：选集数字网格按钮、字幕微调按钮、小标签；
  - `rounded-xl` (12px)：海报微卡片、抽屉内功能卡片、输入框、控制栏二级菜单；
  - `rounded-2xl` (16px)：全局面板、Hero 轮播浮层、弹窗主体；
  - `rounded-full` (9999px)：追剧/历史切换胶囊外框、红点、浮动快捷操作拉手。
- **全局 z-index 层级梯队**：
  - `z-0`：页面常规内容排版；
  - `z-10`：卡片内浮层标签（集数备注、相对时间、NEW 红点）；
  - `z-20`：首页 `ContinueWatchingRow` 横滑轨道（与 Hero 下边际叠加）、外挂字幕渲染层 `SubtitleLayer`；
  - `z-30`：播放器错误提示遮罩、播放控件主操作区；
  - `z-40`：Sticky 固定顶部玻璃导航栏 (`Header`)；
  - `z-50`：ArtPlayer 自带设置下拉菜单、工具提示 (Tooltip)；
  - `z-[70]`：QoS 线路雷达抽屉 (`QoSRadarDrawer`)、跨屏接力弹窗 (`QrHandoffModal`)、最优线路胶囊 (`SpeedSuggestionDialog`)；
  - `z-[80]`：全局消息通知系统 (`Toast`)。

---

## 2. 6 大核心功能组件状态矩阵 (Component State Matrix)

为确保全栈开发在 Gate 3 实现时界面交互严密无遗漏，下表详尽列出 6 项功能所有组件在各交互状态下的视觉表现：

### 2.1 画质切换控制项 (REQ-P0-01)

| 组件/状态 | Default (默认态) | Hover (悬停态) | Active / Selected (选中态) | Disabled (禁用态) | Loading (切换中) | Focus (键盘聚焦) |
|:---|:---|:---|:---|:---|:---|:---|
| **控制栏画质按钮** | `text-xs text-white/80 bg-white/10 px-2.5 py-1 rounded-lg` | `text-white bg-white/20` | `text-accent bg-accent/20 font-semibold` | 单码率时自动隐藏或不显示下拉三角 | `text-accent animate-pulse` 显示 `切画质...` | `ring-2 ring-accent/60 outline-none` |
| **画质下拉列表项** | `text-xs text-white/90 px-3 py-2 rounded-md flex items-center justify-between` | `bg-white/10 text-white` | `bg-accent/20 text-accent font-bold` 左侧带 `✓` 图标 | 不支持的码率项不渲染 | — | `bg-white/15 text-white` |
| **弱网保护 Toast** | — | — | `bg-surface-raised border border-warning/40 text-warning px-3 py-1.5 rounded-xl shadow-lg` | — | — | — |

### 2.2 多语言音频轨道子菜单项 (REQ-P0-02)

| 组件/状态 | Default (默认态) | Hover (悬停态) | Active / Selected (选中态) | Disabled (单音轨场景) | Loading (切换缓冲) | Focus (键盘聚焦) |
|:---|:---|:---|:---|:---|:---|:---|
| **设置面板音轨项** | `text-xs text-content px-3 py-2.5 rounded-lg flex items-center justify-between` | `bg-hover text-content` | `text-accent font-semibold` 呈现 `✓` 标与流光金色 | 单音轨时设置菜单内自适应隐藏该子项 | `text-muted` 显示 `正在无缝切音轨...` (≤800ms) | `ring-2 ring-accent/50 outline-none` |
| **音轨切换指示胶囊** | — | — | `px-2 py-0.5 rounded bg-black/70 text-accent text-[11px]` | — | — | — |

### 2.3 1000 集长剧虚拟网格选集组件 (REQ-P0-03)

| 组件/状态 | Default (默认态) | Hover (悬停态) | Active / Playing (当前播放集) | Disabled (不可播放) | Loading (初始挂载) | Focus (键盘焦点) |
|:---|:---|:---|:---|:---|:---|:---|
| **百集区间锚点胶囊** | `text-[11px] font-medium px-2.5 py-1 rounded-md bg-chip/50 text-muted` | `bg-hover text-content` | `bg-accent/15 text-accent border border-accent/40 font-semibold` | — | `opacity-60` 骨架淡入 | `ring-2 ring-accent/50` |
| **单集网格按钮 (虚拟)** | `h-9 text-xs font-medium rounded-lg bg-chip/60 text-content border border-line/50` | `bg-hover border-accent/40 text-accent` | `bg-accent text-on-accent font-bold border-accent shadow-glow-gold` | `opacity-30 cursor-not-allowed` | `animate-pulse bg-chip/40` | `ring-2 ring-accent ring-offset-1 ring-offset-page` |
| **正序/倒序切换按钮** | `text-xs text-muted px-2 py-1 rounded-md bg-surface border border-line/60` | `text-content bg-hover` | 图标旋转 180° 并即时逆转数据索引序列 | 仅 1 集时长效置灰禁用 | — | `ring-2 ring-accent/50` |

### 2.4 首页“我的追剧·最近更新”组件 (REQ-P0-04)

| 组件/状态 | Default (默认态) | Hover (悬停态) | Active / Click (点击态) | Empty (追平或为空) | Loading (比对中) | Focus (键盘聚焦) |
|:---|:---|:---|:---|:---|:---|:---|
| **选项卡切换胶囊** | `text-xs font-semibold px-3 py-1 rounded-lg text-muted` | `text-content` | `bg-accent text-on-accent shadow-sm` | — | — | `ring-2 ring-accent/40` |
| **更新红点呼吸角标** | `bg-rose-600/95 text-white text-[10px] font-bold px-2 py-0.5 rounded-md animate-pulse` | 放大 1.05 倍微交互 | 瞬间反馈 | 无更新时切换为 `★ 追剧中` 琥珀色微角标 | — | — |
| **追剧海报卡片** | `w-[152px] rounded-xl bg-surface border border-line/60 overflow-hidden` | `border-accent/60 shadow-xl -translate-y-1` | 点击瞬间缩放 0.98x，直接直通播放页 | 两者皆为空时，专区高度优雅坍缩为 0 | 骨架屏占位不跳变 | `ring-2 ring-accent` |
| **单条快捷移出按钮** | 默认透明隐藏 (`opacity-0`) | 卡片悬停时浮现 `opacity-100 bg-black/70 hover:bg-rose-600` | 触发淡出，弹出带 5 秒撤销的 Toast | — | — | 获得焦点时强制显示 |

### 2.5 QoS 线路监控雷达抽屉与秒切组件 (REQ-P0-05)

| 组件/状态 | Default (默认态) | Hover (悬停态) | Active / Selected (当前源) | Disabled (缺集不可切) | Loading (测速探针中) | Focus (键盘聚焦) |
|:---|:---|:---|:---|:---|:---|:---|
| **一键秒切 Banner** | `p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between` | `bg-emerald-500/15 border-emerald-500/50` | 点击后在 ≤ 1.5s 内切源完成并弹出 Toast | 无更快源时折叠或提示“当前已是最优” | 测速期间禁用按钮 | `ring-2 ring-emerald-500` |
| **极速源秒切按钮** | `btn-primary text-xs px-3 py-1.5 flex items-center gap-1` | `bg-emerald-400 text-slate-950` | 触发无缝换源，保持当前秒数 | 集数不足当前集时 `disabled:opacity-40` 文案 `缺集` | `Spinner sm` 旋转 | `ring-2 ring-accent` |
| **线路雷达卡片** | `p-3 rounded-xl bg-surface border border-line/60 flex items-center justify-between` | `border-accent/40 bg-hover` | `border-accent bg-accent/5` 标明 `[当前播放中]` | 熔断态：呈现警告红框与冷却倒计时 | 延迟处展示蓝色脉冲呼吸点 | `ring-2 ring-accent/50` |
| **重新测速按钮** | `btn-ghost text-xs px-3 py-1.5 flex items-center gap-1` | `bg-hover text-content` | 图标旋转 360° 发起并发探活 | 60 秒内防刷节流置灰 | 图标持续旋转 | `ring-2 ring-accent/40` |

### 2.6 外挂字幕阶梯微调胶囊 (REQ-P1-01)

| 组件/状态 | Default (默认态) | Hover (悬停态) | Active / Press (点击步进) | Disabled (未载入字幕) | Focus (键盘聚焦) |
|:---|:---|:---|:---|:---|:---|
| **阶梯微调按钮 (±0.5s~±2.5s)** | `px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-mono text-white/90` | `bg-white/25 text-white` | 按压缩放 0.95x，字幕立即位移（≤50ms），中央弹出偏移提示 | 未挂载字幕时整层不渲染 | `ring-1 ring-accent` |
| **一键归零重置按钮** | `px-2 py-0.5 rounded text-[10px] text-accent/80 hover:text-accent hover:bg-accent/15` | `text-accent font-semibold` | 偏移归零并清空 localStorage 偏移键 | — | `ring-1 ring-accent` |

---

## 3. 响应式断点与行为适配规则 (Responsive Breakpoints)

LibreTV 遵循 Tailwind CSS 标准断点阶梯：

```
Breakpoint Matrix:
├─ Mobile:       < 640px    (基准视口，垂直单列堆叠，底部半屏抽屉)
├─ Tablet (sm):  640px      (小平板，横滑卡片尺寸自适应微增)
├─ Medium (md):  768px      (中型设备，顶部导航展开完整分类)
├─ Desktop (lg): 1024px     (标准桌面，播放页左右双栏，侧栏常驻，右侧滑出抽屉)
└─ Cinema (xl):  1280px+    (宽屏影院，1fr 主视区 + 380px 固定侧栏)
```

### 3.1 核心功能在各断点下的行为定义

| 功能模块 | 移动端 (< 768px / Mobile) | 桌面端 (≥ 1024px / Desktop) |
|:---|:---|:---|
| **首页追剧专区** | 卡片宽度 `w-[132px]`，单行水平触控手势滑动，右侧露出 1/3 卡片引导横滑；隐藏翻页左右箭头按钮。 | 卡片宽度 `w-[164px]`，展示右上角 `[‹] [›]` 平滑滚动操作按钮与悬停遮罩高亮。 |
| **长剧虚拟选集** | 折叠在移动端底部选集抽屉中，**6 列网格紧凑排列**，视口高度 `55vh`，触控阻尼自然。 | 常驻于播放页右侧栏 `WatchSidebar`，**4 列网格标准排列**，视口高度 `max-h-[38vh]`，支持键盘方向键与快捷键切集。 |
| **QoS 监控雷达** | 采用**底部半屏升起抽屉 (Bottom Sheet)**，高度 `72vh`，顶部配备下拉触控手柄，支持向下快速滑动关闭。 | 采用**右侧固定滑出抽屉 (Right Drawer)**，宽度 `440px`，左侧半透明遮罩点击关闭，背景视频画面正常播放。 |
| **画质与音轨菜单** | 点击呼出系统级 iOS Liquid Glass 底部单选操作板，避免在大拇指操作盲区弹出微型菜单。 | 点击在控制条按钮正上方弹出半透明毛玻璃浮层菜单，鼠标移出或点击空白处关闭。 |
| **字幕微调胶囊** | 右上角紧凑微调栏，仅展示 `[-0.5s]`、`[+0.5s]` 与 `[重置]`，节省画面空间。 | 完整呈现全部 6 档阶梯按钮 (`±0.5s`, `±1.0s`, `±2.5s`) 与字幕文件名。 |

---

## 4. 动效与触控微交互规范 (Animations & Micro-interactions)

为营造高品质影院质感，所有过渡动效均采用物理阻尼曲线：

```css
/* 1. 抽屉平滑滑入曲线 */
animation: slide-in-right 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;

/* 2. 状态弹跳提示 */
animation: bounce-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;

/* 3. 追剧新集红点呼吸 */
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.75; transform: scale(0.96); }
}

/* 4. 流光进度条 */
@keyframes shimmer-gold {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

- **无障碍降级保护**：当检测到用户的操作系统开启了减弱动效偏好（`@media (prefers-reduced-motion: reduce)`）时，所有 `animate-pulse`、`bounce-pop` 与 `shimmer` 动效立即自动降级为静态平稳呈现，杜绝引起视觉不适。