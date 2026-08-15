import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomBytes } from "crypto";
import type { CookiesToSet } from "@/lib/supabase/cookies";
import { getPublicOrigin, safeRedirectPath } from "@/lib/utils";

/** QQ 互联 token 接口返回的 query string 解析 */
function parseQqTokenResponse(text: string): Record<string, string> {
  const params = new URLSearchParams(text);
  const result: Record<string, string> = {};
  for (const [k, v] of params.entries()) result[k] = v;
  return result;
}

/** QQ 互联 me 接口返回 JSONP: callback( {...} ); 需提取 JSON */
function parseQqJsonp(text: string): unknown {
  const match = text.match(/callback\(\s*(.*?)\s*\)\s*;?\s*$/s);
  if (!match) throw new Error("QQ me 接口返回格式异常");
  return JSON.parse(match[1]);
}

interface QqUserInfo {
  ret: number;
  nickname: string;
  figureurl_qq_1?: string;
  figureurl_qq_2?: string;
}

/** GET /api/auth/qq/callback — QQ 授权回调，换取用户信息并建立 Supabase 会话 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const origin = getPublicOrigin(request);

  const code = searchParams.get("code");
  const stateParam = searchParams.get("state") ?? "";
  const cookieState = request.cookies.get("qq_oauth_state")?.value;

  // 解析 state: 格式为 "{randomState}.{redirectPath}"
  const [state, redirect] = [
    stateParam.split(".")[0],
    safeRedirectPath(stateParam.split(".").slice(1).join(".") || "/"),
  ];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appId = process.env.QQ_APP_ID;
  const appKey = process.env.QQ_APP_KEY;

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);

  // 基础校验
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("qq_state_invalid");
  }

  // 占位符检查：不仅检查空值，还要检查 Dockerfile 构建期注入的占位符
  const isPlaceholder = (v?: string) =>
    !v ||
    v.startsWith("BUILD_PLACEHOLDER") ||
    v.includes("placeholder.supabase.co") ||
    v === "placeholder-anon-key" ||
    v === "placeholder-service-role-key-build" ||
    v === "placeholder-qq-app-id-build" ||
    v === "placeholder-qq-app-key-build";

  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey) || isPlaceholder(appId) || isPlaceholder(appKey)) {
    console.error("[qq/callback] 环境变量未就绪:", {
      supabaseUrl: supabaseUrl?.slice(0, 30),
      anonKey: anonKey ? `${anonKey.slice(0, 10)}...` : "MISSING",
      appId: appId || "MISSING",
      appKey: appKey ? "SET" : "MISSING",
    });
    return fail("qq_not_configured");
  }
  if (isPlaceholder(serviceRoleKey)) {
    console.error("[qq/callback] SUPABASE_SERVICE_ROLE_KEY 未配置或仍是占位符");
    return fail("qq_service_key_missing");
  }

  const redirectUri = `${origin}/api/auth/qq/callback`;

  try {
    // 1. 用 code 换 access_token
    const tokenRes = await fetch("https://graph.qq.com/oauth2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: appId,
        client_secret: appKey,
        code,
        redirect_uri: redirectUri,
        fmt: "json",
      }),
    });
    if (!tokenRes.ok) return fail("qq_token_failed");
    // 优先按 JSON 解析，失败再按 query string 解析
    let tokenData: Record<string, string>;
    const tokenText = await tokenRes.text();
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      tokenData = parseQqTokenResponse(tokenText);
    }
    const accessToken = tokenData.access_token;
    if (!accessToken) return fail("qq_no_access_token");

    // 2. 获取 openid
    const meRes = await fetch(
      `https://graph.qq.com/oauth2.0/me?access_token=${encodeURIComponent(
        accessToken
      )}&fmt=json`
    );
    if (!meRes.ok) return fail("qq_me_failed");
    let meData: { openid?: string; client_id?: string };
    const meText = await meRes.text();
    try {
      meData = JSON.parse(meText);
    } catch {
      meData = parseQqJsonp(meText) as typeof meData;
    }
    const openid = meData.openid;
    if (!openid) return fail("qq_no_openid");

    // 3. 获取用户信息（昵称、头像）
    const userRes = await fetch(
      `https://graph.qq.com/user/get_user_info?access_token=${encodeURIComponent(
        accessToken
      )}&oauth_consumer_key=${encodeURIComponent(appId)}&openid=${encodeURIComponent(
        openid
      )}`
    );
    let qqUser: QqUserInfo = { ret: 0, nickname: `QQ用户${openid.slice(-4)}` };
    if (userRes.ok) {
      qqUser = (await userRes.json()) as QqUserInfo;
    }
    const nickname = qqUser.nickname || `QQ用户${openid.slice(-4)}`;
    const avatar =
      qqUser.figureurl_qq_2 || qqUser.figureurl_qq_1 || undefined;

    // 4. 用 admin client 生成 magic link（自动处理用户存在/不存在）
    const admin = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const virtualEmail = `qq_${openid}@qq.local`;

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: virtualEmail,
    });
    if (linkErr || !linkData?.properties?.hashed_token || !linkData.user) {
      return fail("qq_link_failed");
    }

    // 更新用户元数据（昵称/头像/QQ openid），新用户首次写入 profiles
    await admin.auth.admin.updateUserById(linkData.user.id, {
      user_metadata: { nickname, avatar_url: avatar, qq_openid: openid },
    });
    await admin.from("profiles").upsert({
      id: linkData.user.id,
      nickname,
      avatar_url: avatar ?? null,
    });

    // 5. 用 anon-key server client 消费 token 建立会话,
    //    直接在重定向响应中设置 session cookie
    const response = NextResponse.redirect(`${origin}${redirect}`);
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

    const { error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyErr) return fail("qq_session_failed");

    // 6. 将捕获的 session cookie 写入重定向响应
    const isProd = process.env.NODE_ENV === "production";
    for (const { name, value, options } of sbCookies) {
      response.cookies.set(name, value, {
        ...options,
        httpOnly: options.httpOnly ?? true,
        sameSite: options.sameSite ?? "lax",
        secure: options.secure ?? isProd,
        path: options.path ?? "/",
      });
    }
    // 清理 state cookie
    response.cookies.delete("qq_oauth_state");
    return response;
  } catch (err) {
    console.error("[qq/callback] 未捕获异常:", err);
    const reason = err instanceof Error ? err.message : "qq_callback_error";
    return fail(reason.startsWith("qq_") ? reason : "qq_callback_error");
  }
}
