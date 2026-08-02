import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookiesToSet } from "./cookies";

/** 公开路径白名单：已登录或未登录均可访问 */
const PUBLIC_PATHS = new Set<string>(["/login", "/join", "/groups/new"]);
const PUBLIC_PREFIXES = ["/api/auth/", "/_next/"];
const PUBLIC_FILES = new Set<string>(["/icon.svg", "/favicon.ico", "/manifest.json"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_FILES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * 刷新 Supabase Auth 会话 Cookie，并执行路由保护。
 * - 公开路径（/login、/join、/api/auth/* 等）放行
 * - 已登录访问 /login -> 重定向到 /
 * - 未登录访问受保护路径 -> 重定向到 /login?redirect=...
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const pendingCookies: CookiesToSet = [];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
        for (const c of cookiesToSet) pendingCookies.push(c);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 将刷新后的 cookie 写入响应
  const isProd = process.env.NODE_ENV === "production";
  const applyPendingCookies = (res: NextResponse) => {
    for (const { name, value, options } of pendingCookies) {
      res.cookies.set(name, value, {
        ...options,
        httpOnly: options.httpOnly ?? true,
        sameSite: options.sameSite ?? "lax",
        secure: options.secure ?? isProd,
        path: options.path ?? "/",
      });
    }
  };

  const pathname = request.nextUrl.pathname;

  // 已登录访问 /login -> 重定向到 /
  if (user && pathname === "/login") {
    const redirect = NextResponse.redirect(new URL("/", request.url));
    applyPendingCookies(redirect);
    return redirect;
  }

  // 未登录访问受保护路径 -> 重定向到 /login?redirect=pathname
  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    const redirect = NextResponse.redirect(redirectUrl);
    applyPendingCookies(redirect);
    return redirect;
  }

  // 正常放行时，把 cookie 写入 supabaseResponse
  applyPendingCookies(supabaseResponse);
  return supabaseResponse;
}
