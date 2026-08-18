# PC 端微信扫码登录（小程序辅助确认）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PC Web 端登录页支持微信扫码登录：用户扫小程序码 → 小程序「确认登录」页确认 → PC 端自动登录（Supabase cookie 会话），小程序端顺带自动登录。

**Architecture:** 完全复用既有「虚拟邮箱 + magic link」账号链路（`/api/auth/weapp/login` 的机制），把登录流程拆成三段：`qrcode`（生成小程序码 + 登记一次性 sessionId）→ `confirm-login`（小程序确认，登记 openid，返回 token 供小程序自动登录）→ `login-status`（PC 长轮询，命中后用 openid 建 Web 会话并直写 cookie，与 `/api/auth/signin` 同模式）。会话状态存 Supabase 表 `wechat_login_sessions`（TTL 5 分钟、一次性消费），适配 EdgeOne serverless（无共享内存、函数默认 30s 超时）。

**Tech Stack:** Next.js App Router（Route Handlers）、Supabase（`@supabase/supabase-js` + `@supabase/ssr`）、微信小程序 API（`code2Session` / `getwxacodeunlimit`，走既有 `lib/wechat.ts` 的 stable_token 缓存）、Taro 4 + React（小程序端）、Vitest（新增单测）、Tailwind + shadcn（Web UI）。

**设计文档：** `docs/superpowers/specs/2026-08-18-pc-wechat-scan-login-design.md`

**分支约定（AGENTS.md）：** 本计划所有 Task 1–10 在 `main` 分支执行（后端 + Web + 迁移 + 文档）；Task 11–14 切到 `weapp` 分支（`git merge main` 后只改 `weapp/` 目录）。

---

## 阶段 A — main 分支：后端 + Web

### Task 1: 数据库迁移 `wechat_login_sessions`

**Files:**
- Create: `supabase/migrations/013_wechat_login_sessions.sql`

- [ ] **Step 1: 创建迁移文件**

```sql
-- PC 端微信扫码登录（小程序辅助确认）：uuid → openid 一次性会话登记。
-- 仅服务端 service role 访问（qrcode / confirm-login / login-status 三个路由），
-- 不建 RLS 策略（默认 deny all），anon 无法读写。
create table if not exists public.wechat_login_sessions (
  uuid       text primary key,              -- 32 位 sessionId（scene 上限 32 可见字符）
  openid     text,                          -- 确认后回填（code2Session 结果）
  user_id    uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null           -- 生成时 now() + 5min
);

create index if not exists wechat_login_sessions_expires_idx
  on public.wechat_login_sessions (expires_at);
```

- [ ] **Step 2: 提交**

```bash
git add supabase/migrations/013_wechat_login_sessions.sql
git commit -m "feat(auth): PC 扫码登录会话表 wechat_login_sessions 迁移"
```

---

### Task 2: `lib/wechat.ts` 增加 `code2Session`（TDD）

**Files:**
- Modify: `lib/wechat.ts`（追加到文件末尾）
- Test: `lib/wechat.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `lib/wechat.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { code2Session, Code2SessionError } from "./wechat";

describe("code2Session", () => {
  beforeEach(() => {
    vi.stubEnv("WEAPP_APPID", "wx-test-appid");
    vi.stubEnv("WEAPP_SECRET", "test-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("成功时返回 openid / unionid，且 URL 携带 appid 与 js_code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ openid: "o_123", unionid: "u_456", session_key: "sk" }),
          { status: 200 }
        )
      )
    );
    const result = await code2Session("code-1");
    expect(result.openid).toBe("o_123");
    expect(result.unionid).toBe("u_456");
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("appid=wx-test-appid");
    expect(url).toContain("js_code=code-1");
  });

  it("微信业务错误码抛 Code2SessionError（携带 errcode）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ errcode: 40029, errmsg: "invalid code" }), { status: 200 })
      )
    );
    const err = await code2Session("bad").catch((e) => e);
    expect(err).toBeInstanceOf(Code2SessionError);
    expect(err.errcode).toBe(40029);
  });

  it("HTTP 失败抛普通 Error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream down", { status: 502 })));
    await expect(code2Session("x")).rejects.toThrow("HTTP 502");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run lib/wechat.test.ts
```

Expected: FAIL（`Cannot find module './wechat'` 或 `code2Session is not exported`）。

- [ ] **Step 3: 实现**

在 `lib/wechat.ts` 文件末尾追加：

```ts
// ---- 小程序登录凭证换取 openid（auth.code2Session） ----

const CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";

/** code2Session 业务失败（微信返回 errcode 而非 openid） */
export class Code2SessionError extends Error {
  errcode: number;
  constructor(errcode: number, errmsg: string) {
    super(`微信登录失败（${errcode}）：${errmsg ?? ""}`);
    this.name = "Code2SessionError";
    this.errcode = errcode;
  }
}

export interface Code2SessionResult {
  openid: string;
  unionid?: string;
  session_key?: string;
}

/**
 * 用 wx.login 的 code 换 openid / unionid（auth.code2Session）。
 * - 微信业务错误（errcode）→ 抛 Code2SessionError
 * - HTTP 层失败 → 抛普通 Error
 */
export async function code2Session(code: string): Promise<Code2SessionResult> {
  if (!isWeappConfigured()) {
    throw new Error("WEAPP_APPID / WEAPP_SECRET 未配置");
  }
  const url =
    `${CODE2SESSION_URL}?appid=${encodeURIComponent(process.env.WEAPP_APPID!)}` +
    `&secret=${encodeURIComponent(process.env.WEAPP_SECRET!)}` +
    `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`code2Session HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    openid?: string;
    session_key?: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
  };
  if (!data.openid || data.errcode) {
    throw new Code2SessionError(data.errcode ?? 0, data.errmsg ?? "unknown");
  }
  return {
    openid: data.openid,
    session_key: data.session_key,
    ...(data.unionid ? { unionid: data.unionid } : {}),
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run lib/wechat.test.ts
```

Expected: 3 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/wechat.ts lib/wechat.test.ts
git commit -m "feat(auth): lib/wechat.ts 增加 code2Session（含单测）"
```

---

### Task 3: `lib/auth/weapp-session.ts` 统一会话建立（TDD）

**Files:**
- Create: `lib/auth/weapp-session.ts`
- Test: `lib/auth/weapp-session.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `lib/auth/weapp-session.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildWeappVirtualEmail,
  exchangeOpenIdForSession,
  WeappSessionError,
} from "./weapp-session";

const mocks = vi.hoisted(() => ({
  generateLink: vi.fn(),
  updateUserById: vi.fn(),
  verifyOtp: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        generateLink: mocks.generateLink,
        updateUserById: mocks.updateUserById,
      },
      verifyOtp: mocks.verifyOtp,
    },
    from: vi.fn(() => ({ upsert: mocks.upsert })),
  })),
}));

describe("exchangeOpenIdForSession", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    mocks.generateLink.mockReset();
    mocks.updateUserById.mockReset();
    mocks.verifyOtp.mockReset();
    mocks.upsert.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("虚拟邮箱格式为 wx_{openid}@wechat.local", () => {
    expect(buildWeappVirtualEmail("o_abc")).toBe("wx_o_abc@wechat.local");
  });

  it("新用户：建立会话、写元数据 nickname、profiles upsert、消费 token_hash", async () => {
    const user = { id: "u1", created_at: new Date().toISOString(), user_metadata: {} };
    mocks.generateLink.mockResolvedValue({
      data: { user, properties: { hashed_token: "tok" } },
      error: null,
    });
    mocks.updateUserById.mockResolvedValue({ data: { user }, error: null });
    mocks.upsert.mockResolvedValue({ data: null, error: null });
    mocks.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: "at",
          refresh_token: "rt",
          expires_at: 4102444800,
        },
      },
      error: null,
    });

    const result = await exchangeOpenIdForSession("o_abc");

    expect(result.isNewUser).toBe(true);
    expect(result.accessToken).toBe("at");
    expect(result.openid).toBe("o_abc");
    // openid.slice(-4) 为 "_abc"
    expect(mocks.updateUserById.mock.calls[0][1].user_metadata.nickname).toBe("微信用户_abc");
    expect(mocks.upsert).toHaveBeenCalledWith({ id: "u1", nickname: "微信用户_abc" });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "tok", type: "magiclink" });
  });

  it("generateLink 失败抛 WeappSessionError(code=link_failed)", async () => {
    mocks.generateLink.mockResolvedValue({ data: null, error: new Error("boom") });
    const err = await exchangeOpenIdForSession("o_abc").catch((e) => e);
    expect(err).toBeInstanceOf(WeappSessionError);
    expect(err.code).toBe("link_failed");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run lib/auth/weapp-session.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

创建 `lib/auth/weapp-session.ts`：

```ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { code2Session, Code2SessionError } from "@/lib/wechat";

/**
 * 微信登录统一会话建立（PC 扫码登录 + 小程序登录共用）。
 *
 * 链路：openid → 虚拟邮箱 wx_{openid}@wechat.local → admin.generateLink(magiclink)
 * → 服务端消费 token_hash（verifyOtp）建立 Supabase 会话。
 * 首次登录自动注册（admin.generateLink 自动建用户），新用户补 nickname / profiles。
 */

export type WeappSessionErrorCode =
  | "code2session_failed"
  | "wechat_unavailable"
  | "link_failed"
  | "session_failed";

export class WeappSessionError extends Error {
  code: WeappSessionErrorCode;
  /** 微信业务错误码（code2session_failed 时携带） */
  errcode?: number;
  constructor(code: WeappSessionErrorCode, message: string, errcode?: number) {
    super(message);
    this.name = "WeappSessionError";
    this.code = code;
    this.errcode = errcode;
  }
}

export interface WeappSessionResult {
  user: { id: string; created_at: string; user_metadata?: Record<string, unknown> };
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  isNewUser: boolean;
  openid: string;
  unionid?: string;
}

const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

export function buildWeappVirtualEmail(openid: string): string {
  return `wx_${openid}@wechat.local`;
}

/**
 * 用 openid 建立（或复用）Supabase 会话：虚拟邮箱 + magic link。
 * 不调用微信接口，供 PC 轮询命中后使用。
 */
export async function exchangeOpenIdForSession(
  openid: string,
  extra?: { unionid?: string }
): Promise<WeappSessionResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isPlaceholder(url) || isPlaceholder(anonKey) || isPlaceholder(serviceRoleKey)) {
    throw new WeappSessionError("session_failed", "服务端 Supabase 未配置");
  }

  const admin = createSupabaseClient(url!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const virtualEmail = buildWeappVirtualEmail(openid);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: virtualEmail,
  });
  if (linkErr || !linkData?.properties?.hashed_token || !linkData.user) {
    console.error("[weapp-session] 生成 magic link 失败:", linkErr?.message);
    throw new WeappSessionError("link_failed", "建立会话失败，请稍后重试");
  }

  const createdMinutesAgo =
    (Date.now() - new Date(linkData.user.created_at).getTime()) / 60_000;
  const isNewUser = createdMinutesAgo < 2;
  await admin.auth.admin.updateUserById(linkData.user.id, {
    user_metadata: {
      ...(linkData.user.user_metadata ?? {}),
      weapp_openid: openid,
      ...(extra?.unionid ? { weapp_unionid: extra.unionid } : {}),
      ...(isNewUser && !linkData.user.user_metadata?.nickname
        ? { nickname: `微信用户${openid.slice(-4)}` }
        : {}),
    },
  });
  await admin.from("profiles").upsert({
    id: linkData.user.id,
    ...(isNewUser ? { nickname: `微信用户${openid.slice(-4)}` } : {}),
  });

  const anon = createSupabaseClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyErr || !verifyData.session) {
    console.error("[weapp-session] 消费 magic link 失败:", verifyErr?.message);
    throw new WeappSessionError("session_failed", "建立会话失败，请稍后重试");
  }

  return {
    user: linkData.user,
    accessToken: verifyData.session.access_token,
    refreshToken: verifyData.session.refresh_token,
    expiresAt: new Date((verifyData.session.expires_at ?? 0) * 1000).toISOString(),
    isNewUser,
    openid,
    ...(extra?.unionid ? { unionid: extra.unionid } : {}),
  };
}

/** wx.login code → 会话（code2Session 换 openid 后再建会话） */
export async function exchangeCodeForSession(code: string): Promise<WeappSessionResult> {
  let sessionInfo;
  try {
    sessionInfo = await code2Session(code);
  } catch (err) {
    if (err instanceof Code2SessionError) {
      throw new WeappSessionError("code2session_failed", err.message, err.errcode);
    }
    throw new WeappSessionError("wechat_unavailable", "微信登录服务暂不可用，请稍后重试");
  }
  return exchangeOpenIdForSession(sessionInfo.openid, {
    unionid: sessionInfo.unionid,
  });
}

/** WeappSessionError → HTTP 状态码（与旧 /api/auth/weapp/login 行为一致） */
export function httpStatusForWeappError(err: WeappSessionError): number {
  if (err.code === "code2session_failed") {
    return err.errcode === 40029 || err.errcode === 40163 ? 401 : 502;
  }
  return 502;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run lib/auth/weapp-session.test.ts
```

Expected: 3 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/auth/weapp-session.ts lib/auth/weapp-session.test.ts
git commit -m "feat(auth): 提取 lib/auth/weapp-session.ts 统一微信会话建立（含单测）"
```

---

### Task 4: 重构 `app/api/auth/weapp/login/route.ts` 复用公共逻辑

**Files:**
- Modify: `app/api/auth/weapp/login/route.ts`（整文件替换）

- [ ] **Step 1: 替换路由实现（行为不变）**

将 `app/api/auth/weapp/login/route.ts` 全部内容替换为：

```ts
import { jsonResponse } from "@/lib/utils";
import { isWeappConfigured } from "@/lib/wechat";
import {
  exchangeCodeForSession,
  WeappSessionError,
  httpStatusForWeappError,
} from "@/lib/auth/weapp-session";

/**
 * POST /api/auth/weapp/login — 微信小程序登录（weapp 分支）
 *
 * 链路：wx.login code → code2Session 换 openid → 虚拟邮箱 + magic link
 * 建立 Supabase 会话 → 把 access/refresh token 返回给小程序端。
 * 逻辑已提取到 lib/auth/weapp-session.ts（与 PC 扫码登录共用），本路由只做
 * 入参校验、环境检查与错误码映射，对外行为与响应结构保持不变。
 */

const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

export async function POST(request: Request) {
  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const code = body.code?.trim();
  if (!code) {
    return jsonResponse({ error: "缺少微信登录 code" }, { status: 400 });
  }

  if (!isWeappConfigured()) {
    console.error("[weapp/login] WEAPP_APPID / WEAPP_SECRET 未配置或仍是占位符");
    return jsonResponse(
      { error: "小程序登录未配置：请在服务端设置 WEAPP_APPID 与 WEAPP_SECRET", code: "weapp_not_configured" },
      { status: 501 }
    );
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey) || isPlaceholder(serviceRoleKey)) {
    console.error("[weapp/login] Supabase 环境变量未就绪");
    return jsonResponse({ error: "服务端 Supabase 未配置", code: "supabase_not_configured" }, { status: 501 });
  }

  try {
    const session = await exchangeCodeForSession(code);
    return jsonResponse({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      isNewUser: session.isNewUser,
    });
  } catch (err) {
    if (err instanceof WeappSessionError) {
      console.error("[weapp/login] 微信登录失败:", err.code, err.message);
      return jsonResponse(
        { error: err.message, code: err.code },
        { status: httpStatusForWeappError(err) }
      );
    }
    console.error("[weapp/login] 未捕获异常:", err);
    return jsonResponse({ error: "登录失败，请稍后重试", code: "internal_error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: 类型检查 + 全量单测**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: tsc 无错误；`lib/wechat.test.ts` 与 `lib/auth/weapp-session.test.ts` 全部 PASS。

- [ ] **Step 3: 提交**

```bash
git add app/api/auth/weapp/login/route.ts
git commit -m "refactor(auth): weapp/login 复用 lib/auth/weapp-session（行为不变）"
```

---

### Task 5: `POST /api/auth/weapp/qrcode`

**Files:**
- Create: `app/api/auth/weapp/qrcode/route.ts`

- [ ] **Step 1: 创建路由**

```ts
import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { jsonResponse } from "@/lib/utils";
import { getWeappAccessToken, isWeappConfigured } from "@/lib/wechat";

/**
 * POST /api/auth/weapp/qrcode — 生成 PC 扫码登录二维码（无需登录）
 *
 * 流程：生成 32 位一次性 sessionId → 预登记 wechat_login_sessions 行（TTL 5min）
 * → getwxacodeunlimit 生成小程序码（scene=sessionId，指向 pages/login-confirm/index）。
 *
 * 响应：{ data: { uuid, qrBase64 } }（PNG base64）
 * 小程序版本由 WEAPP_QR_ENV 控制：release（默认）/ trial / develop。
 */

const WXACODE_URL = "https://api.weixin.qq.com/wxa/getwxacodeunlimit";
const LOGIN_CONFIRM_PAGE = "pages/login-confirm/index";
const SESSION_TTL_MS = 5 * 60_000;

interface WxacodeErrorResponse {
  errcode?: number;
  errmsg?: string;
}

function parseErrorResponse(text: string): WxacodeErrorResponse | null {
  try {
    const parsed = JSON.parse(text) as WxacodeErrorResponse;
    if (parsed && typeof parsed === "object" && parsed.errcode != null) {
      return parsed;
    }
  } catch {
    // 不是 JSON：是 PNG 图片流，正常
  }
  return null;
}

const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

export async function POST(_request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey) || isPlaceholder(serviceRoleKey)) {
    return jsonResponse({ error: "服务端 Supabase 未配置", code: "supabase_not_configured" }, { status: 501 });
  }
  if (!isWeappConfigured()) {
    return jsonResponse(
      { error: "小程序登录未配置：请在服务端设置 WEAPP_APPID 与 WEAPP_SECRET", code: "weapp_not_configured" },
      { status: 501 }
    );
  }

  // 1. 生成一次性 sessionId（scene 上限 32 可见字符）
  const uuid = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const admin = createSupabaseClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2. 顺带清理过期行（低频，不额外加定时任务）
  await admin.from("wechat_login_sessions").delete().lt("expires_at", new Date().toISOString());

  // 3. 预登记会话行
  const { error: insertErr } = await admin
    .from("wechat_login_sessions")
    .insert({ uuid, expires_at: expiresAt });
  if (insertErr) {
    console.error("[weapp/qrcode] 登记会话失败:", insertErr.message);
    return jsonResponse({ error: "生成二维码失败，请稍后重试", code: "session_write_failed" }, { status: 502 });
  }

  // 4. 生成小程序码（失败则删除预登记行，避免孤儿会话）
  const envVersion =
    process.env.WEAPP_QR_ENV === "trial" || process.env.WEAPP_QR_ENV === "develop"
      ? process.env.WEAPP_QR_ENV
      : "release";
  try {
    const token = await getWeappAccessToken();
    const res = await fetch(`${WXACODE_URL}?access_token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scene: uuid,
        page: LOGIN_CONFIRM_PAGE,
        check_path: false,
        width: 430,
        auto_color: false,
        line_color: { r: 0, g: 0, b: 0 },
        env_version: envVersion,
      }),
    });
    if (!res.ok) {
      throw new Error(`getwxacodeunlimit HTTP ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const err = parseErrorResponse(buffer.toString("utf-8"));
    if (err) {
      // 40001/42001：token 失效，强制刷新供下一次调用使用（前端刷新二维码重试）
      if (err.errcode === 40001 || err.errcode === 42001) {
        await getWeappAccessToken(true);
      }
      throw new Error(`小程序码生成失败：${err.errcode} ${err.errmsg ?? ""}`);
    }
    return jsonResponse({ data: { uuid, qrBase64: buffer.toString("base64") } });
  } catch (err) {
    await admin.from("wechat_login_sessions").delete().eq("uuid", uuid);
    console.error("[weapp/qrcode] 生成小程序码失败:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "生成二维码失败，请稍后重试", code: "qrcode_failed" },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add app/api/auth/weapp/qrcode/route.ts
git commit -m "feat(auth): /api/auth/weapp/qrcode 生成扫码登录二维码"
```

---

### Task 6: `POST /api/auth/weapp/confirm-login`

**Files:**
- Create: `app/api/auth/weapp/confirm-login/route.ts`

- [ ] **Step 1: 创建路由**

```ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { jsonResponse } from "@/lib/utils";
import { isWeappConfigured } from "@/lib/wechat";
import {
  exchangeCodeForSession,
  WeappSessionError,
  httpStatusForWeappError,
} from "@/lib/auth/weapp-session";

/**
 * POST /api/auth/weapp/confirm-login — 小程序「确认登录」页调用
 *
 * 请求 { code, uuid }：code 为 wx.login 凭证，uuid 为 PC 端二维码携带的 sessionId。
 * 流程：校验会话行有效 → 微信登录（自动注册，返回 token 供小程序自动登录）
 * → 幂等登记 openid/user_id → PC 轮询端消费。
 *
 * 响应：{ accessToken, refreshToken, expiresAt, isNewUser }
 */

const UUID_RE = /^[0-9a-f]{32}$/;
const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

export async function POST(request: Request) {
  let body: { code?: string; uuid?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const code = body.code?.trim();
  const uuid = body.uuid?.trim().toLowerCase() ?? "";
  if (!code) {
    return jsonResponse({ error: "缺少微信登录 code" }, { status: 400 });
  }
  if (!UUID_RE.test(uuid)) {
    return jsonResponse({ error: "无效的登录二维码" }, { status: 400 });
  }

  if (!isWeappConfigured()) {
    return jsonResponse(
      { error: "小程序登录未配置：请在服务端设置 WEAPP_APPID 与 WEAPP_SECRET", code: "weapp_not_configured" },
      { status: 501 }
    );
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey) || isPlaceholder(serviceRoleKey)) {
    return jsonResponse({ error: "服务端 Supabase 未配置", code: "supabase_not_configured" }, { status: 501 });
  }

  try {
    const admin = createSupabaseClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. 校验登录会话行有效
    const { data: row, error: rowErr } = await admin
      .from("wechat_login_sessions")
      .select("uuid")
      .eq("uuid", uuid)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) {
      return jsonResponse({ error: "二维码已失效，请刷新后重试", code: "login_session_expired" }, { status: 400 });
    }

    // 2. 微信登录 + 自动注册（返回 token，小程序端顺带自动登录）
    const session = await exchangeCodeForSession(code);

    // 3. 幂等登记 openid/user_id → PC 轮询端消费；影响 0 行视为已被消费/过期
    const { data: updated, error: updateErr } = await admin
      .from("wechat_login_sessions")
      .update({ openid: session.openid, user_id: session.user.id })
      .eq("uuid", uuid)
      .gt("expires_at", new Date().toISOString())
      .select("uuid");
    if (updateErr) throw updateErr;
    if (!updated || updated.length === 0) {
      return jsonResponse({ error: "二维码已失效，请刷新后重试", code: "login_session_expired" }, { status: 400 });
    }

    return jsonResponse({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      isNewUser: session.isNewUser,
    });
  } catch (err) {
    if (err instanceof WeappSessionError) {
      console.error("[weapp/confirm-login] 微信登录失败:", err.code, err.message);
      return jsonResponse(
        { error: err.message, code: err.code },
        { status: httpStatusForWeappError(err) }
      );
    }
    console.error("[weapp/confirm-login] 未捕获异常:", err);
    return jsonResponse({ error: "登录失败，请稍后重试", code: "internal_error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add app/api/auth/weapp/confirm-login/route.ts
git commit -m "feat(auth): /api/auth/weapp/confirm-login 小程序确认登录"
```

---

### Task 7: `POST /api/auth/weapp/login-status`（PC 长轮询）

**Files:**
- Create: `app/api/auth/weapp/login-status/route.ts`

- [ ] **Step 1: 创建路由**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { CookiesToSet } from "@/lib/supabase/cookies";
import { safeRedirectPath } from "@/lib/utils";
import {
  exchangeOpenIdForSession,
  WeappSessionError,
  httpStatusForWeappError,
} from "@/lib/auth/weapp-session";

/**
 * POST /api/auth/weapp/login-status — PC 端长轮询扫码登录结果（无需登录）
 *
 * 教程原案：最多 10 次 × 2s ≈ 20s（EdgeOne Cloud Functions 默认 30s 上限内）。
 * 命中（openid 已登记）→ 原子消费（DELETE RETURNING）→ 用 openid 建立 Web 会话
 * → 响应直写 sb-* cookie（与 /api/auth/signin 同模式）→ { status: "ok" }。
 * 未命中 → { status: "pending" }（前端续发）；行不存在/过期 → { status: "expired" }。
 */

const UUID_RE = /^[0-9a-f]{32}$/;
const MAX_CHECKS = 10;
const CHECK_INTERVAL_MS = 2_000;

const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: NextRequest) {
  let body: { uuid?: string; redirect?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", error: "请求体必须是 JSON" }, { status: 400 });
  }
  const uuid = body.uuid?.trim().toLowerCase() ?? "";
  const redirect = safeRedirectPath(body.redirect);
  if (!UUID_RE.test(uuid)) {
    return NextResponse.json({ status: "error", error: "无效的登录二维码" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey) || isPlaceholder(serviceRoleKey)) {
    return NextResponse.json(
      { status: "error", error: "服务端 Supabase 未配置", code: "supabase_not_configured" },
      { status: 501 }
    );
  }

  const admin = createSupabaseClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (let i = 0; i < MAX_CHECKS; i++) {
    const { data: row, error: rowErr } = await admin
      .from("wechat_login_sessions")
      .select("uuid, openid, expires_at")
      .eq("uuid", uuid)
      .maybeSingle();
    if (rowErr) {
      console.error("[weapp/login-status] 查询失败:", rowErr.message);
      return NextResponse.json(
        { status: "error", error: "服务暂不可用，请稍后重试", code: "status_query_failed" },
        { status: 502 }
      );
    }
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
      // 行不存在（伪造 uuid）或已过期 → 直接终止
      return NextResponse.json({ status: "expired" });
    }
    if (row.openid) {
      // 已确认：原子消费（DELETE RETURNING），防重复登录
      const { data: consumed, error: delErr } = await admin
        .from("wechat_login_sessions")
        .delete()
        .eq("uuid", uuid)
        .select("openid");
      if (delErr) {
        console.error("[weapp/login-status] 消费失败:", delErr.message);
        return NextResponse.json(
          { status: "error", error: "服务暂不可用，请稍后重试", code: "status_consume_failed" },
          { status: 502 }
        );
      }
      if (!consumed || consumed.length === 0) {
        // 已被并发轮询消费 → 视为 pending，前端续发
        return NextResponse.json({ status: "pending" });
      }

      // 用 openid 建立 Web 会话（虚拟邮箱 + magic link，无微信调用）
      let session;
      try {
        session = await exchangeOpenIdForSession(consumed[0].openid);
      } catch (err) {
        if (err instanceof WeappSessionError) {
          return NextResponse.json(
            { status: "error", error: err.message, code: err.code },
            { status: httpStatusForWeappError(err) }
          );
        }
        console.error("[weapp/login-status] 建立会话失败:", err);
        return NextResponse.json(
          { status: "error", error: "登录失败，请稍后重试", code: "internal_error" },
          { status: 500 }
        );
      }

      // 写 sb-* cookies 到响应（与 /api/auth/signin 完全同模式）
      const sbCookies: CookiesToSet = [];
      const supabase = createServerClient(supabaseUrl!, anonKey!, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: CookiesToSet) {
            sbCookies.push(...cookiesToSet);
          },
        },
      });
      const { error: setErr } = await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      if (setErr) {
        console.error("[weapp/login-status] setSession 失败:", setErr.message);
        return NextResponse.json(
          { status: "error", error: "建立会话失败，请稍后重试", code: "session_failed" },
          { status: 502 }
        );
      }

      const isProd = process.env.NODE_ENV === "production";
      const res = NextResponse.json({
        status: "ok",
        isNewUser: session.isNewUser,
        redirect,
      });
      for (const { name, value, options } of sbCookies) {
        res.cookies.set(name, value, {
          ...options,
          httpOnly: options.httpOnly ?? true,
          sameSite: options.sameSite ?? "lax",
          secure: options.secure ?? isProd,
          path: options.path ?? "/",
        });
      }
      return res;
    }
    if (i < MAX_CHECKS - 1) {
      await sleep(CHECK_INTERVAL_MS);
    }
  }
  return NextResponse.json({ status: "pending" });
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add app/api/auth/weapp/login-status/route.ts
git commit -m "feat(auth): /api/auth/weapp/login-status PC 长轮询登录结果并写 cookie"
```

---

### Task 8: Web 登录页接入微信扫码登录

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `components/auth/LoginClient.tsx`
- Create: `components/auth/WechatQrLogin.tsx`

- [ ] **Step 1: `app/login/page.tsx` 增加 wechatEnabled**

将 `app/login/page.tsx` 中 `qqEnabled` 一行后增加 `wechatEnabled`，并把 prop 传给 `LoginClient`：

```tsx
  const qqEnabled = Boolean(process.env.QQ_APP_ID);
  const wechatEnabled = Boolean(process.env.WEAPP_APPID && process.env.WEAPP_SECRET);
```

```tsx
  return (
    <LoginClient
      qqEnabled={qqEnabled}
      wechatEnabled={wechatEnabled}
      initialError={params.error ?? null}
    />
  );
```

- [ ] **Step 2: `components/auth/LoginClient.tsx` 增加按钮与弹窗**

修改 `LoginClientProps` 接口（增加 `wechatEnabled: boolean`），`LoginForm` 接收新 prop，并在「或」分隔线区块（现有 QQ 登录 `<a>` 前后）追加微信登录按钮与弹窗：

```tsx
import { WechatQrLogin } from "@/components/auth/WechatQrLogin";
```

在 `LoginForm` 内 `const [mode, setMode] = ...` 附近新增状态：

```tsx
  const [wechatOpen, setWechatOpen] = useState(false);
```

在现有 QQ 登录 `<a>` 之后（`{qqEnabled ? (...) : null}` 块结束后）追加：

```tsx
        {wechatEnabled ? (
          <button
            type="button"
            onClick={() => setWechatOpen(true)}
            className="flex w-full animate-slide-up-fade items-center justify-center gap-2 rounded-lg bg-[#07C160] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#06AD56] hover:shadow-md active:scale-[0.98]"
            style={{ animationDelay: "560ms" }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
              <path d="M9.5 4C5.36 4 2 6.69 2 10c0 1.89 1.08 3.56 2.78 4.66l-.7 2.14a.4.4 0 0 0 .61.43l2.42-1.47c.77.21 1.59.34 2.39.34h.66a5.9 5.9 0 0 1-.16-1.35C10 11.11 12.7 8.6 16 8.6c.36 0 .71.04 1.06.09C16.22 5.9 13.14 4 9.5 4zM7.2 7.9a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm4.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zM16 9.6c-2.98 0-5.4 1.9-5.4 4.25 0 1.22.66 2.31 1.7 3.05l-.5 1.52a.29.29 0 0 0 .43.3l1.72-1.04c.66.18 1.33.28 2.05.28 2.98 0 5.4-1.9 5.4-4.25S18.98 9.6 16 9.6zm-1.55 2.1a.72.72 0 1 1 0 1.44.72.72 0 0 1 0-1.44zm3.1 0a.72.72 0 1 1 0 1.44.72.72 0 0 1 0-1.44z" />
            </svg>
            微信登录
          </button>
        ) : null}

        <WechatQrLogin
          open={wechatOpen}
          onClose={() => setWechatOpen(false)}
          redirect={redirect}
        />
```

同时把 `LoginClient` 组件 props 透传（`<LoginForm {...props} />` 已透传，只需接口增加字段）。

- [ ] **Step 3: 创建 `components/auth/WechatQrLogin.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type QrState = "generating" | "waiting" | "polling" | "success" | "expired" | "error";

interface WechatQrLoginProps {
  open: boolean;
  onClose: () => void;
  redirect: string;
}

/**
 * 微信扫码登录弹窗：
 * 生成小程序码（POST /api/auth/weapp/qrcode）→ 展示二维码
 * → 长轮询 POST /api/auth/weapp/login-status（pending 续发）
 * → ok 时服务端已写 cookie，硬跳 redirect。
 */
export function WechatQrLogin({ open, onClose, redirect }: WechatQrLoginProps) {
  const [state, setState] = useState<QrState>("generating");
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const uuidRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
  }, []);

  const refresh = useCallback(() => {
    stoppedRef.current = false;
    uuidRef.current = null;
    setQrBase64(null);
    setErrorMsg(null);
    setState("generating");
    setRefreshNonce((n) => n + 1);
  }, []);

  // 生成二维码
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/weapp/qrcode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const info = (await res.json().catch(() => ({}))) as {
          data?: { uuid: string; qrBase64: string };
          error?: string;
          code?: string;
        };
        if (cancelled || stoppedRef.current) return;
        if (!res.ok || !info.data) {
          setErrorMsg(
            info.code === "weapp_not_configured"
              ? "服务端未配置小程序登录，请联系管理员"
              : info.error || "生成二维码失败"
          );
          setState("error");
          return;
        }
        uuidRef.current = info.data.uuid;
        setQrBase64(info.data.qrBase64);
        setState("waiting");
        // 教程：延迟 5 秒开始轮询，给用户扫码时间
        setTimeout(() => {
          if (!cancelled && !stoppedRef.current) setState("polling");
        }, 5000);
      } catch {
        if (!cancelled && !stoppedRef.current) {
          setErrorMsg("生成二维码失败，请重试");
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshNonce]);

  // 长轮询登录结果（每次最多 ~20s，pending 则间隔 1s 续发）
  useEffect(() => {
    if (!open || state !== "polling") return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || stoppedRef.current) return;
      try {
        const res = await fetch("/api/auth/weapp/login-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uuid: uuidRef.current, redirect }),
        });
        const info = (await res.json().catch(() => ({}))) as {
          status?: string;
          redirect?: string;
          error?: string;
        };
        if (cancelled || stoppedRef.current) return;
        if (info.status === "ok") {
          setState("success");
          // 会话 cookie 已由服务端写入，硬跳完成登录
          window.location.href = info.redirect ?? redirect;
        } else if (info.status === "expired") {
          setState("expired");
        } else if (info.status === "pending") {
          setTimeout(poll, 1000);
        } else {
          setErrorMsg(info.error || "登录状态查询失败");
          setState("error");
        }
      } catch {
        if (!cancelled && !stoppedRef.current) {
          setTimeout(poll, 2000); // 网络抖动重试
        }
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state, redirect]);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? undefined : onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">微信扫码登录</DialogTitle>
          <DialogDescription className="text-center">
            使用微信扫一扫，在小程序中确认登录
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {state === "generating" || state === "waiting" || state === "polling" ? (
            <>
              <div className="flex h-56 w-56 items-center justify-center rounded-xl border bg-white p-2">
                {qrBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/png;base64,${qrBase64}`}
                    alt="微信登录二维码"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {state === "generating"
                  ? "正在生成二维码…"
                  : state === "waiting"
                    ? "请使用微信扫一扫"
                    : "已扫码，等待手机确认…"}
              </p>
            </>
          ) : state === "expired" ? (
            <>
              <p className="text-sm text-muted-foreground">二维码已失效，请刷新后重试</p>
              <Button type="button" onClick={refresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                刷新二维码
              </Button>
            </>
          ) : state === "error" ? (
            <>
              <p className="text-sm text-destructive">{errorMsg ?? "出错了"}</p>
              <Button type="button" variant="outline" onClick={refresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重试
              </Button>
            </>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-3 top-3 h-7 w-7 p-0"
          onClick={onClose}
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: 类型检查 + 构建**

```bash
npx tsc --noEmit
npm run build
```

Expected: tsc 无错误；Next.js 构建成功（Web 端编译通过）。

- [ ] **Step 5: 提交**

```bash
git add app/login/page.tsx components/auth/LoginClient.tsx components/auth/WechatQrLogin.tsx
git commit -m "feat(web): 登录页接入微信扫码登录（WechatQrLogin 弹窗）"
```

---

### Task 9: 配置与文档

**Files:**
- Modify: `edgeone.json`
- Modify: `.env.example`
- Modify: `docs/api.md`

- [ ] **Step 1: `edgeone.json` 增加 Cloud Functions 执行时长**

将 `edgeone.json` 替换为：

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "nodeVersion": "22.11.0",
  "cloudFunctions": {
    "maxDuration": 60
  }
}
```

说明：PC 长轮询单请求最长约 20s，EdgeOne Cloud Functions 默认 30s 已够用；配到 60s 是为慢查询/微信接口抖动留余量（范围 10–120s）。

- [ ] **Step 2: `.env.example` 增加 `WEAPP_QR_ENV`**

在 `.env.example` 的微信小程序区块（`WEAPP_SECRET=your-weapp-secret` 之后）追加：

```
# PC 扫码登录二维码指向的小程序版本：release（正式版，默认）/ trial（体验版）/ develop（开发版）
# 体验版/开发版仅测试成员可扫；正式上线用 release
WEAPP_QR_ENV=release
```

- [ ] **Step 3: `docs/api.md` 增加三个接口文档**

在 `docs/api.md` 的「### POST /api/auth/weapp/refresh」小节之后追加：

````markdown
### PC 端微信扫码登录（小程序辅助确认）

微信开放平台微信登录仅对企业开放；本方案借小程序实现 PC 扫码登录：PC 显示小程序码 → 微信扫码打开小程序「确认登录」页 → 确认后 PC 自动登录，小程序端顺带自动登录（同一 openid → 同一账号）。

```
PC /login 点「微信扫码登录」
→ POST /api/auth/weapp/qrcode
    ├─ 生成 32 位 sessionId，登记 wechat_login_sessions（TTL 5min）
    └─ getwxacodeunlimit 生成小程序码（scene=sessionId，指向 pages/login-confirm/index）
→ PC 展示二维码，长轮询 POST /api/auth/weapp/login-status { uuid }
→ 微信扫码 → 小程序确认页 → POST /api/auth/weapp/confirm-login { code, uuid }
    ├─ 微信登录（自动注册），返回 token → 小程序自动登录
    └─ 登记 openid → PC 轮询命中
→ PC 轮询命中 → 服务端写 sb-* cookie → { status: "ok" } → 硬跳首页
```

#### POST /api/auth/weapp/qrcode

| 项 | 说明 |
|----|------|
| 请求体 | `{}`（无需登录） |
| 成功 | `200 { data: { uuid, qrBase64 } }`（PNG base64） |
| 501 | 服务端未配置 `WEAPP_APPID`/`WEAPP_SECRET`（`code: weapp_not_configured`）或 Supabase（`code: supabase_not_configured`） |
| 502 | 小程序码生成失败（`code: qrcode_failed`） |

二维码指向的小程序版本由 `WEAPP_QR_ENV` 控制：`release`（默认）/ `trial` / `develop`。

#### POST /api/auth/weapp/confirm-login

| 项 | 说明 |
|----|------|
| 请求体 | `{ "code": "wx.login() 凭证", "uuid": "PC 二维码携带的 sessionId" }` |
| 成功 | `200 { accessToken, refreshToken, expiresAt, isNewUser }`（小程序存本地即完成登录） |
| 400 | uuid 无效 / 二维码已失效（`code: login_session_expired`） |
| 401 | 微信 code 无效或已被使用（40029 / 40163） |
| 501 | 服务端未配置（`weapp_not_configured` / `supabase_not_configured`） |

#### POST /api/auth/weapp/login-status

| 项 | 说明 |
|----|------|
| 请求体 | `{ "uuid": "...", "redirect": "/" }`（无需登录） |
| 成功 | `200 { status: "ok", isNewUser, redirect }`，响应同时写入 `sb-*` 会话 cookie |
| pending | `200 { status: "pending" }` — 未确认，前端应续发（长轮询单次约 20s） |
| expired | `200 { status: "expired" }` — 二维码已失效，提示刷新 |
| 502 | 查询/消费/建会话失败（`status_query_failed` / `status_consume_failed` 等） |
````

- [ ] **Step 4: 提交**

```bash
git add edgeone.json .env.example docs/api.md
git commit -m "docs(auth): PC 扫码登录配置与 API 文档（edgeone maxDuration / WEAPP_QR_ENV）"
```

---

### Task 10: main 全量验证并推送

**Files:** 无（验证 + 推送）

- [ ] **Step 1: 全量验证**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: tsc 无错误；全部单测 PASS（`lib/wechat.test.ts` + `lib/auth/weapp-session.test.ts`）。

- [ ] **Step 2: 推送 main（供 weapp 分支 merge 同步）**

```bash
git push origin main
```

Expected: 推送成功，`origin/main` 包含本阶段全部提交。

---

## 阶段 B — weapp 分支：小程序确认页

### Task 11: 切换到 weapp 分支并同步 main

**Files:** 无

- [ ] **Step 1: 切换分支并合并**

```bash
git checkout weapp
git merge main
```

Expected: 合并成功（`weapp/` 源码在 weapp 分支、main 的后端改动无冲突，参考既有先例）。

- [ ] **Step 2: 确认 weapp 源码存在**

```bash
Test-Path weapp/src/app.config.ts
```

Expected: `True`。

---

### Task 12: `weapp/src/utils/auth.ts` 提取 `saveSession`

**Files:**
- Modify: `weapp/src/utils/auth.ts`

- [ ] **Step 1: 提取公共函数**

在 `weapp/src/utils/auth.ts` 的 `weappLogin` 函数前插入：

```ts
/** 保存会话凭据到本地存储（weappLogin 与 login-confirm 页共用） */
export function saveSession(session: WeappSession) {
  Taro.setStorageSync(TOKEN_KEY, session.accessToken);
  Taro.setStorageSync(REFRESH_KEY, session.refreshToken);
  if (session.expiresAt) Taro.setStorageSync(EXPIRES_KEY, session.expiresAt);
}
```

- [ ] **Step 2: `weappLogin` 改用 `saveSession`**

将 `weappLogin` 内的三行存储代码替换为调用：

```ts
    const session = await request<WeappSession>("/api/auth/weapp/login", {
      method: "POST",
      data: { code },
      auth: false,
    });

    saveSession(session);
    return session;
```

- [ ] **Step 3: 提交**

```bash
git add weapp/src/utils/auth.ts
git commit -m "refactor(weapp): 提取 saveSession 供登录确认页复用"
```

---

### Task 13: 小程序「确认登录」页

**Files:**
- Create: `weapp/src/pages/login-confirm/index.tsx`
- Create: `weapp/src/pages/login-confirm/index.scss`
- Create: `weapp/src/pages/login-confirm/index.config.ts`
- Modify: `weapp/src/app.config.ts`

- [ ] **Step 1: 创建 `weapp/src/pages/login-confirm/index.config.ts`**

```ts
export default definePageConfig({
  navigationBarTitleText: "确认登录",
});
```

- [ ] **Step 2: 创建 `weapp/src/pages/login-confirm/index.tsx`**

```tsx
import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { request, ApiError } from "@/utils/request";
import { saveSession, type WeappSession } from "@/utils/auth";
import "./index.scss";

/**
 * 确认登录页 — PC 扫码登录链路的小程序端确认页。
 *
 * 进入方式：微信扫 PC 端展示的小程序码（getwxacodeunlimit，scene=sessionId）。
 * scene 参数由微信自动写入 onLoad options（Taro 中为 router.params.scene）。
 * 点击「确认登录」→ wx.login 拿 code → POST /api/auth/weapp/confirm-login
 * → 返回 token 本地保存（小程序顺带自动登录）→ PC 端轮询命中自动登录。
 */
export default function LoginConfirmPage() {
  const [uuid, setUuid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const params = Taro.getCurrentInstance().router?.params ?? {};
    const scene = String(params.scene ?? "").trim().toLowerCase();
    if (!scene) {
      setHint("无效的登录二维码，请回到 PC 端重新生成");
    } else {
      setUuid(scene);
    }
  }, []);

  const confirm = async () => {
    if (loading || !uuid) return;
    setLoading(true);
    setHint(null);
    try {
      const { code } = await Taro.login();
      if (!code) throw new Error("未获取到微信登录凭证");
      const session = await request<WeappSession>("/api/auth/weapp/confirm-login", {
        method: "POST",
        data: { code, uuid },
        auth: false,
        silent: true,
      });
      saveSession(session);
      Taro.showToast({ title: "认证完成，PC 端即将登录", icon: "success", duration: 2000 });
      setTimeout(() => {
        Taro.navigateBack({
          fail: () => Taro.switchTab({ url: "/pages/index/index" }),
        });
      }, 800);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.code === "login_session_expired"
            ? "二维码已失效，请回到 PC 端刷新后重试"
            : err.message
          : err instanceof Error
            ? err.message
            : "认证失败，请重试";
      setHint(msg);
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) });
  };

  return (
    <View className="confirm-page">
      <View className="brand-section">
        <View className="logo">
          <Text className="logo-emoji">🍜</Text>
        </View>
        <Text className="brand-name">飨刻</Text>
        <Text className="brand-slogan">确认登录 PC 端</Text>
      </View>

      <View className="action-section">
        <Text className="desc">你在电脑上请求了微信登录，请确认是本人在操作</Text>
        {hint && <Text className="hint">{hint}</Text>}
        <Button
          className="btn-confirm"
          loading={loading}
          disabled={loading || !uuid}
          onClick={() => void confirm()}
        >
          确认登录
        </Button>
        <Button className="btn-cancel" disabled={loading} onClick={goBack}>
          取消
        </Button>
      </View>
    </View>
  );
}
```

> 说明：读取路由参数用 `Taro.getCurrentInstance().router?.params`，与 `pages/webview/index.tsx` 模式一致；scene 由微信自动解码进 `params.scene`。

- [ ] **Step 3: 创建 `weapp/src/pages/login-confirm/index.scss`**

```scss
@import "../../styles/_tokens.scss";

.confirm-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: linear-gradient(135deg, #ff6b36 0%, #ff8c42 100%);
  padding: 96rpx 48rpx 64rpx;
  box-sizing: border-box;
}

.brand-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;

  .logo {
    width: 160rpx;
    height: 160rpx;
    border-radius: 40rpx;
    background: rgba(255, 255, 255, 0.18);
    display: flex;
    align-items: center;
    justify-content: center;

    .logo-emoji {
      font-size: 88rpx;
    }
  }

  .brand-name {
    font-size: 56rpx;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 4rpx;
  }

  .brand-slogan {
    font-size: 28rpx;
    color: rgba(255, 255, 255, 0.9);
  }
}

.action-section {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 24rpx;

  .desc {
    font-size: 26rpx;
    color: rgba(255, 255, 255, 0.92);
    text-align: center;
    line-height: 1.6;
  }

  .hint {
    font-size: 24rpx;
    color: #fff3cd;
    text-align: center;
  }

  .btn-confirm {
    background: #ffffff;
    color: #ff6b35;
    font-size: 32rpx;
    font-weight: 600;
    border-radius: 999rpx;
    height: 96rpx;
    line-height: 96rpx;

    &::after {
      border: none;
    }
  }

  .btn-cancel {
    background: rgba(255, 255, 255, 0.14);
    color: #ffffff;
    font-size: 30rpx;
    border-radius: 999rpx;
    height: 88rpx;
    line-height: 88rpx;

    &::after {
      border: none;
    }
  }
}
```

- [ ] **Step 4: `weapp/src/app.config.ts` 注册页面**

在 `pages` 数组的 `"pages/login/index"` 之后追加一行：

```ts
    "pages/login-confirm/index",
```

- [ ] **Step 5: 构建验证**

在 `weapp/` 目录执行：

```bash
cd weapp
npm run build:weapp
```

Expected: Taro 构建成功，`dist/` 输出包含 `pages/login-confirm/index` 页面。

- [ ] **Step 6: 提交**

```bash
git add weapp/src/pages/login-confirm weapp/src/app.config.ts
git commit -m "feat(weapp): 新增扫码登录确认页 pages/login-confirm"
```

---

### Task 14: weapp 全量验证并推送

**Files:** 无（验证 + 推送）

- [ ] **Step 1: 确认构建产物**

```bash
cd weapp
npm run build:weapp
```

Expected: 构建成功。

- [ ] **Step 2: 推送 weapp**

```bash
git push origin weapp
```

Expected: 推送成功，`origin/weapp` 包含确认页改动。

---

## 验收清单（人工，联调阶段执行）

- [ ] 本地 `next dev` + 微信开发者工具（`weapp/.env` 的 `TARO_APP_API_BASE` 填局域网 IP，勾选「不校验合法域名」）
- [ ] `WEAPP_QR_ENV=trial` 下：`/login` 点「微信登录」→ 二维码出现 → 体验版成员扫码 → 小程序确认页显示 → 点「确认登录」→ PC 自动跳转首页、小程序已登录
- [ ] 未配置 `WEAPP_APPID/WEAPP_SECRET` 时：登录页不显示微信按钮
- [ ] 5 分钟不扫码：PC 弹窗提示「二维码已失效」，可刷新
- [ ] 回归：小程序原有「微信一键登录」、Web 邮箱/QQ 登录不受影响
- [ ] 正式上线：小程序发布含 `pages/login-confirm/index` 的正式版，`WEAPP_QR_ENV=release`
