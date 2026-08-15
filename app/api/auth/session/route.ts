import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookiesToSet } from "@/lib/supabase/cookies";
import { getPublicOrigin, safeRedirectPath } from "@/lib/utils";

/**
 * 检查服务端 process.env 中的 Supabase 配置是否已经是真实值（非占位符）。
 * entrypoint.sh 只替换 .next/static 下的 JS chunks 文本，
 * 但 server-side 代码读的是 process.env（运行时注入）。
 * 如果 CloudBase 运行时环境变量没设对，这里会是 BUILD_PLACEHOLDER_* 或空。
 */
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
 * 用于排查「前端 JS 有真实 URL 但服务端 process.env 还是占位符」的问题。
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
 * 浏览器端调用 signInWithPassword() / signUp() 成功后，
 * Supabase API 返回的 Set-Cookie 因为是跨域（m.zykh.top ↔ supabase.co）
 * 浏览器默认不会写入同域 cookie，导致 middleware 识别不到登录态、
 * router.replace('/') 被 307 回 /login（看起来"登录成功但没跳转"）。
 *
 * 这个 API 接收浏览器端拿到的 access_token/refresh_token，
 * 由服务端同域（m.zykh.top）把 session 写进 sb-* cookie。
 *
 * body: { accessToken: string; refreshToken: string; redirect?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const origin = getPublicOrigin(request);

    let body: { accessToken?: string; refreshToken?: string; redirect?: string } = {};
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
    const redirect = safeRedirectPath(body.redirect);

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { ok: false, error: "缺少 access_token / refresh_token" },
        { status: 400 }
      );
    }

    // 关键：检查服务端 env 是否真实值，不是占位符
    if (!isServerSupabaseConfigured()) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      console.error(
        "[/api/auth/session] Supabase env 未就绪：",
        `URL=${url ?? "MISSING"}`,
        `KEY=${anonKey ? `${anonKey.slice(0, 15)}...` : "MISSING"}`
      );
      return NextResponse.json(
        {
          ok: false,
          error:
            "服务端 Supabase 环境变量未就绪（仍是占位符或空值）。" +
            "请检查 CloudBase 控制台【服务设置 → 环境变量】中是否设置了" +
            "NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。",
          debug: {
            url: url ?? "MISSING",
            keyPresent: !!anonKey,
          },
        },
        { status: 500 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const sbCookies: CookiesToSet = [];
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          sbCookies.push(...cookiesToSet);
        },
      },
    });

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.name },
        { status: 401 }
      );
    }

    const isProd = process.env.NODE_ENV === "production";
    const buildResponse = (res: NextResponse) => {
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
    };

    if (redirect) {
      return buildResponse(
        NextResponse.redirect(`${origin}${redirect}`, { status: 303 })
      );
    }

    return buildResponse(NextResponse.json({ ok: true }));
  } catch (err) {
    console.error("[/api/auth/session] 未捕获异常:", err);
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json(
      { ok: false, error: `服务端异常: ${message}` },
      { status: 500 }
    );
  }
}
