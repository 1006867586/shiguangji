import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookiesToSet } from "./cookies";

/** 公开路径白名单：已登录或未登录均可访问 */
const PUBLIC_PATHS = new Set<string>(["/login", "/join"]);
const PUBLIC_PREFIXES = ["/api/auth/", "/_next/"];
const PUBLIC_FILES = new Set<string>(["/icon.svg", "/favicon.ico"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_FILES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * 刷新 Supabase Auth 会话 Cookie，并执行路由保护。
 * - 公开路径（/login、/join、/api/auth/* 等）放行
 * - 已登录访问 /login、/join -> 重定向到 /
 * - 未登录访问受保护路径 -> 重定向到 /login?redirect=...
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 未配置环境变量时：开发环境放行，生产环境抛错（避免静默放过鉴权）
  if (!url || !anonKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing Supabase env");
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() 会按需刷新会话 cookie（写入 supabaseResponse）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 已登录访问 /login、/join -> 重定向到 /
  if (user && (pathname === "/login" || pathname === "/join")) {
    const redirect = NextResponse.redirect(new URL("/", request.url));
    // 保留 cookie 刷新，避免重定向后丢失刚刷新的会话
    for (const c of supabaseResponse.headers.getSetCookie()) {
      redirect.headers.append("set-cookie", c);
    }
    return redirect;
  }

  // 未登录访问受保护路径 -> 重定向到 /login?redirect=pathname
  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    const redirect = NextResponse.redirect(redirectUrl);
    for (const c of supabaseResponse.headers.getSetCookie()) {
      redirect.headers.append("set-cookie", c);
    }
    return redirect;
  }

  return supabaseResponse;
}
