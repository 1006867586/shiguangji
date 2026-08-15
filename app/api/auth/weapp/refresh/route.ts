import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { jsonResponse } from "@/lib/utils";

/**
 * POST /api/auth/weapp/refresh — 小程序会话刷新（weapp 分支）
 *
 * 小程序端 access_token 过期（约 1 小时）后，用 refresh_token 换新的
 * access/refresh token。与 Web 端 cookie 自动续期不同，小程序端由
 * 请求层在收到 401 时显式调用本接口。
 */

const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

export async function POST(request: Request) {
  let body: { refreshToken?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const refreshToken = body.refreshToken?.trim();
  if (!refreshToken) {
    return jsonResponse({ error: "缺少 refreshToken" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey)) {
    return jsonResponse({ error: "服务端 Supabase 未配置", code: "supabase_not_configured" }, { status: 501 });
  }

  const client = createSupabaseClient(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    // refresh_token 也过期/失效 → 小程序端应清除本地态引导重新登录
    return jsonResponse({ error: "会话已失效，请重新登录", code: "refresh_failed" }, { status: 401 });
  }

  return jsonResponse({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: new Date((data.session.expires_at ?? 0) * 1000).toISOString(),
  });
}
