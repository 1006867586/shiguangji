import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getPublicOrigin } from "@/lib/utils";

/** GET /api/auth/qq — 发起 QQ 互联 OAuth2 授权 */
export async function GET(request: NextRequest) {
  const origin = getPublicOrigin(request);
  const appId = process.env.QQ_APP_ID;

  if (!appId) {
    return NextResponse.redirect(`${origin}/login?error=qq_not_configured`);
  }

  const redirect = request.nextUrl.searchParams.get("redirect") ?? "/";
  const redirectUri = `${origin}/api/auth/qq/callback`;

  // 生成 state 防 CSRF，并附带最终跳转目标
  const state = randomBytes(16).toString("hex");
  const scope = "get_user_info";

  const qqUrl = new URL("https://graph.qq.com/oauth2.0/authorize");
  qqUrl.searchParams.set("response_type", "code");
  qqUrl.searchParams.set("client_id", appId);
  qqUrl.searchParams.set("redirect_uri", redirectUri);
  qqUrl.searchParams.set("state", `${state}.${redirect}`);
  qqUrl.searchParams.set("scope", scope);

  const response = NextResponse.redirect(qqUrl.toString());
  response.cookies.set("qq_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
