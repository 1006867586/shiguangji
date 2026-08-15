import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookiesToSet } from "@/lib/supabase/cookies";
import { getPublicOrigin, safeRedirectPath } from "@/lib/utils";

/**
 * POST /api/auth/signup
 *
 * 邮箱 + 密码注册（服务端版）。
 *
 * 设计原因同 /api/auth/signin：避免浏览器端跨域 Supabase API
 * 返回的 Set-Cookie 被浏览器拦截。
 *
 * body: { email, password, nickname?, redirect? }
 */
export async function POST(request: NextRequest) {
  try {
    const origin = getPublicOrigin(request);

    let body: {
      email?: string;
      password?: string;
      nickname?: string;
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
    const nickname = body.nickname?.trim();
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

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nickname: nickname || email.split("@")[0],
        },
        emailRedirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(redirect)}`,
      },
    });

    if (error) {
      // 常见错误：邮箱已注册、密码强度不够等
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    // 写 cookies（如果 Supabase 直接签发 session，则 sbCookies 有值）
    const isProd = process.env.NODE_ENV === "production";
    const needVerify = !data.session; // 需要邮箱验证的情况
    const res = NextResponse.json({
      ok: true,
      redirect: needVerify ? undefined : redirect,
      needVerify,
      message: needVerify ? "注册成功，请前往邮箱确认后登录" : undefined,
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
  } catch (err) {
    console.error("[/api/auth/signup] 未捕获异常:", err);
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json(
      { ok: false, error: `服务端异常: ${message}` },
      { status: 500 }
    );
  }
}
