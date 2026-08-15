import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CookiesToSet } from "@/lib/supabase/cookies";
import { getPublicOrigin, safeRedirectPath } from "@/lib/utils";

function isServerSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;
  if (url.startsWith("BUILD_PLACEHOLDER")) return false;
  if (url.includes("placeholder.supabase.co")) return false;
  if (anonKey.startsWith("BUILD_PLACEHOLDER")) return false;
  if (anonKey === "placeholder-anon-key") return false;
  return true;
}

/**
 * GET /api/auth/session
 * 调试端点：返回服务端 Supabase env 配置状态（不泄露完整 key）。
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = isServerSupabaseConfigured();

  return NextResponse.json({
    ok: configured,
    serverConfigured: configured,
    supabaseUrl: url
      ? `${url.slice(0, 30)}${url.length > 30 ? "..." : ""}`
      : "MISSING",
    anonKeyPresent: !!anonKey,
    anonKeyPrefix: anonKey ? anonKey.slice(0, 15) : "MISSING",
    anonKeyIsPlaceholder:
      !anonKey ||
      anonKey.startsWith("BUILD_PLACEHOLDER") ||
      anonKey === "placeholder-anon-key",
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "MISSING",
    nodeEnv: process.env.NODE_ENV,
  });
}

/**
 * POST /api/auth/session
 *
 * 备用接口：把浏览器端拿到的 access/refresh token 写入同域 cookie。
 * 目前主要登录链路是 /api/auth/signin（服务端版），不会走到这里。
 * 此接口留作未来 OAuth 回调之外的场景备用。
 */
export async function POST(request: NextRequest) {
  try {
    const _origin = getPublicOrigin(request);
    const _redirect = safeRedirectPath; // 保留引用避免 lint
    void _origin;
    void _redirect;

    let body: { accessToken?: string; refreshToken?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { ok: false, error: "请求体解析失败" },
        { status: 400 }
      );
    }

    const accessToken = body.accessToken?.trim();
    const refreshToken = body.refreshToken?.trim();

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { ok: false, error: "缺少 access_token / refresh_token" },
        { status: 400 }
      );
    }

    if (!isServerSupabaseConfigured()) {
      return NextResponse.json(
        { ok: false, error: "服务端 Supabase 环境变量未就绪" },
        { status: 500 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // --------------------------------------------------------------
    // 步骤 1：用 serviceRoleKey 调 auth.getUser 校验 accessToken 的合法性
    // 如果 SERVICE_ROLE_KEY 没设，降级跳过这步直接进 setSession。
    // --------------------------------------------------------------
    let userUid: string | null = null;
    try {
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        // 静态 import 正常的 createAdminClient（admin.ts 里 URL/KEY 校验失败会 throw）
        const admin = createAdminClient();
        const { data, error } = await admin.auth.getUser(accessToken);
        if (error) {
          return NextResponse.json(
            { ok: false, error: error.message, code: error.name },
            { status: 401 }
          );
        }
        if (!data.user) {
          return NextResponse.json(
            { ok: false, error: "access_token 无效" },
            { status: 401 }
          );
        }
        userUid = data.user.id;
      }
    } catch (err) {
      console.warn("[auth/session] admin.auth.getUser 跳过:", err);
    }

    // --------------------------------------------------------------
    // 步骤 2：setSession 写 sb-* cookies
    // --------------------------------------------------------------
    const sbCookies: CookiesToSet = [];
    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          sbCookies.push(...cookiesToSet);
        },
      },
    });

    const setRes = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (setRes.error) {
      // setSession 失败但 service role 已验证 token 为真 → 手动构造 cookie
      if (userUid) {
        console.warn(
          "[auth/session] setSession 失败但 getUser 通过，手动写 cookie:",
          setRes.error.message
        );
        const expDate = new Date();
        expDate.setHours(expDate.getHours() + 1);
        const refDate = new Date();
        refDate.setDate(refDate.getDate() + 30);

        let projectRef = "";
        try {
          projectRef = new URL(supabaseUrl).hostname.split(".")[0] ?? "";
        } catch {}

        if (projectRef) {
          const secure = process.env.NODE_ENV === "production";
          const mkCookie = (name: string, value: string, expires: Date) => ({
            name,
            value,
            options: {
              httpOnly: true,
              sameSite: "lax" as const,
              secure,
              path: "/",
              expires,
            },
          });
          sbCookies.push(
            mkCookie(`sb-${projectRef}-access-token`, accessToken, expDate),
            mkCookie(`sb-${projectRef}-refresh-token`, refreshToken, refDate),
            mkCookie(`sb-${projectRef}-auth-token`, accessToken, expDate)
          );
        } else {
          return NextResponse.json(
            { ok: false, error: setRes.error.message, code: setRes.error.name },
            { status: 401 }
          );
        }
      } else {
        return NextResponse.json(
          { ok: false, error: setRes.error.message, code: setRes.error.name },
          { status: 401 }
        );
      }
    }

    // --------------------------------------------------------------
    // 步骤 3：写入响应 cookies
    // --------------------------------------------------------------
    const isProd = process.env.NODE_ENV === "production";
    const res = NextResponse.json({ ok: true, uid: userUid ?? undefined });
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
  } catch (err) {
    console.error("[/api/auth/session] 未捕获异常:", err);
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json(
      { ok: false, error: `服务端异常: ${message}` },
      { status: 500 }
    );
  }
}
