import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookiesToSet } from "@/lib/supabase/cookies";
import { safeRedirectPath } from "@/lib/utils";

/**
 * POST /api/auth/signin
 *
 * 邮箱 + 密码登录（服务端版）。
 *
 * 为什么不用浏览器端直接 signInWithPassword？
 *   浏览器端 fetch 的是 Supabase API 域名（和 m.zykh.top 不同域），
 *   Supabase 返回的 Set-Cookie 因"跨域 + 站点 cookie"被浏览器拒绝写入，
 *   导致 signInWithPassword 返回 200，但实际没有会话 cookie，
 *   middleware 识别不到登录态、router.replace('/') 被 307 回 login。
 *
 * 服务端版流程：
 *   浏览器 POST { email, password, redirect? } → /api/auth/signin（同域）
 *   → createServerClient().auth.signInWithPassword()（服务端请求 Supabase，
 *     无跨域问题，且 @supabase/ssr 的 setAll 回调返回 sb-* cookies）
 *   → NextResponse.cookies.set() 写同域 cookie（浏览器必收）
 *   → 返回 { ok:true, redirect: "/" } → 前端 window.location.href 硬跳
 */
export async function POST(request: NextRequest) {
  try {
    let body: {
      email?: string;
      password?: string;
      redirect?: string;
    } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { ok: false, error: "请求体解析失败" },
        { status: 400 }
      );
    }

    const email = body.email?.trim();
    const password = body.password;
    const redirect = safeRedirectPath(body.redirect) ?? "/";

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "请填写邮箱和密码" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || supabaseUrl.includes("placeholder")) {
      return NextResponse.json(
        { ok: false, error: "Supabase 环境变量未配置" },
        { status: 500 }
      );
    }

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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      // Supabase 约定：invalid_credentials → 邮箱/密码错误
      if (
        error.name === "AuthInvalidCredentialsError" ||
        error.code === "invalid_credentials" ||
        error.message.toLowerCase().includes("invalid")
      ) {
        return NextResponse.json(
          { ok: false, error: "邮箱或密码错误" },
          { status: 401 }
        );
      }
      // 邮箱未确认等其他错误
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    // 写 sb-* cookies 到响应
    const isProd = process.env.NODE_ENV === "production";
    const res = NextResponse.json({ ok: true, redirect });
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
    console.error("[/api/auth/signin] 未捕获异常:", err);
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json(
      { ok: false, error: `服务端异常: ${message}` },
      { status: 500 }
    );
  }
}
