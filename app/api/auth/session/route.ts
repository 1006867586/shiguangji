import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookiesToSet } from "@/lib/supabase/cookies";
import { getPublicOrigin, safeRedirectPath } from "@/lib/utils";

/**
 * POST /api/auth/session
 *
 * 浏览器端调用 signInWithPassword() / signUp() 成功后，
 * Supabase API 返回的 Set-Cookie 因为是跨域（m.zykh.top ↔ zyitmtbx...supabase.co）
 * 浏览器默认不会写入同域 cookie，导致 middleware 识别不到登录态、
 * router.replace('/') 被 307 回 /login（看起来"登录成功但没跳转"）。
 *
 * 这个 API 接收浏览器端拿到的 access_token/refresh_token，
 * 由服务端同域（m.zykh.top）把 session 写进 sb-* cookie。
 * middleware/Server Component 下次请求就能正确读取登录态。
 *
 * body:
 *   {
 *     accessToken:  string;   // Supabase signInWithPassword 返回的 session.access_token
 *     refreshToken: string;   // ... session.refresh_token
 *     redirect?:    string;   // 成功后 303 跳转的目标路径（默认 /）
 *   }
 *
 * 响应：
 *   - 带有 redirect: 返回 303 + Set-Cookie sb-*
 *   - 不带 redirect: 返回 200 JSON { ok:true } + Set-Cookie sb-*
 */
export async function POST(request: NextRequest) {
  const origin = getPublicOrigin(request);

  let body: { accessToken?: string; refreshToken?: string; redirect?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // body 解析失败，直接返回跳 login
    return NextResponse.redirect(`${origin}/login`, { status: 303 });
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: "Supabase 未配置" },
      { status: 500 }
    );
  }

  // 服务端消费：通过 setSession(access, refresh) → 内部触发 cookies.setAll()
  // 让 @supabase/ssr 把 sb-access-token / sb-refresh-token / sb-auth-token 等
  // 全部以同域 cookie 的形式写入响应。
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
    return buildResponse(NextResponse.redirect(`${origin}${redirect}`, { status: 303 }));
  }

  return buildResponse(NextResponse.json({ ok: true }));
}
