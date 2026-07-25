import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookiesToSet } from "@/lib/supabase/cookies";

/** GET /api/auth/callback — 处理 Supabase 邮箱/OAuth 回调 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // 先把 code 写入 request cookies，再创建 client 交换 session
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookiesToSet) {
        // 路由处理器中 request.cookies 只支持 name/value，options 通过响应设置
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${error.message}`);
  }

  // 交换成功后，把会话 cookie 同步到重定向响应
  const response = NextResponse.redirect(`${origin}${next}`);
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-")) {
      response.cookies.set(c.name, c.value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
    }
  }
  return response;
}
