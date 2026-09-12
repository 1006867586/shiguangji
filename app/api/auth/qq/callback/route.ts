import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
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

/** GET /api/auth/qq/callback — QQ 授权回调
 *
 * 两种模式（由 /api/auth/qq 写入的 qq_oauth_bind cookie 区分）：
 * - 绑定模式（bind=1）：当前浏览器已有 Supabase session，把 QQ openid
 *   绑定到当前 user，写入 profiles.bound_qq_openid + user_metadata.qq_openid。
 *   冲突时（QQ 已被另一个 profile 占用）跳 /profile?bind_qq_error=qq_already_bound
 * - 登录模式（bind=0）：用 QQ openid 查 profiles.bound_qq_openid：
 *     · 命中 → 用该 user.id 建会话（合二为一，老用户用 QQ 登录直接命中）
 *     · 不命中 → 走原虚拟邮箱 qq_xxx@qq.local 流程建新 user
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const origin = getPublicOrigin(request);

  const code = searchParams.get("code");
  const stateParam = searchParams.get("state") ?? "";
  const cookieState = request.cookies.get("qq_oauth_state")?.value;
  const bindCookie = request.cookies.get("qq_oauth_bind")?.value === "1";

  // 解析 state: 格式 "{randomState}.{redirectPath}.{bindFlag}"
  // state 是 hex 字符串，理论上不含 . ，但 path 可能含 . 所以 split 后取前 3 段
  const parts = stateParam.split(".");
  const state = parts[0];
  const redirect = safeRedirectPath(parts[1] || "/");
  // state 里也带 bind 标记作为兜底，cookie 缺失/篡改时仍能识别
  const bind = bindCookie || parts[2] === "1";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appId = process.env.QQ_APP_ID;
  const appKey = process.env.QQ_APP_KEY;

  const fail = (reason: string, backTo?: string) => {
    // 绑定模式失败跳回个人中心带 error；登录模式失败跳回登录页
    if (bind) {
      const base = backTo ?? "/profile";
      const u = new URL(base, origin);
      u.searchParams.set("bind_qq_error", reason);
      return NextResponse.redirect(u);
    }
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);
  };

  // 基础校验
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("qq_state_invalid");
  }

  // 占位符检查
  const isPlaceholder = (v?: string) =>
    !v ||
    v.startsWith("BUILD_PLACEHOLDER") ||
    v.includes("placeholder.supabase.co") ||
    v === "placeholder-anon-key" ||
    v === "placeholder-service-role-key-build" ||
    v === "placeholder-qq-app-id-build" ||
    v === "placeholder-qq-app-key-build";

  if (
    isPlaceholder(supabaseUrl) ||
    isPlaceholder(anonKey) ||
    isPlaceholder(appId) ||
    isPlaceholder(appKey)
  ) {
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
        client_id: appId!,
        client_secret: appKey!,
        code,
        redirect_uri: redirectUri,
        fmt: "json",
      }),
    });
    if (!tokenRes.ok) return fail("qq_token_failed");
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

    // 3. 获取用户信息（昵称、头像）—— QQ 互联接口失败不阻塞
    let qqUser: QqUserInfo = {
      ret: 0,
      nickname: `QQ用户${openid.slice(-4)}`,
    };
    try {
      const userRes = await fetch(
        `https://graph.qq.com/user/get_user_info?access_token=${encodeURIComponent(
          accessToken
        )}&oauth_consumer_key=${encodeURIComponent(appId!)}&openid=${encodeURIComponent(
          openid
        )}`
      );
      if (userRes.ok) {
        qqUser = (await userRes.json()) as QqUserInfo;
      }
    } catch {
      /* 取不到昵称/头像就用默认 */
    }
    const nickname = qqUser.nickname || `QQ用户${openid.slice(-4)}`;
    const avatar =
      qqUser.figureurl_qq_2 || qqUser.figureurl_qq_1 || undefined;

    const admin = createSupabaseClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ====== 4. 绑定模式：写 metadata + profiles + 冲突检查 ======
    if (bind) {
      // 取出当前 session 的 user.id
      const currentUser = await getCurrentUserFromRequest(request, {
        supabaseUrl: supabaseUrl!,
        anonKey: anonKey!,
      });
      if (!currentUser) {
        return fail("session_expired");
      }
      // 已经在 metadata 里写过同 openid：直接 success（幂等）
      const existingQqOpenid =
        (currentUser.user_metadata as Record<string, unknown> | undefined)
          ?.qq_openid;
      if (existingQqOpenid === openid) {
        const ok = new URL("/profile", origin);
        ok.searchParams.set("bind_qq", "ok");
        ok.searchParams.set("qq_openid", openid);
        return clearBindCookies(NextResponse.redirect(ok));
      }

      // 冲突检查：profiles.bound_qq_openid 已被另一个 profile 占用？
      const { data: conflict, error: conflictErr } = await admin
        .from("profiles")
        .select("id")
        .eq("bound_qq_openid", openid)
        .neq("id", currentUser.id)
        .maybeSingle();
      if (conflictErr) {
        console.error("[qq/callback] 冲突检查失败:", conflictErr.message);
        return fail("qq_link_failed");
      }
      if (conflict) {
        return fail("qq_already_bound");
      }

      // 写 user_metadata.qq_openid（trigger 会同步到 profiles.bound_qq_openid）
      const { error: metaErr } = await admin.auth.admin.updateUserById(
        currentUser.id,
        {
          user_metadata: {
            ...(currentUser.user_metadata ?? {}),
            qq_openid: openid,
          },
        }
      );
      if (metaErr) {
        console.error("[qq/callback] 写 user_metadata 失败:", metaErr.message);
        return fail("qq_link_failed");
      }

      const ok = new URL("/profile", origin);
      ok.searchParams.set("bind_qq", "ok");
      ok.searchParams.set("qq_openid", openid);
      return clearBindCookies(NextResponse.redirect(ok));
    }

    // ====== 5. 登录模式：先查是否已有绑定，走「合二为一」分支 ======
    const { data: boundProfile, error: lookupErr } = await admin
      .from("profiles")
      .select("id")
      .eq("bound_qq_openid", openid)
      .maybeSingle();
    if (lookupErr) {
      console.error("[qq/callback] 查 bound_qq_openid 失败:", lookupErr.message);
      return fail("qq_link_failed");
    }

    let userId: string;
    let hashedToken: string;
    if (boundProfile?.id) {
      // 合二为一：用已绑定账号的 user.email 走 magic link。
      // 邮件会发到那个虚拟邮箱（QQ 用户不会去看，所以无感），
      // 我们拿到 hashed_token 后立刻 verifyOtp 消费掉，邮件里链接就失效。
      const { data: targetUser, error: getUserErr } =
        await admin.auth.admin.getUserById(boundProfile.id);
      if (getUserErr || !targetUser?.user?.email) {
        console.error(
          "[qq/callback] 取目标用户失败:",
          getUserErr?.message
        );
        return fail("qq_session_failed");
      }
      const { data: sessionLink, error: sessionLinkErr } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: targetUser.user.email,
        });
      if (
        sessionLinkErr ||
        !sessionLink?.properties?.hashed_token
      ) {
        console.error(
          "[qq/callback] 合二一会话 generateLink 失败:",
          sessionLinkErr?.message
        );
        return fail("qq_session_failed");
      }
      userId = boundProfile.id;
      hashedToken = sessionLink.properties.hashed_token;
    } else {
      // 首次 QQ 登录：用虚拟邮箱 + generateLink 建新用户
      const virtualEmail = `qq_${openid}@qq.local`;
      const { data: linkData, error: linkErr } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: virtualEmail,
        });
      if (
        linkErr ||
        !linkData?.properties?.hashed_token ||
        !linkData.user
      ) {
        console.error("[qq/callback] generateLink 失败:", linkErr?.message);
        return fail("qq_link_failed");
      }
      userId = linkData.user.id;
      hashedToken = linkData.properties.hashed_token;

      // 写 user_metadata（trigger 会同步 profiles.bound_qq_openid）
      const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          nickname,
          avatar_url: avatar,
          qq_openid: openid,
        },
      });
      if (metaErr) {
        console.error("[qq/callback] 写 user_metadata 失败:", metaErr.message);
      }
      // 首次登录：profiles 由 trigger 创建后做一次昵称/头像补写（trigger 落 nickname 默认值）
      await admin.from("profiles").upsert({
        id: userId,
        nickname,
        avatar_url: avatar ?? null,
        bound_qq_openid: openid,
      });
    }

    const response = NextResponse.redirect(`${origin}${redirect}`);
    const sbCookies: CookiesToSet = [];

    const supabase = createServerClient(supabaseUrl!, anonKey!, {
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
      token_hash: hashedToken,
      type: "magiclink",
    });
    if (verifyErr) return fail("qq_session_failed");

    // 把 SSR 客户端 setAll 的 cookies 写入重定向响应
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
    return clearBindCookies(response);
  } catch (err) {
    console.error("[qq/callback] 未捕获异常:", err);
    const reason =
      err instanceof Error
        ? err.message.slice(0, 100) || "qq_callback_error"
        : "qq_callback_error";
    return fail(reason.startsWith("qq_") ? reason : `qq_callback_error:${reason}`);
  }
}

/** 清理 QQ OAuth 临时 cookie */
function clearBindCookies(response: NextResponse) {
  response.cookies.delete("qq_oauth_state");
  response.cookies.delete("qq_oauth_bind");
  return response;
}

/** 从 request.cookies 解析 Supabase 当前 session，拿到 user。
 *  内联实现，避免循环依赖 lib/supabase/server（它依赖 next/headers）。 */
async function getCurrentUserFromRequest(
  request: NextRequest,
  cfg: { supabaseUrl: string; anonKey: string }
) {
  // 用 @supabase/ssr 的 createServerClient + request cookies 拿到 user
  const ssr = createServerClient(cfg.supabaseUrl, cfg.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        /* 只读，不写 */
      },
    },
  });
  const {
    data: { user },
  } = await ssr.auth.getUser();
  return user;
}
