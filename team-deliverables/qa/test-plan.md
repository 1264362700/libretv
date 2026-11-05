# LibreTV v1.2 核心特性迭代测试计划 (Test Plan)

**产品**：LibreTV 现代化跨端影视聚合平台  
**版本**：v1.2 (Core Enhancements & Performance Leap)  
**技术栈**：Next.js 15 (App Router) + TypeScript 5 + Tailwind CSS + Artplayer + Hls.js + @tanstack/react-virtual + Dexie.js  
**QA 负责人**：QA / 测试工程师 (qa-engineer)  
**协同角色**：产品经理 (PM)、UI/UX 设计师 (UI)、全栈开发工程师 (Dev)  
**基准规范**：
- `team-deliverables/pm/iteration-plan.md` (Gate 1 用户裁决方案 B)
- `team-deliverables/design/ui-spec.md` & `team-deliverables/design/ui-walkthrough-checklist.md`
- `team-deliverables/dev/tech-feasibility-assessment.md`
- 目标特性分支：`feature/v1.2-core-enhancements`

---

## 1. 测试目标与战略

1. **功能完备度检验**：针对 Gate 1 用户明确裁决采纳的方案 B（6 项核心功能）进行 100% 覆盖率的系统性验收。
2. **极速与平滑体验验真**：验证虚拟化滚动渲染负载（DOM 节点严格受控 $\le 60$）、HLS 画质/音轨热切无黑屏无断流、QoS 抽屉秒级切源与 60s 节流。
3. **极端边界防御与容错 (Loop-until-dry)**：
   - 弱网极端场景下，画质手动锁定遭遇 3 次卡顿自动回退至 Auto；
   - 候选源集数不足时触发缺集硬门禁拦截，阻断劣质源切换；
   - 单码率与单音轨源自适应隐藏冗余菜单；
   - 异常备注文本与倒退集数不触发伪红点；
   - 外挂字幕跨集/按剧本地独立持久化与毫秒级防抖。
4. **质量门禁准出控制**：严格执行 TypeScript 编译零报错、全量自动化测试（Vitest 38 套件 / 389 用例）100% Pass，出具正式质量放行报告。

---

## 2. 测试范围与模块拆解

### 2.1 本版本重点测试范围 (v1.2 Core Enhancements)

| 功能编号 | 需求项 | 关键模块 / 路径 | 核心验证重点 | 优先级 |
|:---|:---|:---|:---|:---:|
| **REQ-P0-01** | HLS 视频多画质选择与锁定 | `src/features/player/use-hls-pipeline.ts`<br>`src/components/player-shell.tsx` | - 多档位分辨率人眼友好标签格式化（4K/2K/1080P/720P/480P/360P/码率）<br>- 本地存储画质偏好记忆与自动匹配<br>- 单码率源控制栏/设置项自适应隐藏<br>- 弱网卡顿（$\ge 3$ 次）自适应降级回退至 Auto | **P0** |
| **REQ-P0-02** | 内置多语言音频轨道无缝切换 | `src/features/player/use-hls-pipeline.ts`<br>`src/components/player-shell.tsx` | - 多音轨清单解析与名称提取<br>- 无缝平滑热切（无缓冲雪崩、无音画不同步）<br>- 单音轨源自适应隐藏音轨设置菜单 | **P0** |
| **REQ-P0-03** | 1000 集长剧虚拟网格滚动 | `src/features/watch/watch-sidebar.tsx`<br>`src/features/player/v12-core-features.test.ts` | - @tanstack/react-virtual 一维行虚拟滚动，行高 40px，overscan: 2<br>- 桌面端 4 列 / 移动端 6 列响应式布局<br>- 真实 DOM 节点数恒定 $\le 60$ 个，杜绝千集卡顿<br>- $>40$ 集自动生成百集快速锚点胶囊（1-100, 101-200）<br>- 当前播放集与百集锚点激活态同步居中 | **P0** |
| **REQ-P0-04** | 首页“我的追剧·最近更新”动态流 | `src/app/page.tsx`<br>`src/components/continue-watching-row.tsx`<br>`src/lib/db.ts` | - 视觉专区精确锚定于 Hero 巨幕下方、推荐流上方<br>- 「继续观看」与「我的追剧」双胶囊 Tab 切换<br>- 结合主采集源 remarks 实时计算最新集数与更新差额<br>- 点亮「🔴 更新 N 集 · 至 M 集」智能红点角标<br>- 倒退集数/无效备注防误判防御 | **P0** |
| **REQ-P0-05** | 播放线路 QoS 综合监控雷达抽屉 | `src/features/watch/qos-radar-drawer.tsx`<br>`src/features/watch/watch-sidebar.tsx` | - 半屏侧滑 Drawer（桌面 440px / 移动 72vh），背景视频正常播放<br>- 复用已测速延迟与 EWMA 指标，按延迟升序动态排序<br>- 极速源一键秒切 Banner（提速 $\ge 30\%$ 且不缺集时触发）<br>- 缺集硬门禁：已知总集数 $\le$ 当前播放 index 时强制禁用切换<br>- 60 秒测速防刷节流保护与 Esc 快捷关闭 | **P0** |
| **REQ-P1-01** | 外挂字幕毫秒级步进与按剧持久化 | `src/features/player/use-subtitle-track.ts`<br>`src/features/player/subtitle-layer.tsx` | - 播放时间点驱动字幕渲染与高清双重阴影描边<br>- 多档阶梯微调（$\pm0.5\text{s}, \pm1.0\text{s}, \pm2.5\text{s}$）与一键归零<br>- 基于剧集唯一标识 `showKey` 本地独立持久化记忆<br>- 切集/跨页面自动延续该剧历史偏移 | **P1** |

### 2.2 存量功能回归范围 (Regression Scope)

| 模块 | 回归要点 | 重点关注 |
|:---|:---|:---|
| 全站鉴权与 SSRF | 登录拦截、未登录播放重定向、SSRF 内网阻断 | 接口 100% 鉴权，SSRF 拒绝内网字面量 |
| 播放核心管线 | 断路器熔断（3 连败 Open、Half-Open）、片段缓存、广告过滤 | 核心逻辑不发生回归 |
| 图片加载优化 | 骨架屏全时覆盖、eager/priority 加载、代理模式降级 | LCP $\le 2\text{s}$，CLS $\approx 0$ |

---

## 3. 测试环境与设备矩阵

| 环境维度 | 配置参数 | 用途与说明 |
|:---|:---|:---|
| **操作系统** | macOS Sequoia (15.x) / Linux (Ubuntu 22.04 LTS) | 开发机与 CI/CD 构建验证 |
| **Node.js 运行时** | v24.21.0 / v22.x LTS (兼容 `.nvmrc` 声明) | 确保无任何 ESM/CJS 破坏性运行时差异 |
| **测试框架** | Vitest v2.1.9 + Testing Library | 自动化单元测试与边界测试执行 |
| **桌面端视口** | 1920 × 1080 (FHD), 1440 × 900 (MacBook), 1280 × 800 | 验证 4 列长剧选集、QoS 抽屉 440px 侧滑 |
| **移动端视口** | 390 × 844 (iPhone 14/15), 375 × 667 (iPhone SE) | 验证 6 列长剧选集、QoS 抽屉 72vh 底部拉起 |
| **网络模拟条件** | - 正常千兆局域网/宽带<br>- 4G (1.5 Mbps, RTT 150ms)<br>- 弱网/重度抖动 (300 kbps, 5% 丢包，连续 bufferStalledError) | 验证弱网画质自动降级与断路器容错 |

---

## 4. 测试方法与阶段策略 (Loop-until-dry)

```
[阶段一: 静态类型与规范检测]
  ├── npx tsc --noEmit (类型严格推导，零 any 泄漏)
  └── npm run lint (ESLint 零错误零警告)
        ↓
[阶段二: 核心算法与边界单元测试]
  ├── Vitest 全量套件 (38 files / 389 tests)
  └── v1.2 专项用例 (formatQualityLabel, buildEpisodeRows, speedupPercent, isMissingEpisode)
        ↓
[阶段三: 交互与边界防御验真]
  ├── 弱网画质自适应回切 (3 次卡顿降级 Auto)
  ├── 缺集线路硬门禁拦截 (禁用不可用线路)
  └── 虚拟滚动 DOM 节点深度审计 (<= 60 节点)
        ↓
[阶段四: UI 双轨走查对齐]
  └── 对齐 UI/UX Checklist (色彩规范、间距、微胶囊、无缝续播红点)
        ↓
[阶段五: 质量放行审批]
  └── 出具正式 release-report.md (准予发布)
```

---

## 5. 准入与准出标准 (Gate Criteria)

### 5.1 提测准入标准 (Entry Gate)
1. 产品经理 Gate 1 用户裁决授权确认（方案 B 范围锁定）；
2. UI/UX 设计师 Gate 2 视觉走查 Checklist 与测试稿已交付；
3. 开发人员在从 master 切出的 `feature/v1.2-core-enhancements` 分支完成编码；
4. 提交记录完全符合 Conventional Commits 规范。

### 5.2 版本准出标准 (Exit Gate)
1. **静态代码质量**：`npx tsc --noEmit` 0 错误；`npm run lint` 0 错误；
2. **自动化测试**：全量自动化测试（38 套件，389 个用例）全部通过（100% Pass）；
3. **6 项核心功能边界达标**：
   - 弱网画质 3 次卡顿自动回切 Auto 验证无误；
   - 单码率/单音轨源冗余控件自适应隐藏；
   - 1000 集长剧选集虚拟化 DOM 节点严格 $\le 60$；
   - 缺集源秒切硬拦截门禁生效；
   - 外挂字幕按剧独立本地持久化记忆生效；
   - 首页追剧动态流红点集数差额计算准确，无负差额与误触；
4. **缺陷清零**：P0 / P1 缺陷全部清零（0 Open Defects）；
5. **交付物完备**：测试计划、测试用例、放行报告与交接报告全部归档。