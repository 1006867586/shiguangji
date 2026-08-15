import { NextResponse, type NextRequest } from "next/server";

/**
 * 中间件：刷新 Supabase 会话 cookie + 路由保护。
 *
 * Node.js 运行时（Next.js 15.5+ 稳定特性）：
 * EdgeOne 等平台默认把 middleware 放进 V8 edge isolate，
 * @supabase/ssr 在其中会崩溃（所有匹配路由空响应），
 * 显式指定 nodejs 运行时可避免该问题。
 */
export const runtime = "nodejs";

/**
 * NEXT_DISABLE_MIDDLEWARE=1 时变为纯透传（不加载任何 Supabase 依赖）：
 * 用于排查平台兼容性问题。注意用动态 import，确保禁用时不打包依赖。
 */
export async function middleware(request: NextRequest) {
  if (process.env.NEXT_DISABLE_MIDDLEWARE === "1") {
    return NextResponse.next();
  }
  const { updateSession } = await import("@/lib/supabase/middleware");
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，但排除：
     * - _next/static、_next/image、favicon.ico
     * - 图片 / 静态资源
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
