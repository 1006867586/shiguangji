# PC 端微信扫码登录（小程序辅助确认）— 设计文档

- 日期：2026-08-18
- 分支：`main`（后端 API + 迁移 + Web 前端）→ `weapp`（小程序确认页）
- 参考教程：知乎 @行者无疆《微信登录（曲线救国版）》（question/31959260/answer/28138249101）
- 目标：PC Web 端**无需申请微信开放平台企业资质**，借助微信小程序实现扫码登录 + 自动注册，与小程序端共用同一套 Supabase 账号体系

## 背景与目标

微信开放平台的「微信登录」（OAuth2，PC 网页扫码登录）只对企业用户开放。本系统为个人开发者，故采用教程的「曲线救国」方案：

1. PC 登录页显示小程序码（`getUnlimitedQRCode`，scene 携带一次性 sessionId）；
2. 用户微信扫码 → 打开小程序「确认登录」页（读取 scene 里的 sessionId）；
3. 用户点「确认登录」→ `wx.login` 拿 code + sessionId 调后端；
4. 后端 `code2Session` 换 openid → 自动注册/登录（本项目既有虚拟邮箱 + magic link 链路）→ 登记 `sessionId → openid`；
5. PC 端长轮询该 sessionId，命中即建立 Web 会话（写 Supabase cookie）→ 前端跳转首页。

本项目小程序端已有完整微信登录（`/api/auth/weapp/login`），PC 端目前只有邮箱密码 + QQ 登录；本次为 PC 补齐扫码登录。

**用户已确认的产品决策**：小程序确认页点击「确认登录」后，**小程序端也顺带自动登录**（同一 openid → 同一账号，确认接口直接返回 access/refresh token 供小程序本地存储）。

## 总体流程

```
PC /login ──点「微信扫码登录」──▶ POST /api/auth/weapp/qrcode
                                   ├─ 生成 32 位 sessionId，INSERT wechat_login_sessions {uuid, expires_at=+5min}
                                   └─ getwxacodeunlimit(scene=sessionId, page=pages/login-confirm/index)
                                   ◀─ 返回 { uuid, qrBase64 }
PC 弹窗显示二维码 ◀───────────────┘
PC 启动长轮询 POST /api/auth/weapp/login-status {uuid}（每次最多 20s，pending 则续发）
用户微信扫码 → 小程序 pages/login-confirm/index（onLoad options.scene = sessionId）
用户点「确认登录」→ Taro.login() → POST /api/auth/weapp/confirm-login {code, uuid}
  ├─ code2Session → openid → 虚拟邮箱 magic link 全流程建会话（复用既有逻辑）
  ├─ UPDATE wechat_login_sessions SET openid, user_id WHERE uuid（幂等登记）
  └─ 返回 { accessToken, refreshToken, expiresAt, isNewUser } → 小程序存 token（自动登录）
PC 轮询命中 → 用 openid 走同一 magic link 链路生成会话 → 响应写 sb-* cookie → DELETE 行（一次性消费）
PC 收到 { status: "ok" } → window.location.href = redirect（首页）
5 分钟未确认 → { status: "expired" } → 前端提示「二维码已失效，请刷新」
```

## 关键架构决策

### 方案选择（缓存介质 + 会话交接）— 已确认方案 A

| 方案 | 做法 | 结论 |
|------|------|------|
| **A（采用）** | Supabase 表存 `uuid→openid`；确认端只登记 openid；**PC 轮询命中时现场生成会话**并直接写 cookie | 与教程流程 1:1（仅 Redis 换成 Supabase 表）；token 不进库；cookie 直写与现有 `signin` 架构一致；同一账号体系单一代码路径 |
| B | 确认端建好完整会话、token 存表，轮询端只读+写 cookie | 轮询端更快，但 token 落库有泄露面，复杂度高（否决） |
| C | 前端 2-3s 短轮询 + 浏览器端 `setSession` | 偏离教程长轮询选择，前端要处理 token（否决） |

### 轮询机制：长轮询（教程原案）

- 服务端循环：查库 → 未命中 sleep 2s → 再查，最多 10 次（约 20s）；命中立即返回，超时返回 `pending`
- 前端收到 `pending` 再次发起（教程前端本就有「收到空结果再次调用」的逻辑）
- **EdgeOne 适配（已核实）**：EdgeOne Pages Cloud Functions 单请求最大执行时长默认 30s、可配置至 120s（`edgeone.json` 的 `cloudFunctions.maxDuration`，范围 10–120s）。20s 长轮询落在默认 30s 内；另在 `edgeone.json` 配置 `cloudFunctions.maxDuration: 60` 留余量

### EdgeOne serverless 适配

- **存储只用 Supabase 表**：serverless 多实例无共享内存，Redis/内存方案直接排除；`uuid→openid` 落库 + 原子消费（`DELETE ... RETURNING`）保证跨实例一致
- **access_token 复用现有 `lib/wechat.ts`**：`stable_token` 接口 + 模块级缓存 + 40001 强制刷新 + in-flight 去重，本就为 serverless 多实例设计，二维码生成直接复用 `getWeappAccessToken` / `isWeappConfigured`
- **cookie 写入**沿用 `signin` 的同域 `NextResponse.cookies.set()` 模式（生产已在 EdgeOne 跑通）

## 数据表

`supabase/migrations/013_wechat_login_sessions.sql`：

```sql
create table if not exists public.wechat_login_sessions (
  uuid       text primary key,              -- 32 位 sessionId（scene 上限 32 可见字符）
  openid     text,                          -- 确认后回填（code2Session 结果）
  user_id    uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null           -- 生成时 now()+5min
);
create index if not exists wechat_login_sessions_expires_idx
  on public.wechat_login_sessions (expires_at);
```

- **不建 RLS 策略**（默认 deny all）：表只被服务端三个 route 用 service role key 访问，无需 anon 访问
- 一次性消费：`login-status` 命中后用 `delete ... returning openid, user_id` 原子领取，防重复登录
- 清理：`qrcode` 生成时顺带 `delete where expires_at < now()`（低频清理，不额外加定时任务）

## 后端接口（main 分支）

### 公共逻辑提取 — `lib/auth/weapp-session.ts`（新）

从现有 `app/api/auth/weapp/login/route.ts` 提取，三处复用，保证账号体系逻辑单一来源：

- `exchangeCodeForSession(code)`：`code2Session` → openid → 虚拟邮箱 `wx_{openid}@wechat.local` → `admin.generateLink(magiclink)` → `verifyOtp` 消费 → 返回 `{ user, session, isNewUser, openid, unionid }`（含 user_metadata 写 `weapp_openid` / `weapp_unionid`、新用户 `profiles` upsert、`isNewUser` 判定 = 创建 < 2 分钟）
- `exchangeOpenIdForSession(openid)`：免 code 版本，直接用 openid 走「虚拟邮箱 + magic link」建会话（供 `login-status` 命中时使用）
- `code2Session(code)` 放到 `lib/wechat.ts`（与 `getWeappAccessToken` 同风格）

### `app/api/auth/weapp/login/route.ts`（重构）

改为调用 `exchangeCodeForSession`，对外行为与响应结构**完全不变**（小程序现有登录不受影响）。

### `POST /api/auth/weapp/qrcode`（新，无需登录）

- 校验 `isWeappConfigured()`，未配置返回 `{ error, code: "weapp_not_configured" }`（501，同现有风格）
- 生成 32 位 sessionId（`randomBytes(16).toString("hex")`）；顺带清理过期行
- `INSERT wechat_login_sessions { uuid, expires_at: now()+5min }`
- `getwxacodeunlimit`：`scene=sessionId`、`page="pages/login-confirm/index"`、`width=430`、`check_path=false`、`env_version` 取自 `WEAPP_QR_ENV`（默认 `release`）
- 微信侧失败（errcode JSON）→ 删除刚插入的行并返回 502；40001/42001 → 强制刷新 token 后重试一次（复用现有 wxacode 路由模式）
- 返回 `{ data: { uuid, qrBase64 } }`

### `POST /api/auth/weapp/confirm-login`（新，小程序）

- 请求 `{ code, uuid }`；校验 uuid 存在且未过期，否则 400 `{ error: "二维码已失效，请刷新后重试", code: "login_session_expired" }`
- `exchangeCodeForSession(code)` 建会话（自动注册/登录）
- `UPDATE wechat_login_sessions SET openid=?, user_id=? WHERE uuid=? AND expires_at > now()`（幂等登记）；**影响 0 行**（行已被 login-status 消费删除 / 已过期）→ 400「该二维码已失效」
- 返回 `{ accessToken, refreshToken, expiresAt, isNewUser }`（小程序存 token 完成自动登录）

### `POST /api/auth/weapp/login-status`（新，PC 长轮询）

- 请求 `{ uuid }`；校验 uuid 格式
- 长轮询循环（最多 10 次）：查询行 → 无 openid 且未过期 → sleep 2s 继续；命中且未过期 → 消费；**行不存在或已过期 → 直接 `{ status: "expired" }`**（防止伪造 uuid 无限轮询）；循环耗尽 → `{ status: "pending" }`
- 命中消费：
  1. `delete ... returning openid, user_id where uuid=? and expires_at > now()`（原子领取）
  2. `exchangeOpenIdForSession(openid)` 生成会话
  3. 用 `createServerClient`（读请求 cookies、收集 `setAll`）拿到 sb-* cookies，写进 `NextResponse`（与 `signin` 完全相同：httpOnly、sameSite lax、secure 生产、path /）
  4. 返回 `{ status: "ok", isNewUser, redirect }`
- 边界：行存在但 openid 为空（已生成码、未确认）→ 继续轮询；确认后立即命中

## Web 前端（main 分支）

### `app/login/page.tsx`

- 服务端加 `wechatEnabled = Boolean(process.env.WEAPP_APPID && process.env.WEAPP_SECRET)`，传给 `LoginClient`

### `components/auth/LoginClient.tsx` + 新组件 `components/auth/WechatQrLogin.tsx`

- 「或」分隔线下新增「微信登录」按钮（微信绿 `#07C160`，样式对齐现有 QQ 按钮），仅 `wechatEnabled` 时显示
- 点击打开 shadcn `Dialog`，状态机：
  - `generating`：调 `POST /api/auth/weapp/qrcode`，成功后显示 `data:image/png;base64` 二维码 + 「请使用微信扫一扫」
  - `polling`：循环 `POST /api/auth/weapp/login-status {uuid}`；`pending` → 间隔 ~1s 续发；`ok` → 硬跳 `window.location.href = redirect`（safeRedirectPath）；`expired` → 停止并提示「二维码已失效」，提供「刷新二维码」
  - `error`：提示错误（含 `weapp_not_configured` → 「服务端未配置小程序登录」）
- 关闭弹窗 → 停止轮询（cleanup 清理定时器与 in-flight 标记）

## 小程序端（weapp 分支）

### `weapp/src/pages/login-confirm/index`（新页）+ `.scss` + `.config.ts`

- `onLoad(options)`：`options.scene` 即 sessionId（小程序码 scene 参数自动进 onLoad）；为空 → 提示「无效的登录二维码」并禁用按钮
- UI：品牌区（复用 login 页风格）+ 文案「确认登录 PC 端」+ 主按钮「确认登录」+ 说明「扫码后请在手机上确认」
- 点确认 → `Taro.login()` 拿 code → `POST /api/auth/weapp/confirm-login { code, uuid }`
  - 成功：`saveSession()` 存 token（**从 `auth.ts` 提取公共函数**，`weappLogin` 同款存储）→ toast「认证完成」→ `Taro.navigateBack`（无法返回则 `switchTab` 首页）
  - 失败：toast 错误（`login_session_expired` → 「二维码已失效，请刷新后重试」）
- 防重复提交：loading 态禁用按钮

### `weapp/src/utils/auth.ts`

- 提取 `saveSession(session: WeappSession)`（存 TOKEN_KEY/REFRESH_KEY/EXPIRES_KEY），`weappLogin` 与 login-confirm 复用

### `weapp/src/app.config.ts`

- `pages` 数组注册 `"pages/login-confirm/index"`

## 安全要点

- sessionId 32 位随机 hex，不可预测；5 分钟 TTL；一次性消费（原子 DELETE）
- `confirm-login` 只能登记自己的行；`login-status` 命中即删，防重放
- openid 不直接暴露给前端（虚拟邮箱机制）；PC 会话由服务端 magic link 链路建立，token 不经浏览器 JS
- 二维码接口无鉴权（登录前必要），依赖 sessionId 随机性 + 短 TTL；微信侧 getwxacodeunlimit 本身有调用频率限制（45009），错误码透传给前端提示
- `redirect` 参数一律 `safeRedirectPath` 消毒

## 上线前提（运营，非代码）

1. 小程序**正式版**需包含 `pages/login-confirm/index` 并发布，真实用户扫码才有效（未发布页面 check_path=false 可生成码，但用户扫开是「页面不存在」）
2. 开发/联调阶段可用体验版二维码：`WEAPP_QR_ENV=trial`（体验版仅测试成员可扫）
3. `WEAPP_APPID / WEAPP_SECRET` 须与 `weapp/project.config.json` 的 appid（`wx389e7f6c479bcdba`）一致；Web 部署环境需配置这两个变量（`.env.example` 已有）
4. `edgeone.json` 增加 `cloudFunctions.maxDuration: 60`

## 分支流程（按 AGENTS.md）

1. 在 `main`：迁移 SQL + `lib/auth/weapp-session.ts` + `lib/wechat.ts` 补 `code2Session` + 3 个新 route + `weapp/login` 重构 + Web 登录页 + `edgeone.json` + `.env.example` 补 `WEAPP_QR_ENV` + `docs/api.md` 补接口 → `npx tsc --noEmit` + `npm run build` → 提交推送
2. 切 `weapp` → `git merge main` → 小程序 `login-confirm` 页 + `auth.ts` 提取 + `app.config.ts` → `npm run build:weapp` → 提交推送
3. 上线前人工验证：`WEAPP_QR_ENV=trial` 联调全链路（生成码 → 扫码 → 确认 → PC 登录 → 小程序自动登录）

## 验证

| 层 | 验证 |
|----|------|
| 类型/构建 | `npx tsc --noEmit`（main）；`npm run build:weapp`（weapp） |
| 接口单测 | 现有 vitest 体系；新逻辑以微信/Supabase 外部依赖为主，必要时对 `exchangeOpenIdForSession` 等纯逻辑做单测 |
| 联调 | 本地 Next.js dev + 微信开发者工具（`TARO_APP_API_BASE` 局域网 IP、勾选「不校验合法域名」）；体验版二维码全链路 |
| 回归 | 小程序现有 `weappLogin`（重构后行为不变）；Web 邮箱/QQ 登录不受影响 |
