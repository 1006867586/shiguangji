import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/auth/qq/callback/route";

// ============================================================
// /api/auth/qq/callback GET handler 测试
//
// 该回调重度依赖外部 fetch（QQ 互联 token/me/用户信息）与 Supabase
// admin/server client，且无导出的纯函数辅助。本文件聚焦可在不引入
// supabase mock 的前提下稳定覆盖的早期返回路径（安全关键）：
//   1. state 校验失败 → 307 重定向 /login?error=qq_state_invalid
//   2. 环境变量缺失 → 307 重定向 /login?error=qq_not_configured
//   3. token 交换失败（fetch 返回非 ok）→ 307 重定向 /login?error=qq_token_failed
//
// 完整 token 交换 + 建立会话的成功路径需 mock @supabase/supabase-js 与
// @supabase/ssr，链路过长且脆弱，暂不覆盖。
// ============================================================

const ORIGIN = "http://localhost:3000";
const CALLBACK_URL = `${ORIGIN}/api/auth/qq/callback`;

// 本测试需要读写的环境变量键
const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "QQ_APP_ID",
  "QQ_APP_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

describe("GET /api/auth/qq/callback", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // 保存并清空相关环境变量，确保各用例环境隔离
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    vi.restoreAllMocks();
  });

  it("缺少 code/state 时重定向到登录页（qq_state_invalid）", async () => {
    const req = new NextRequest(CALLBACK_URL);
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("error=qq_state_invalid");
  });

  it("state 与 cookie 不匹配时返回 qq_state_invalid", async () => {
    const req = new NextRequest(`${CALLBACK_URL}?code=c&state=abc`, {
      headers: { cookie: "qq_oauth_state=xyz" },
    });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("error=qq_state_invalid");
  });

  it("state 校验通过但环境变量未配置 → qq_not_configured", async () => {
    // beforeEach 已清空环境变量
    const req = new NextRequest(`${CALLBACK_URL}?code=c&state=mystate`, {
      headers: { cookie: "qq_oauth_state=mystate" },
    });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("error=qq_not_configured");
  });

  it("token 交换失败（fetch 非 ok）→ qq_token_failed", async () => {
    // 配置环境变量，使流程越过 qq_not_configured 分支
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sb.example.com";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.QQ_APP_ID = "qq-app-id";
    process.env.QQ_APP_KEY = "qq-app-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    // mock fetch：token 接口返回非 ok，触发 qq_token_failed（不触达 supabase）
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("error", { status: 500 }) as Response
    );

    const req = new NextRequest(`${CALLBACK_URL}?code=c&state=mystate`, {
      headers: { cookie: "qq_oauth_state=mystate" },
    });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("error=qq_token_failed");
    // 仅调用了 token 这一次 fetch，未继续到 me / user_info
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
