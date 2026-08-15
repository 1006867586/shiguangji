# 飨刻（XiangKe）微信小程序迁移可行性与实施计划书

> 版本：v1.0（2026-08-15）
> 评估范围：将现有 Next.js Web 应用迁移为微信小程序的技术可行性、合规风险、实施路径与成本

---

## 1. 执行摘要

**结论：可行，评级 B+（中高）。**

| 维度 | 评估 |
|------|------|
| 后端与数据层 | **完全复用**（22 张表、50 个 API 路由零改动或小改动） |
| 前端 | **必须重写 UI 层**，逻辑层（hooks/utils/lib 纯函数）可复用约 40-50% |
| 认证 | 需新增微信登录桥接（中等工作量，已有 QQ OAuth 同构模式可抄） |
| 合规 | **最大风险区**：域名 ICP 备案、企业主体、UGC 内容安全强制接入 |
| 分享 | 从「网页最大短板」变为「小程序最大优势」（原生分享卡片） |

**推荐路线**：Taro 4（React）+ 现有 Next.js API 作为唯一后端，一套后端两个前端。

**总工作量**：约 40-55 人日（单人 2-2.5 个月 / 双人 4-6 周）+ 2-4 周备案等行政流程（可并行）。

**三个硬性前置条件**（不满足则项目无法上线）：
1. API 域名 HTTPS + ICP 备案（现若部署在境外/免备案平台如 Vercel，必须迁移）
2. 小程序注册主体建议为**企业**（个人主体无法选择社交类目、无支付能力）
3. UGC 内容安全接口（msgSecCheck/imgSecCheck）强制接入，否则审核被拒

---

## 2. 现状技术盘点（评估基础）

| 层 | 现状 | 对小程序的意义 |
|----|------|---------------|
| 框架 | Next.js 15 App Router + React 18 + TS | UI 层不能复用；TS 类型、hooks、纯函数可复用 |
| 数据请求 | SWR 调用同域 `/api/*`（**API-first**，前端不直连 Supabase） | **重大利好**：小程序端只需把 cookie 换成 token，API 层几乎原样复用 |
| 认证 | Supabase Auth：邮箱密码（主）+ QQ OAuth（magic link 建会话） | 需新增 `wx.login → code2session → openid` 桥接，可完全照抄 QQ 链路的虚拟邮箱模式 |
| 数据库 | Supabase PostgreSQL，22 张表，全表 RLS | 服务端依赖，小程序无关，零改动 |
| AI | MiniMax（服务端调用，视觉 M3 + 文本 M2.5） | 服务端能力，小程序只管传图传参，零改动 |
| 存储 | Cloudflare R2 预签名直传 | 需改造上传方式（见 §4.3） |
| UI | Tailwind + Radix UI（shadcn） | **完全不能复用**，需换 Taro UI / NutUI |

页面 17 个、API 路由 50 个（89 个 handler）、重度浏览器依赖功能 6 项（海报 Canvas、直传上传、Web Share、地图 scheme、剪贴板、PWA）。

---

## 3. 逐层复用矩阵

### 3.1 完全复用（零改动）

| 模块 | 说明 |
|------|------|
| `supabase/migrations/*`（22 表 + RLS + RPC） | 纯服务端 |
| `lib/poi/*`（POI 匹配/名称清洗/相似度） | 纯函数 |
| `lib/ai/*`（MiniMax 封装 + 配额） | 纯服务端 |
| API 路由中的业务逻辑 | activities/groups/feed/search/notifications/favorites/splits/reports 等约 45 个路由 |
| `types/index.ts` | TS 类型全量共享 |

### 3.2 小改动（1-3 人日/项）

| 模块 | 改动 |
|------|------|
| 认证中间件 | 增加 `Authorization: Bearer` 提取路径（与现有 cookie 并存） |
| `POST /api/auth/*` | 新增 `/api/auth/weapp/login`（code2session + 建会话 + 发 token） |
| `POST /api/upload/presign` | 增加 POST policy 签名模式或服务端中转（见 §4.3） |
| 新增 `/api/security/*` | 封装微信 msgSecCheck/imgSecCheck（内容安全，合规刚需） |
| CORS / 域名 | API 网关配置小程序 request 合法域名 |

### 3.3 必须重写（UI + 浏览器 API 替换）

| Web 实现 | 小程序方案 | 难度 |
|----------|-----------|------|
| 17 个 React 页面 + 全部 shadcn 组件 | Taro 页面 + NutUI/Taro UI | 大（但机械） |
| Canvas 2D 海报（`lib/poster-canvas.ts`） | 小程序 Canvas 2D（`type="2d"`），API 高度相似，`qrcode` 库换 `weapp-qrcode` | 中 |
| Web Share API / 分享网关 | **`onShareAppMessage` 原生分享卡片**（优势项，网页做不到的微信内分享成为一等公民） | 低 |
| 地图 scheme 唤起（`lib/map-links.ts`） | 内置 `<map>` 组件（腾讯底图）+ `wx.openLocation` 唤起微信内地图；高德/百度在小程序生态外 | 低 |
| XHR 直传 R2 + 进度条 | `wx.uploadFile`（POST）或 `wx.request` PUT ArrayBuffer；压缩换 `wx.compressImage` | 中 |
| `navigator.clipboard` | `wx.setClipboardData` | 低 |
| Supabase Realtime（WebSocket） | `wx.connectSocket` 手动订阅或降级轮询（supabase-js 不可直接运行于小程序运行时） | 中 |
| PWA/SW | 直接移除（小程序本身就是宿主） | - |

---

## 4. 五大关键挑战与对策

### 4.1 认证体系桥接（工作量最大的单项，但有成熟同构模式）

现有 QQ OAuth 链路已实现「第三方身份 → Supabase 会话」：`openid → 虚拟邮箱 qq_${openid}@qq.local → magic link → sb cookie`。微信小程序完全同构：

```
小程序端                服务端（新增）                    Supabase
wx.login() ──code──▶ /api/auth/weapp/login
                     │ code2session(appid, secret)
                     │ ◀── openid + session_key
                     │ 虚拟邮箱 wx_${openid}@wechat.local
                     │ generateMagicLink / adminCreateUser
                     │ ◀── Supabase session
                     └──▶ 返回 access_token + refresh_token
wx.setStorageSync(token)                    
后续请求 Authorization: Bearer ... ──▶ requireUser() 双通道解析（cookie 或 Bearer）
```

- **老账号绑定**：已注册用户可在设置页把微信 openid 绑到现有 profile（表加一列 `wechat_openid` 或用 `user_identities`），登录时优先匹配。
- **unionid**：若未来还做公众号/视频号，注册微信开放平台拿 unionid 做统一身份。
- **会话续期**：refresh_token 存 storage，封装在请求层拦截 401 自动续期。

### 4.2 域名与备案（行政硬门槛，尽早启动）

- 小程序 `request`/`uploadFile`/`downloadFile` 合法域名要求：**HTTPS + 已 ICP 备案**。
- 当前若部署在 Vercel/境外 serverless（`*.vercel.app` 无法备案）→ 必须迁移到国内云（腾讯云/阿里云）+ 备案域名。
- **备案耗时 2-4 周，与开发完全并行**，但阻塞提审，应第一天启动。
- 微信小程序本身自 2023 起也需完成「小程序备案」。

### 4.3 上传链路改造

现状：`browser-image-compression`（Web Worker）→ `POST /api/upload/presign` 拿 R2 预签名 PUT URL → XHR 直传（带进度）。

小程序约束：`wx.uploadFile` 仅支持 POST multipart，与 S3 预签名 PUT 不兼容；`wx.request` 支持 PUT + ArrayBuffer 但无上传进度回调。

**推荐方案**：presign 接口新增 **S3 POST Policy 模式**（R2 支持），返回 policy + 签名字段，小程序端 `wx.uploadFile` formData 直传，`onProgressUpdate` 原生进度。改动集中在一个路由 + 一个 hook，约 2 人日。

图片压缩用 `wx.compressImage` 替代 browser-image-compression；Live Photo 视频 `wx.chooseMedia({mediaType:['video']})` 支持良好。

### 4.4 审核与内容合规（UGC 社区的生死线）

| 事项 | 要求 | 对策 |
|------|------|------|
| 主体与类目 | UGC 社区动态/评论属「社交-社区」能力，**基本要求企业主体**；个人主体类目严重受限 | 用企业营业执照注册小程序；类目备选「生活服务-餐饮」视角（聚餐工具）可降低敏感度 |
| 内容安全 | 2023 起强制：所有 UGC 文本过 `msgSecCheck`、图片过 `imgSecCheck`，且需保留发布者 openid 供追溯 | 新增 `/api/security/check-text`、`/api/security/check-image`，在发动态/评论/举报三个入口强制调用；request 层统一携带 openid 参数 |
| 隐私 | 《小程序用户隐私保护指引》声明 + 首次唤起隐私弹窗 | `app.json` 配 `__usePrivacyCheck__`，收集项：头像、昵称、相册、位置 |
| 账号注销 | 强制提供注销入口 | 设置页加注销流程（软删除 profile） |
| 分账功能 | 当前 split 仅记账无资金流，**不涉支付资质**；未来若接微信支付收款才需商户号 | 保持记账形态即可过审 |

### 4.5 前端重写范围控制（防烂尾）

- 17 个页面按价值排序，**首期只做 8 个核心页**（见 §6 Phase 2），转盘/统计/举报管理等放二期。
- shadcn/Radix 全部作废，统一用 **NutUI 4（京东，React 版成熟）** 快速搭建。
- 逻辑层直接搬运：`lib/map-links.ts`（纯函数）、`lib/poster-canvas.ts`（Canvas 2D 语法 90% 兼容）、各 hooks 的业务编排（把 SWR 换成 Taro request 封装）。
- Supabase Realtime 首版降级为下拉刷新 + 轮询（feed 页 30s），二期再上 `wx.connectSocket`。

---

## 5. 技术选型与目标架构

### 5.1 选型对比

| 方案 | 语言 | 复用率 | 结论 |
|------|------|--------|------|
| **Taro 4 + React**（推荐） | React/TS | hooks/types/纯函数 40-50%，心智 100% | 现有代码 React+TS，团队零切换成本 |
| uni-app | Vue | 仅 types/lib | 与现有 React 栈错位，弃 |
| 原生 WXML | - | 仅 types | 无法复用，弃 |
| web-view 套壳 | - | 100% | 微信对纯 web-view 套壳审核极严且体验差，仅作过渡 |

### 5.2 目标架构：一套后端，两个前端

```
                    ┌─────────────────────────────┐
                    │   Supabase (Postgres+RLS)   │
                    │   Cloudflare R2 (对象存储)   │
                    │   MiniMax / 高德 / 百度       │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │  Next.js API（现有 50 路由）  │
                    │  + /api/auth/weapp（新增）    │
                    │  + /api/security/*（新增）    │
                    │  + presign POST 模式（改造）  │
                    │  部署：国内云 + 备案域名       │
                    └───────┬─────────────┬───────┘
                            │ cookie      │ Bearer token
                   ┌────────┴───────┐ ┌───┴────────────┐
                   │ Next.js Web 端 │ │ Taro 小程序端    │
                   │ (现有，不动)     │ │ (新建 app-weapp)│
                   └────────────────┘ └────────────────┘
```

monorepo 建议：将 `types/`、`lib/poi/`、`lib/ai/`、`lib/map-links.ts` 等抽到 `packages/shared`，Web 与小程序共同引用（pnpm workspace）。

### 5.3 小程序端骨架

- TabBar 3 页：动态 feed（首页）/ 发布（中间键）/ 我的（profile + 收藏夹入口）
- 分包：收藏夹 AI 识别、海报生成、转盘放分包（主包 < 2MB）
- 分享：所有详情页配置 `onShareAppMessage`（标题+封面图+path 带 id），feed 卡片支持 `<button open-type="share">`

---

## 6. 分阶段实施计划

### Phase 0：行政与基建准备（第 1-3 周，与开发并行）

| 任务 | 负责 | 产出 |
|------|------|------|
| 企业主体注册小程序（mp.weixin.qq.com），选类目 | 运营 | AppID/AppSecret |
| 购买域名 + 国内云主机，API 迁移部署，ICP 备案 | 后端 | 备案通过的 HTTPS 域名 |
| 小程序备案 + 隐私保护指引填报 | 运营 | 备案号 |
| 微信支付商户号（可选，如做收款） | 运营 | 商户号 |

**里程碑 M0**：`https://api.备赛域名` 可被小程序 request。

### Phase 1：认证与骨架（第 1-2 周，5 人日）

- Taro 4 项目初始化（React + TS + NutUI + pnpm workspace 接入 shared 包）
- 请求层封装：token 存储、401 自动刷新、统一错误 toast
- `/api/auth/weapp/login` + `requireUser()` Bearer 双通道改造 + 老账号绑定页
- TabBar 三页空壳 + 登录态守卫

**里程碑 M1**：微信扫码登录成功，能调通 `/api/feed`。

### Phase 2：核心功能（第 3-5 周，18-22 人日）

| 页面/功能 | 人日 | 说明 |
|-----------|------|------|
| 动态 feed（含圈子切换、下拉刷新、分页） | 4 | 复用 feed API；Realtime 先轮询 |
| 活动详情（评论/点赞/表情/标签/评分） | 4 | 楼中楼评论用 NutUI 展开层 |
| 发布动态（文字 + 九宫格图片 + 外链解析） | 4 | link-preview API 原样复用 |
| 照片上传（压缩 + POST policy 直传 + 进度） | 3 | §4.3 方案 |
| 圈子（列表/创建/邀请码加入/成员） | 3 | 邀请码分享卡片是裂变核心 |
| 通知列表 + 订阅消息下发 | 2 | 通知落库已有，补 subscribeMessage |

**里程碑 M2**：核心闭环（登录→看 feed→发聚餐→评论→拉人进圈）全通。

### Phase 3：特色功能（第 6-7 周，12-15 人日）

| 功能 | 人日 | 说明 |
|------|------|------|
| 收藏夹 + AI 截图识别 + POI 补齐 + 编辑 | 4 | AI API 原样复用；编辑复用 PATCH |
| 分享海报（Canvas 2D + weapp-qrcode） | 3 | poster-canvas.ts 移植 |
| 原生分享卡片 + 朋友圈分享 | 1 | onShareAppMessage/onShareTimeline |
| 地图（wx.openLocation + 内嵌 map） | 1 | 替代 scheme 唤起 |
| 今天吃什么转盘（分包） | 2 | CSS 动画换小程序 animation |
| 内容安全接入（发布/评论/图片三口） | 2 | §4.4 |

**里程碑 M3**：功能对齐 Web 版核心集，体验版可内测。

### Phase 4：合规提审与上线（第 8 周，5 人日）

- 隐私弹窗 + 注销入口 + 用户协议/隐私政策页面
- 全流程真机回归（iOS/Android/鸿蒙微信）
- 提交审核（首审常见 1-3 次驳回，预留 1 周缓冲）
- 分阶段发布（先体验版 → 50% → 全量）

**里程碑 M4**：正式上线。

### 工时汇总

| 阶段 | 人日 |
|------|------|
| Phase 1 | 5 |
| Phase 2 | 18-22 |
| Phase 3 | 12-15 |
| Phase 4 | 5 |
| **合计** | **40-47**（+ 约 20% 缓冲 = 48-56） |

---

## 7. 风险登记表

| # | 风险 | 概率 | 影响 | 缓解 |
|---|------|------|------|------|
| R1 | 备案/主体/类目不合规导致无法提审 | 中 | 致命 | Phase 0 第一天启动；类目按「餐饮生活服务+社区」双报 |
| R2 | UGC 内容安全未覆盖全部入口被拒审 | 高 | 高 | request 层统一拦截 + 发布前强制检测 + 留存 openid |
| R3 | supabase-js/Realtime 在小程序运行时不可用 | 高 | 中 | 架构上小程序永不直连 Supabase（现状已满足）；Realtime 降级轮询 |
| R4 | API 迁国内云后 Web 站受牵连（延迟/成本） | 中 | 中 | 灰度切换，Web 与小程序共用新域名；R2/COS 二选一评估 |
| R5 | 首审被拒循环 | 高 | 中 | 预留 1 周缓冲；首版隐藏敏感功能（举报管理后台入口等） |
| R6 | 双端维护成本翻倍 | 确定 | 中 | shared 包收敛逻辑层；UI 差异接受不追求像素一致 |
| R7 | 转盘/海报等 Canvas 分包超 2MB | 低 | 低 | 图片资源走 CDN 不打包 |

---

## 8. 备选路线对比（为什么不选它们）

| 路线 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| **小程序（本方案）** | 原生分享卡片、微信生态裂变、留存高、订阅消息 | 备案+审核+UI 重写 | **推荐** |
| 继续纯 Web/PWA | 零迁移 | 微信内分享永远是短板（正是当前痛点） | 不解决核心问题 |
| web-view 套壳 | 几乎零成本 | 审核极严易被封、体验差、分享仍是链接 | 仅作临时过渡 |
| 原生 App | 能力最全 | 成本 3-5 倍于小程序，冷启动难 | 远期 |

**本项目的核心诉求（聚餐记录在亲友圈传播）与微信社交链强绑定，小程序是收益/成本比最高的形态。**

---

## 9. 建议立即启动的三个动作

1. **今天**：确认企业主体与营业执照可用性，注册小程序拿到 AppID（没有它后续联调都做不了）。
2. **本周**：确定 API 国内部署方案并提交 ICP 备案（最长的行政依赖链）。
3. **并行**：仓库内 `pnpm workspace` 化，抽 `packages/shared`（types + lib 纯函数），为 Taro 接入铺路——这一步即使最终不做小程序，对 Web 端代码质量也是净收益。

---

*附：本计划书基于 2026-08-15 代码库调研（commit 8b5fb2f），页面/接口/表结构清单详见调研底稿。*
