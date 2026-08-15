import { NextResponse, type NextRequest } from "next/server";

/**
 * EdgeOne/OpenNext 兼容性说明（2026-08 排查结论）：
 *
 * EdgeOne 通过 OpenNext 适配器将本 middleware 编译为 V8 edge function，
 * @supabase/ssr 在该 isolate 中会崩溃，且 OpenNext 会静默吞错放行——
 * 既没有会话刷新，也没有路由保护，还曾导致全站空响应。
 *
 * 因此 middleware 在 EdgeOne 上整体退役，职责转移如下：
 * - 路由保护 → app/(main)/layout.tsx 的 getCurrentUser + redirect（已存在）
 * - API 鉴权 → lib/supabase/server.ts 的 requireUser（已存在）
 * - 会话刷新 → 服务端 createServerClient（cookies API 请求级读写）+
 *   LoginClient 内的 refreshSession 兜底
 * - /login 已登录跳转 → app/login/page.tsx 服务端检查（本次新增）
 *
 * 文件保留而非删除：Vercel/自托管/Docker 部署仍走 Node 运行时，
 * @supabase/ssr 在那里工作正常，middleware 依然提供最优路径。
 * 通过 NEXT_DISABLE_MIDDLEWARE=1 一键禁用（EdgeOne 环境变量已配置）。
 */
export async function middleware(request: NextRequest) {
  if (process.env.NEXT_DISABLE_MIDDLEWARE === "1") {
    return NextResponse.next();
  }
  try {
    const { updateSession } = await import("@/lib/supabase/middleware");
    return await updateSession(request);
  } catch (err) {
    // 兜底：middleware 内部异常时放行，避免整站不可用
    console.error("[middleware] 执行失败（已兜底放行）:", err);
    return NextResponse.next();
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
