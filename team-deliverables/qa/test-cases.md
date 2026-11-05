# LibreTV 测试用例

**产品**：LibreTV / cl.tv 视频聚合播放平台  
**版本**：v1.0（草稿）  
**基准**：`PRD.md`、`PRD-IMAGE-OPT.md`、源码  
**优先级定义**：P0 = 核心流程，必须通过；P1 = 重要增强；P2 = 未来迭代（本版不验证）  
**执行状态**：Pass / Fail / Blocked / Not Run / Skipped

---

## 1. 登录页（`/login`）—— P0

| 用例 ID | 标题 | 前置条件 | 操作步骤 | 预期结果 | 优先级 | 执行状态 |
|---------|------|----------|----------|----------|--------|----------|
| TC-LOGIN-01 | 未设置 PASSWORD 时，访问任何页提示管理员配置密码 | 环境未设置 PASSWORD | 访问任意页面 | 提示管理员配置密码，无法正常使用站点 | P0 | Not Run |
| TC-LOGIN-02 | 正确账号密码登录成功，跳转 redirect 或首页 | 已设置 PASSWORD=libretv123，默认用户名 admin | 访问 `/login`，输入 admin / libretv123，点击登录 | 登录成功，跳转首页 `/`（或 redirect 参数指定页） | P0 | Not Run |
| TC-LOGIN-03 | 带 redirect 参数登录后回跳 | 已登录态可用 | 访问 `/watch?id=xxx` 未登录，被跳转 `/login?redirect=/watch?id=xxx`；登录成功 | 自动跳回 `/watch?id=xxx` 并继续播放流程 | P0 | Not Run |
| TC-LOGIN-04 | 错误密码登录，显示错误提示 | 已设置 PASSWORD | 输入 admin / 错误密码，点击登录 | 显示“登录失败，请检查账号密码”错误条，未跳转 | P0 | Not Run |
| TC-LOGIN-05 | 注册：邀请码为空给出校验提示 | 可用邀请码 | 切换到注册 Tab，邀请码为空，其余填写有效，点击注册 | 提示“请输入注册邀请码”，阻止注册 | P0 | Not Run |
| TC-LOGIN-06 | 注册：账号<3 字符给出校验提示 | 可用邀请码 | 填写邀请码，账号输入 2 字符，其余有效，点击注册 | 提示“账号名称至少需 3 个字符”，阻止注册 | P0 | Not Run |
| TC-LOGIN-07 | 注册：密码<6 字符给出校验提示 | 可用邀请码 | 填写邀请码、有效账号，密码 5 字符，点击注册 | 提示“密码长度不能少于 6 位”，阻止注册 | P0 | Not Run |
| TC-LOGIN-08 | 注册：两次密码不一致给出校验提示 | 可用邀请码 | 填写邀请码、有效账号，两次密码不一致，点击注册 | 提示“两次输入的密码不一致”，阻止注册 | P0 | Not Run |
| TC-LOGIN-09 | 注册成功后自动登录并跳转 | 可用未使用的邀请码 | 填写有效邀请码、账号≥3、密码≥6、两次一致，点击注册 | 注册成功，自动登录，跳转 redirect 或首页 | P0 | Not Run |
| TC-LOGIN-10 | 已登录用户访问 `/login`，自动跳回首页 | 已登录 | 访问 `/login` | 自动跳回首页 `/` | P0 | Not Run |
| TC-LOGIN-11 | 登录/注册 Tab 切换时清空错误 | 已打开登录页 | 在登录模式下输入错误并显示错误条，切换到注册 Tab | 错误条被清空 | P0 | Not Run |
| TC-LOGIN-12 | URL 携带 kickNotice 时展示危险提示条 | 会话被顶号 | 访问 `/login?kickNotice=您的账号已在其他设备登录...` | 页面顶部展示危险提示条，文案与 kickNotice 一致 | P0 | Not Run |

---

## 2. 首页（`/`）—— P0

| 用例 ID | 标题 | 前置条件 | 操作步骤 | 预期结果 | 优先级 | 执行状态 |
|---------|------|----------|----------|----------|--------|----------|
| TC-HOME-01 | Hero 轮播在 3 秒内加载并显示 6 部官方趋势大片 | 已登录，TMDB API 可达 | 打开首页 | 3 秒内 Hero 轮播显示 6 部官方趋势大片卡片 | P0 | Not Run |
| TC-HOME-02 | Hero 轮播点击卡片进入播放页 | 已登录 | 点击 Hero 轮播任意卡片 | 跳转播放页 `/watch`，携带标题/年份等参数 | P0 | Not Run |
| TC-HOME-03 | 左图右榜双栏楼层展示 | 已登录 | 打开首页 | 左侧推荐内容卡片，右侧热播榜单，布局正常 | P0 | Not Run |
| TC-HOME-04 | 输入有效关键词，TMDB 官方搜索 2 秒内出现卡片网格 | 已登录，TMDB API 可达 | 在搜索框输入有效关键词（如“电影”） | 2 秒内出现官方搜索结果卡片网格，含海报、剧名、评分、年份 | P0 | Not Run |
| TC-HOME-05 | 展开底层采集源深度扫描，各源结果逐条流式出现，坏源不阻塞好源 | 已登录，有可用采集源 | 点击“展开底层采集源深度扫描” | 各源结果逐条流式出现，坏源超时/失败不阻塞好源结果 | P0 | Not Run |
| TC-HOME-06 | 未登录点击播放跳转 `/login?redirect=` | 未登录 | 未登录状态点击任意卡片播放 | 跳转 `/login?redirect=/watch?...`，登录后回跳播放页 | P0 | Not Run |
| TC-HOME-07 | 成人过滤开启时，搜索结果不包含 isAdult 源结果 | 已登录，设置页开启成人过滤 | 开启成人过滤后，在首页搜索 | 搜索结果中不包含标记为 isAdult 的源结果 | P0 | Not Run |
| TC-HOME-08 | 源选择：用户勾选参与搜索的源 | 已登录 | 在设置页勾选/取消勾选源，返回首页搜索 | 仅勾选的源参与搜索，未勾选的源不参与 | P0 | Not Run |
| TC-HOME-09 | 首屏 Hero 当前图片 eager 加载 + 骨架屏兜底 | 已登录 | 打开首页，观察 Hero 轮播位 | 当前图片立即加载，加载期间显示骨架屏，无空白 | P0（图片优化） | Not Run |
| TC-HOME-10 | 首屏卡片海报 eager 加载 + 骨架屏兜底 + 平滑淡入 | 已登录 | 打开首页，观察首屏卡片网格 | 首屏卡片海报 eager 加载，加载前显示骨架屏，完成后 opacity-0→opacity-100 平滑淡入 | P0（图片优化） | Not Run |
| TC-HOME-11 | 非首屏卡片懒加载（loading=lazy + IntersectionObserver 200px） | 已登录 | 快速滚动首页，观察非首屏图片 | 非首屏图片仅在进入视口附近 200px 时加载，不抢占首屏带宽 | P1（图片优化） | Not Run |
| TC-HOME-12 | 图片加载失败兜底占位 + 抖动提示 | 已登录，图片地址失效 | 加载一张失效的图片 | 所有候选链耗尽后显示兜底占位 + 抖动提示，不展示破损图标，卡片仍可点击播放 | P0（图片优化） | Not Run |
| TC-HOME-13 | 图片代理模式切换（direct/proxy/custom）在首页生效 | 已登录 | 在设置页切换封面图加载模式，返回首页 | 首页图片加载方式随设置变化，遵循用户/部署者设置 | P0（图片优化） | Not Run |
| TC-HOME-14 | 海报位固定 aspect-ratio，图片加载前后无布局抖动（CLS≈0） | 已登录 | 打开首页，观察海报位 | 图片加载前后布局不抖动，海报位比例固定（电影 2:3、剧集 16:9） | P0（图片优化） | Not Run |
| TC-HOME-15 | 首屏 LCP 图片加载时间 ≤ 3s（4G/WiFi） | 已登录 | 打开首页，测量 LCP | 首屏 LCP 图片加载时间 ≤ 3 秒 | P0（图片优化） | Not Run |

---

## 3. 片库页（`/catalog`）—— P0

| 用例 ID | 标题 | 前置条件 | 操作步骤 | 预期结果 | 优先级 | 执行状态 |
|---------|------|----------|----------|----------|--------|----------|
| TC-CATALOG-01 | 切换频道，页面标题/副标题/图标/筛选维度随频道变化 | 已登录 | 切换电影/电视剧/动漫/综艺/纪录片频道 | 页面标题、副标题、图标、可用筛选维度随频道变化 | P0 | Not Run |
| TC-CATALOG-02 | 选择地区/类型/年份后，片库卡片列表重新加载并反映筛选条件 | 已登录 | 选择地区、类型、年份 | 卡片列表重新加载，反映筛选条件 | P0 | Not Run |
| TC-CATALOG-03 | 筛选条件持久化到 URL | 已登录 | 选择筛选条件后查看 URL | URL 包含筛选参数（currentRegion/currentGenre/currentYear/currentSort） | P0 | Not Run |
| TC-CATALOG-04 | 输入关键词点击“深搜”，显示横幅与结果计数 | 已登录 | 在当前频道输入关键词，点击“深搜” | 显示“正在【频道】全库深度搜索”横幅与结果计数 | P0 | Not Run |
| TC-CATALOG-05 | “切换为全网聚合直搜”功能 | 已登录 | 点击“切换为全网聚合直搜” | 切换到全网聚合搜索模式 | P0 | Not Run |
| TC-CATALOG-06 | 热门搜索词点击直接搜索 | 已登录 | 点击每频道展示的热门搜索词 | 直接执行该关键词搜索 | P0 | Not Run |
| TC-CATALOG-07 | 官方片库卡片支持分页 | 已登录 | 浏览官方片库卡片 | 支持分页，显示当前页/总页数 | P0 | Not Run |
| TC-CATALOG-08 | 聚合卡片展示底层采集源聚合结果 | 已登录 | 查看聚合卡片区域 | 展示底层采集源聚合结果，以聚合卡片形式 | P0 | Not Run |
| TC-CATALOG-09 | 未登录点击卡片跳转登录页并携带 redirect | 未登录 | 未登录点击片库卡片 | 跳转登录页并携带 redirect 参数 | P0 | Not Run |
| TC-CATALOG-10 | 分页点击后 URL 更新并保持筛选条件，刷新不丢失筛选状态 | 已登录 | 点击分页，刷新页面 | URL 更新并保持筛选条件，刷新后筛选状态不丢失 | P0 | Not Run |

---

## 4. 播放页（`/watch`）—— P0

| 用例 ID | 标题 | 前置条件 | 操作步骤 | 预期结果 | 优先级 | 执行状态 |
|---------|------|----------|----------|----------|--------|----------|
| TC-WATCH-01 | 播放页打开后自动拉取详情并开始播放首集 | 已登录，有可用源 | 进入播放页 | 自动拉取详情，开始播放首集；若当前源无播放地址，显示“立即切换至备用线路”按钮 | P0 | Not Run |
| TC-WATCH-02 | 多源测速面板显示各源名称、延迟、QoS 等级 | 已登录 | 播放页打开测速面板 | 显示各源名称、延迟、QoS 等级，点击任意源立即切换并继续播放 | P0 | Not Run |
| TC-WATCH-03 | 播放中线路异常，5 秒内自动切换备用线路 | 已登录，有多条线路 | 播放中模拟当前线路异常 | 5 秒内自动切换至下一条高速线路，不中断观看，保留进度 | P0 | Not Run |
| TC-WATCH-04 | 切换集数后 URL 参数 index 更新，页面不刷新，新集自动加载 | 已登录，多集剧集 | 切换集数 | URL 参数 index 更新，页面不刷新，新集自动加载 | P0 | Not Run |
| TC-WATCH-05 | 点击“加入追剧单”后星标变为填充状态 | 已登录 | 点击“加入追剧单” | 星标变为填充状态 | P0 | Not Run |
| TC-WATCH-06 | 该剧有新集时首页出现红点提醒 | 已登录，已追剧 | 该剧更新新集 | 首页出现红点提醒 | P0 | Not Run |
| TC-WATCH-07 | 刷新播放页后，视频从上次停留位置续播（误差<2秒） | 已登录，有观看进度 | 播放至某进度，刷新页面 | 从上次停留位置续播，误差<2秒 | P0 | Not Run |
| TC-WATCH-08 | 点击“跨屏接力”生成二维码，扫码后从相同时间点续播 | 已登录 | 点击“跨屏接力” | 生成二维码，扫码后在另一设备打开对应 URL 从相同时间点续播 | P0 | Not Run |
| TC-WATCH-09 | 点击“下载本集”进入下载队列，支持 MP4 格式 | 已登录 | 点击“下载本集” | 进入下载队列，支持 MP4 格式，下载完成后可在下载管理页查看 | P0 | Not Run |
| TC-WATCH-10 | 未登录直接访问 `/watch`，跳转 `/login?redirect=/watch?...` | 未登录 | 直接访问 `/watch` | 跳转 `/login?redirect=/watch?...` | P0 | Not Run |
| TC-WATCH-11 | 剧集简介 / 演职员显示（官方元数据优先，采集源数据兜底） | 已登录 | 打开播放页，查看简介与演职员 | 展示导演、演员、剧情、海报墙，官方元数据优先，采集源数据兜底 | P0 | Not Run |
| TC-WATCH-12 | 影院宽屏模式：收起右侧选集栏，视区扩大 | 已登录 | 点击影院宽屏模式 | 收起右侧选集栏，视区扩大 | P0 | Not Run |
| TC-WATCH-13 | 倍速 0.5x~3.0x 与键盘快捷键 | 已登录 | 调整倍速，使用键盘快捷键 | 支持 0.5x~3.0x 倍速，键盘快捷键正常 | P0 | Not Run |
| TC-WATCH-14 | 选集列表支持百集分段折叠，点击集数切换 | 已登录，百集剧集 | 查看选集列表 | 支持百集分段折叠，点击集数切换 | P0 | Not Run |

---

## 5. 历史页（`/history`）—— P1

| 用例 ID | 标题 | 前置条件 | 操作步骤 | 预期结果 | 优先级 | 执行状态 |
|---------|------|----------|----------|----------|--------|----------|
| TC-HISTORY-01 | 按时间倒序显示最近 50 条记录 | 已有观看历史 | 打开历史页 | 按时间倒序显示最近 50 条记录，超出部分可通过搜索查找 | P1 | Not Run |
| TC-HISTORY-02 | 每条记录显示进度条（10%~95% 显示百分比） | 已有观看历史 | 查看历史列表 | 每条记录显示进度条，观看进度 >10% 且 <95% 时显示百分比 | P1 | Not Run |
| TC-HISTORY-03 | 历史搜索按标题关键词过滤 | 已有观看历史 | 输入搜索关键词 | 列表实时过滤匹配标题的记录 | P1 | Not Run |
| TC-HISTORY-04 | 删除单条记录，出现“已删除”提示并提供 5 秒撤销 | 已有观看历史 | 点击“删除”单条记录 | 出现“已删除”提示并提供 5 秒“撤销”入口，撤销后记录恢复 | P1 | Not Run |
| TC-HISTORY-05 | 清空历史，确认后全部删除，显示“暂无观看记录” | 已有观看历史 | 点击“清空历史”并确认 | 全部记录删除，显示“暂无观看记录” | P1 | Not Run |
| TC-HISTORY-06 | 点击记录跳转播放页并从上次进度续播 | 已有观看历史 | 点击任意记录 | 跳转 `/watch?source=...&id=...&index=...` 并从上次进度续播 | P1 | Not Run |

---

## 6. 设置页（`/settings`）—— P1

| 用例 ID | 标题 | 前置条件 | 操作步骤 | 预期结果 | 优先级 | 执行状态 |
|---------|------|----------|----------|----------|--------|----------|
| TC-SETTINGS-01 | 添加自定义点播源后出现在列表并可勾选 | 已登录 | 添加自定义点播源（Apple CMS API 地址） | 源出现在点播源列表并可勾选参与搜索 | P1 | Not Run |
| TC-SETTINGS-02 | 添加订阅 URL 并同步，批量导入源与状态显示 | 已登录 | 添加订阅 URL，点击同步 | 订阅下的点播源与直播源批量导入，同步结果显示数量与状态 | P1 | Not Run |
| TC-SETTINGS-03 | 开启成人内容过滤后，成人源自动取消勾选，搜索中不再出现 | 已登录，有成人源 | 开启成人内容过滤 | 已勾选的成人源自动取消勾选，搜索中不再出现 | P1 | Not Run |
| TC-SETTINGS-04 | 切换封面图加载模式为“代理”，全站封面图走服务端代理 | 已登录 | 切换封面图加载模式为“代理” | 全站封面图走服务端代理，不直接请求上游 | P1 | Not Run |
| TC-SETTINGS-05 | 点击“导出配置”下载 JSON 文件 | 已登录 | 点击“导出配置” | 下载 JSON 文件，包含当前配置 | P1 | Not Run |
| TC-SETTINGS-06 | 导入 JSON 恢复配置，设置与源列表一致 | 已导出配置文件 | 在另一设备/浏览器导入同一文件 | 设置与源列表恢复一致 | P1 | Not Run |
| TC-SETTINGS-07 | 删除源后出现撤销提示，5 秒内点击撤销可恢复 | 已登录，有源 | 删除源 | 出现撤销提示，5 秒内点击撤销可恢复 | P1 | Not Run |
| TC-SETTINGS-08 | 直播源添加/编辑/删除，勾选启用、收藏频道、查看最近观看 | 已登录 | 在设置页管理直播源 | 支持添加/编辑/删除 M3U 直播源，勾选启用、收藏频道、查看最近观看 | P1 | Not Run |

---

## 7. 接口层（`/api/*`）—— P0

| 用例 ID | 标题 | 前置条件 | 操作步骤 | 预期结果 | 优先级 | 执行状态 |
|---------|------|----------|----------|----------|--------|----------|
| TC-API-01 | GET /api/status 返回 passwordRequired/verified/defaultSources 等 | 服务已启动 | 请求 GET /api/status | 返回 passwordRequired、verified、defaultSources、defaultRecommendSource、defaultImageMode 等字段 | P0 | Not Run |
| TC-API-02 | POST /api/auth action=login 返回 success/user | 服务已启动 | 请求 POST /api/auth，action=login，正确凭据 | 返回 success=true、user 信息，设置会话 Cookie | P0 | Not Run |
| TC-API-03 | POST /api/auth action=login 错误密码返回 401 | 服务已启动 | 请求 POST /api/auth，action=login，错误密码 | 返回 401，success=false，错误提示 | P0 | Not Run |
| TC-API-04 | POST /api/auth action=register 需要 inviteCode | 服务已启动 | 请求 POST /api/auth，action=register，缺少 inviteCode | 返回 400，错误提示 | P0 | Not Run |
| TC-API-05 | GET /api/search 返回 SearchResponse 结构 | 服务已启动，有可用源 | 请求 GET /api/search，wd 有效 | 返回 list[] 和 failures[]，结构符合 SearchResponse | P0 | Not Run |
| TC-API-06 | POST /api/search?stream=1 返回 NDJSON 逐源推送 | 服务已启动，有可用源 | 请求 POST /api/search?stream=1 | 返回 NDJSON，逐条 source 事件，最终 done 事件 | P0 | Not Run |
| TC-API-07 | GET /api/detail 返回剧集列表与播放地址 | 服务已启动，有有效 id/source | 请求 GET /api/detail?id=&source= | 返回 VideoDetail，episodes[] 包含播放地址 | P0 | Not Run |
| TC-API-08 | GET /api/detail 无效 id 返回 400 | 服务已启动 | 请求 GET /api/detail，id 非法 | 返回 400，错误提示 | P0 | Not Run |
| TC-API-09 | GET /api/media/catalog 返回片库目录 | 服务已启动 | 请求 GET /api/media/catalog | 返回 list[]，支持 type/sort/showId 参数 | P0 | Not Run |
| TC-API-10 | GET /api/media/detail 返回官方海报/演职员/剧情 | 服务已启动 | 请求 GET /api/media/detail | 返回 cover/backdrop、actors[]/directors[]、overview | P0 | Not Run |
| TC-API-11 | GET /api/media/episode-intro 返回单集简介 | 服务已启动 | 请求 GET /api/media/episode-intro | 返回 title/desc/airdate | P0 | Not Run |
| TC-API-12 | GET /api/proxy/[url] 图片代理，SSRF 校验 | 服务已启动 | 请求 GET /api/proxy?url=合法图片地址 | 返回图片内容，Cache-Control: public, max-age=2592000 | P0 | Not Run |
| TC-API-13 | GET /api/proxy 拒绝内网地址（SSRF 防护） | 服务已启动 | 请求 GET /api/proxy?url=http://127.0.0.1/... | 返回错误，拒绝内网地址 | P0（安全） | Not Run |
| TC-API-14 | GET /api/source-list 拉取并解析订阅 | 服务已启动 | 请求 GET /api/source-list?url= | 返回 SourceListPayload，sources[]/liveSources[]/stats | P1 | Not Run |
| TC-API-15 | POST /api/source/test 测试单个点播源可用性 | 服务已启动 | 请求 POST /api/source/test，url 合法 | 返回 ok/ms/count/error | P1 | Not Run |

---

## 8. 安全测试—— P0

| 用例 ID | 标题 | 前置条件 | 操作步骤 | 预期结果 | 优先级 | 执行状态 |
|---------|------|----------|----------|----------|--------|----------|
| TC-SEC-01 | SSRF：拒绝内网私有地址（127.0.0.1/10.0.0.0/8/192.168.0.0/16/172.16.0.0/12） | 服务已启动 | 通过 /api/search 或 /api/proxy 请求内网地址 | 被拒绝，返回错误 | P0 | Not Run |
| TC-SEC-02 | SSRF：拒绝非 http/https 协议 | 服务已启动 | 请求 ftp:// 或 file:// 地址 | 被拒绝 | P0 | Not Run |
| TC-SEC-03 | 登录速率限制：10 次失败后锁定 10 分钟 | 服务已启动 | 连续 10 次错误登录 | 第 11 次返回 429，retryAfterSec=600 | P0 | Not Run |
| TC-SEC-04 | 会话 Cookie httpOnly 与签名 | 服务已启动 | 登录后检查 Cookie | Cookie 设置 httpOnly、sameSite=lax，带 HMAC 签名 | P0 | Not Run |
| TC-SEC-05 | 未登录访问受保护页均跳转登录 | 未登录 | 访问 /watch、/catalog 点击卡片 | 统一跳转 /login?redirect=... | P0 | Not Run |

---

## 9. 兼容性测试—— P0/P1

| 用例 ID | 标题 | 前置条件 | 操作步骤 | 预期结果 | 优先级 | 执行状态 |
|---------|------|----------|----------|----------|--------|----------|
| TC-COMPAT-01 | 桌面端 Chrome（1280×800）首页正常渲染 | 服务已启动 | 用桌面端打开首页 | 页面正常渲染，无布局错位 | P0 | Not Run |
| TC-COMPAT-02 | 移动端 375×812 首页正常渲染 | 服务已启动 | 用移动端打开首页 | 页面正常渲染，响应式布局生效 | P0 | Not Run |
| TC-COMPAT-03 | 播放器在移动端可正常操作 | 服务已启动 | 移动端打开播放页 | 播放控件可触摸操作，倍速/全屏正常 | P1 | Not Run |

---

## 10. 边界异常测试—— P0

| 用例 ID | 标题 | 前置条件 | 操作步骤 | 预期结果 | 优先级 | 执行状态 |
|---------|------|----------|----------|----------|--------|----------|
| TC-EDGE-01 | 搜索关键词长度 >100 被拒绝 | 服务已启动 | 输入超过 100 字符的关键词 | 接口返回 400，搜索关键词无效 | P0 | Not Run |
| TC-EDGE-02 | 搜索关键词为空被拒绝 | 服务已启动 | 输入空关键词 | 接口返回 400 | P0 | Not Run |
| TC-EDGE-03 | 搜索无可用源时返回错误 | 服务已启动 | 所有源均未勾选 | 返回“没有启用的搜索源”错误 | P0 | Not Run |
| TC-EDGE-04 | 坏源不阻塞好源搜索 | 服务已启动，有好源和坏源 | 搜索包含好源与坏源 | 好源结果正常返回，坏源记录在 failures 中，不阻塞整体 | P0 | Not Run |
| TC-EDGE-05 | 播放源无播放地址显示切换按钮 | 已登录 | 播放页当前源无播放地址 | 显示“立即切换至备用线路”按钮 | P0 | Not Run |
| TC-EDGE-06 | 注册用户名特殊字符被拒绝 | 服务已启动 | 注册时用户名包含特殊字符 | 提示“用户名仅支持中英文、数字与下划线” | P0 | Not Run |

---

## 11. 用例汇总

| 模块 | 用例数 | P0 | P1 | 图片优化 P0 | 图片优化 P1 | 安全 |
|------|--------|----|----|-------------|-------------|------|
| 登录页 | 12 | 12 | 0 | 0 | 0 | 0 |
| 首页 | 15 | 8 | 0 | 7 | 1 | 0 |
| 片库页 | 10 | 10 | 0 | 0 | 0 | 0 |
| 播放页 | 14 | 14 | 0 | 0 | 0 | 0 |
| 历史页 | 6 | 0 | 6 | 0 | 0 | 0 |
| 设置页 | 8 | 0 | 8 | 0 | 0 | 0 |
| 接口层 | 15 | 13 | 2 | 0 | 0 | 1 |
| 安全 | 5 | 5 | 0 | 0 | 0 | 5 |
| 兼容性 | 3 | 2 | 1 | 0 | 0 | 0 |
| 边界异常 | 6 | 6 | 0 | 0 | 0 | 0 |
| **合计** | **94** | **70** | **17** | **7** | **1** | **6** |

> 说明：安全用例与接口/功能用例存在交叉，统计时按主要归类计数。实际执行时以用例 ID 为准，避免重复执行。

---

## 12. 自动化脚本建议

- 接口层用例（TC-API-*）建议编写 vitest/超agent 自动化脚本，放在 `src/app/api/**/route.test.ts` 旁边或新增 `test/` 目录。
- 界面关键流程（登录、首页搜索、播放）建议用 Playwright E2E，已有 `e2e/` 目录与 `auth.spec.ts`、`search.spec.ts`、`playback.spec.ts`、`image-optim.spec.ts`、`mobile-navigation.spec.ts`。
- 工具函数用例（buildImageCandidates、ssrf.isValidProxyUrl、store 相关）已有 `src/lib/**/*.test.ts`，可补充覆盖缺失模块。

---

**注**：所有用例执行结果将记录在 `test-report.md` 中，缺陷将按缺陷 ID、标题、严重程度、复现步骤、状态列出。