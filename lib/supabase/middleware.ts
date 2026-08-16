import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookiesToSet } from "./cookies";

/** 公开路径白名单：已登录或未登录均可访问 */
const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/join",
  // 隐私政策 / 用户协议：小程序 web-view 与审核员均需免登录可访问
  "/privacy",
  "/agreement",
]);
const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/ai/status",
  "/_next/",
];
const PUBLIC_FILES = new Set<string>(["/icon.svg", "/favicon.ico", "/manifest.json"]);

/**
 * 判断是否为公开路径。
 *
 * 特例说明：
 * - `/groups/new` 需登录（创建圈子需鉴权），不在此白名单中
 * - OG 图路由（opengraph-image）需对社交平台爬虫放行，否则分享预览失效
 */
function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_FILES.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // OG 图路由对社交爬虫公开（无会话），否则分享预览会被 307 重定向到 /login
  if (pathname.endsWith("/opengraph-image")) return true;
  return false;
}

/**
 * 刷新 Supabase Auth 会话 Cookie，并执行路由保护。
 * - 公开路径（/login、/join、/api/auth/* 等）放行
 * - 已登录访问 /login -> 重定向到 /
 * - 未登录访问受保护路径 -> 重定向到 /login?redirect=...
 */
export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });
  const pendingCookies: CookiesToSet = [];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 如果环境变量里还没拿到真实值（仍是占位符或空），直接放行，
  // 不要 throw（之前会导致整个站点 500，登录页都打不开）。
  // 浏览器端登录按钮会在点击时把"Failed to fetch"提示给用户，
  // 此时运维去 CloudBase 控制台补充环境变量即可，不会完全不可用。
  const urlOk = url && !url.startsWith("BUILD_PLACEHOLDER") && !url.includes("placeholder");
  const keyOk = anonKey && !anonKey.startsWith("BUILD_PLACEHOLDER") && !anonKey.includes("placeholder") && anonKey !== "placeholder-anon-key";
  if (!urlOk || !keyOk) {
    console.warn(
      `[middleware] Supabase env 未就绪（URL=${urlOk ? "✓" : "✗"}，KEY=${keyOk ? "✓" : "✗"}），跳过会话刷新，直接放行请求。` +
      `请检查 CloudBase 运行时环境变量是否设置 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY。`
    );
    // 未登录访问非公开路径 → 仍重定向到 /login，避免暴露受保护页面
    const pathname = request.nextUrl.pathname;
    if (!isPublicPath(pathname)) {
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(redirectUrl);
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
