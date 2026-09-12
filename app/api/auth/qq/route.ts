import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getPublicOrigin } from "@/lib/utils";

/** GET /api/auth/qq — 发起 QQ 互联 OAuth2 授权
 *
 * 两种调用模式：
 * - 默认（登录）：未登录用户点 QQ 登录，OAuth 完成后用 QQ openid
 *   建立 Supabase 会话；如果 profiles.bound_qq_openid 命中已有账号，
 *   则登录到那个账号（合二为一）。
 * - bind=1（绑定）：已登录用户点「绑定 QQ」，OAuth 完成后把 QQ openid
 *   绑定到当前 session 的 user 上。冲突时（QQ 已被他人绑定）报错。
 */
export async function GET(request: NextRequest) {
  const origin = getPublicOrigin(request);
  const appId = process.env.QQ_APP_ID;

  if (!appId) {
    return NextResponse.redirect(`${origin}/login?error=qq_not_configured`);
  }

  const redirect = request.nextUrl.searchParams.get("redirect") ?? "/";
  const bind = request.nextUrl.searchParams.get("bind") === "1";
  const redirectUri = `${origin}/api/auth/qq/callback`;

  // 生成 state 防 CSRF，并附带最终跳转目标 + 绑定标记
  // state 格式："{randomState}.{redirectPath}.{bindFlag}"
  // bindFlag 为 1 / 0，避免 URL 上独立传参被中间人改写
  const state = randomBytes(16).toString("hex");
  const scope = "get_user_info";

  const qqUrl = new URL("https://graph.qq.com/oauth2.0/authorize");
  qqUrl.searchParams.set("response_type", "code");
  qqUrl.searchParams.set("client_id", appId);
  qqUrl.searchParams.set("redirect_uri", redirectUri);
  qqUrl.searchParams.set("state", `${state}.${redirect}.${bind ? "1" : "0"}`);
  qqUrl.searchParams.set("scope", scope);

  const response = NextResponse.redirect(qqUrl.toString());
  // QQ OAuth 回调是 graph.qq.com → 本站的跨站跳转，
  // 必须用 SameSite=None + Secure 才能让浏览器把 state cookie 带回来。
  // 否则 callback 里 cookieState 是 undefined → qq_state_invalid。
  response.cookies.set("qq_oauth_state", state, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
    maxAge: 600,
  });
  // 绑定标记也写一份独立 cookie，方便 callback 不依赖 state 解析
  // （state 是 hex，分隔符 . 可能出现在 path 里，导致 split 不稳）
  response.cookies.set("qq_oauth_bind", bind ? "1" : "0", {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
    maxAge: 600,
  });
  return response;
}
