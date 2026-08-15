import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookiesToSet } from "@/lib/supabase/cookies";
import { getPublicOrigin, safeRedirectPath } from "@/lib/utils";

function isServerSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;
  if (url.startsWith("BUILD_PLACEHOLDER")) return false;
  if (url.includes("placeholder.supabase.co")) return false;
  if (anonKey.startsWith("BUILD_PLACEHOLDER")) return false;
  if (anonKey === "placeholder-anon-key") return false;
  return true;
}

/**
 * GET /api/auth/session
 * 调试端点：返回服务端 Supabase env 配置状态（不泄露完整 key）。
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = isServerSupabaseConfigured();

  return NextResponse.json({
    ok: configured,
    serverConfigured: configured,
    supabaseUrl: url
      ? `${url.slice(0, 30)}${url.length > 30 ? "..." : ""}`
      : "MISSING",
    anonKeyPresent: !!anonKey,
    anonKeyPrefix: anonKey ? anonKey.slice(0, 15) : "MISSING",
    anonKeyIsPlaceholder:
      !anonKey ||
      anonKey.startsWith("BUILD_PLACEHOLDER") ||
      anonKey === "placeholder-anon-key",
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "MISSING",
    nodeEnv: process.env.NODE_ENV,
  });
}

/**
 * POST /api/auth/session
 *
 * 浏览器端调用 supabase.auth.signInWithPassword() 成功后，
 * 把拿到的 access_token / refresh_token POST 到这里，
 * 由服务端校验并以同域（m.zykh.top）cookie 方式写入会话，
 * 解决「Supabase API 返回的 Set-Cookie 因跨域被浏览器拒绝」的问题。
 *
 * 校验方式：使用 SUPABASE_SERVICE_ROLE_KEY 调 getUser(access_token)，
 * 确认 token 是 Supabase 真实签发的，不直接信任客户端传的任何字段。
 * 成功后把 cookies 写入响应。
 */
export async function POST(request: NextRequest) {
  try {
    const origin = getPublicOrigin(request);

    let body: { accessToken?: string; refreshToken?: string; redirect?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { ok: false, error: "请求体解析失败" },
        { status: 400 }
      );
    }

    const accessToken = body.accessToken?.trim();
    const refreshToken = body.refreshToken?.trim();

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { ok: false, error: "缺少 access_token / refresh_token" },
        { status: 400 }
      );
    }

    if (!isServerSupabaseConfigured()) {
      return NextResponse.json(
        { ok: false, error: "服务端 Supabase 环境变量未就绪" },
        { status: 500 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // --------------------------------------------------------------
    // 步骤 1：用 SERVICE_ROLE_KEY 调 auth.getUser(accessToken) 校验 token
    // --------------------------------------------------------------
    let userUid: string | null = null;
    try {
      // 临时用 service role 建一个 client，只用于 getUser 校验
      const { createClient: createAdminClient } = await import(
        "@/lib/supabase/admin"
      ).catch(() => {
        // 如果 admin.ts 没导出 createClient，退而用 createServerClient + service_role
        return { createClient: null };
      });
      if (createAdminClient && serviceRoleKey) {
        const admin = createAdminClient();
        const { data, error } = await admin.auth.getUser(accessToken);
        if (error) {
          return NextResponse.json(
            { ok: false, error: error.message, code: error.name },
            { status: 401 }
          );
        }
        if (!data.user) {
          return NextResponse.json(
            { ok: false, error: "access_token 无效" },
            { status: 401 }
          );
        }
        userUid = data.user.id;
      }
    } catch (err) {
      // 管理员 client 调不到时，降级用 createServerClient + auth.setSession
      //（上一个实现方案，因为校验较严格可能 AuthInvalidJwtError，
      // 所以这里是降级兜底，非首选）
      console.warn("[auth/session] admin.auth.getUser 降级:", err);
    }

    // --------------------------------------------------------------
    // 步骤 2：通过 createServerClient 的 setSession 写会话 cookie
    // 注：@supabase/ssr 的 cookies.setAll 回调，会把 sb-* 系列 cookie
    //（sb-<ref>-auth-token / access-token / refresh-token）全部返回给我们。
    // --------------------------------------------------------------
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

    // setSession 会调用 Supabase 的后端验证 token 合法性
    const setRes = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (setRes.error) {
      // 如果 setSession 报 AuthInvalidJwtError（时钟偏差或 token 结构问题），
      // 但前面已经用 service_role.getUser 确认了 token 有效 → 手动构造 cookie。
      if (userUid) {
        console.warn(
          "[auth/session] setSession 失败但 getUser 通过，手动写 cookie:",
          setRes.error.message
        );
        // 手动写入 sb-* 系列 cookie（Supabase cookie storage 约定的格式）
        const expDate = new Date();
        expDate.setHours(expDate.getHours() + 1); // access_token 默认 1 小时
        const refDate = new Date();
        refDate.setDate(refDate.getDate() + 30); // refresh_token 30 天

        // 从 supabaseUrl 里提取 project ref
        // 例：https://zyitmtbxpnalsuwzwcuc.supabase.co → zyitmtbxpnalsuwzwcuc
        let projectRef = "";
        try {
          const host = new URL(supabaseUrl).hostname;
          projectRef = host.split(".")[0] ?? "";
        } catch {}

        if (projectRef) {
          const mkCookie = (name: string, value: string, expires: Date) => ({
            name,
            value,
            options: {
              httpOnly: true,
              sameSite: "lax" as const,
              secure: process.env.NODE_ENV === "production",
              path: "/",
              expires,
            },
          });
          sbCookies.push(
            mkCookie(`sb-${projectRef}-access-token`, accessToken, expDate),
            mkCookie(`sb-${projectRef}-refresh-token`, refreshToken, refDate),
            mkCookie(
              `sb-${projectRef}-auth-token`,
              accessToken,
              expDate
            )
          );
        } else {
          return NextResponse.json(
            { ok: false, error: setRes.error.message, code: setRes.error.name },
            { status: 401 }
          );
        }
      } else {
        return NextResponse.json(
          { ok: false, error: setRes.error.message, code: setRes.error.name },
          { status: 401 }
        );
      }
    }

    // --------------------------------------------------------------
    // 步骤 3：写入响应 cookies
    // --------------------------------------------------------------
    const isProd = process.env.NODE_ENV === "production";
    const res = NextResponse.json({ ok: true, uid: userUid ?? undefined });
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
    console.error("[/api/auth/session] 未捕获异常:", err);
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json(
      { ok: false, error: `服务端异常: ${message}` },
      { status: 500 }
    );
  }
}
