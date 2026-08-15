import { NextResponse, type NextRequest } from "next/server";

/**
 * 中间件：刷新 Supabase 会话 cookie + 路由保护。
 *
 * EdgeOne 使用 OpenNext 适配器，middleware 会被编译为 V8 edge function：
 * - @supabase/ssr 在 edge isolate 中可能崩溃（历史上表现为全站空响应）
 * - 崩溃会被 OpenNext 静默吞掉并放行请求（无重定向、无会话刷新）
 *
 * 因此这里用 try/catch 显式兜底，并通过 x-mw-mode 响应头暴露运行状态：
 *   disabled = NEXT_DISABLE_MIDDLEWARE=1 透传
 *   full     = updateSession 正常执行
 *   crashed  = middleware 内部异常（查函数日志）
 */
export async function middleware(request: NextRequest) {
  if (process.env.NEXT_DISABLE_MIDDLEWARE === "1") {
    const res = NextResponse.next();
    res.headers.set("x-mw-mode", "disabled");
    return res;
  }
  try {
    const { updateSession } = await import("@/lib/supabase/middleware");
    const res = await updateSession(request);
    res.headers.set("x-mw-mode", "full");
    return res;
  } catch (err) {
    console.error("[middleware] 执行失败（已兜底放行）:", err);
    const res = NextResponse.next();
    res.headers.set("x-mw-mode", "crashed");
    return res;
  }
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
