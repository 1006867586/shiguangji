import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { jsonResponse } from "@/lib/utils";

/**
 * POST /api/auth/weapp/login — 微信小程序登录（weapp 分支）
 *
 * 链路：wx.login code → 微信 code2Session 换 openid → 虚拟邮箱
 * wx_{openid}@wechat.local → admin 生成 magic link → 服务端消费
 * token_hash 建立 Supabase 会话 → 把 access/refresh token 返回给小程序端。
 *
 * 与 QQ OAuth 回调（/api/auth/qq/callback）同构：同一套虚拟邮箱 +
 * magic link 模式，只是把「浏览器跳转消费」换成「服务端直接消费」，
 * 会话凭据改为 Bearer token 而非 cookie。
 */

interface WechatSessionResponse {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

export async function POST(request: Request) {
  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const code = body.code?.trim();
  if (!code) {
    return jsonResponse({ error: "缺少微信登录 code" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appid = process.env.WEAPP_APPID;
  const secret = process.env.WEAPP_SECRET;

  if (isPlaceholder(appid) || isPlaceholder(secret)) {
    console.error("[weapp/login] WEAPP_APPID / WEAPP_SECRET 未配置或仍是占位符");
    return jsonResponse(
      { error: "小程序登录未配置：请在服务端设置 WEAPP_APPID 与 WEAPP_SECRET", code: "weapp_not_configured" },
      { status: 501 }
    );
  }
  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey) || isPlaceholder(serviceRoleKey)) {
    console.error("[weapp/login] Supabase 环境变量未就绪");
    return jsonResponse({ error: "服务端 Supabase 未配置", code: "supabase_not_configured" }, { status: 501 });
  }

  try {
    // 1. code2Session 换 openid
    const sessionUrl =
      `https://api.weixin.qq.com/sns/jscode2session` +
      `?appid=${encodeURIComponent(appid!)}&secret=${encodeURIComponent(secret!)}` +
      `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const wxRes = await fetch(sessionUrl);
    if (!wxRes.ok) {
      console.error("[weapp/login] code2Session HTTP 失败:", wxRes.status);
      return jsonResponse({ error: "微信登录服务暂不可用，请稍后重试", code: "wechat_unavailable" }, { status: 502 });
    }
    const wxData = (await wxRes.json()) as WechatSessionResponse;
    if (!wxData.openid || wxData.errcode) {
      // 40029 code 无效 / 40163 code 已被使用 / 45011 频率限制等
      console.error("[weapp/login] code2Session 业务失败:", wxData.errcode, wxData.errmsg);
      const status = wxData.errcode === 40029 || wxData.errcode === 40163 ? 401 : 502;
      return jsonResponse(
        { error: `微信登录失败（${wxData.errcode ?? "unknown"}）：${wxData.errmsg ?? ""}`, code: "code2session_failed" },
        { status }
      );
    }
    const openid = wxData.openid;

    // 2. 虚拟邮箱 + magic link（自动处理用户存在/不存在）
    const admin = createSupabaseClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const virtualEmail = `wx_${openid}@wechat.local`;
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: virtualEmail,
    });
    if (linkErr || !linkData?.properties?.hashed_token || !linkData.user) {
      console.error("[weapp/login] 生成 magic link 失败:", linkErr?.message);
      return jsonResponse({ error: "建立会话失败，请稍后重试", code: "link_failed" }, { status: 502 });
    }

    // 3. 写入用户元数据与 profile（新用户首次入库，老用户补 openid）
    const createdMinutesAgo =
      (Date.now() - new Date(linkData.user.created_at).getTime()) / 60_000;
    const isNewUser = createdMinutesAgo < 2;
    await admin.auth.admin.updateUserById(linkData.user.id, {
      user_metadata: {
        ...(linkData.user.user_metadata ?? {}),
        weapp_openid: openid,
        ...(wxData.unionid ? { weapp_unionid: wxData.unionid } : {}),
        // isNewUser 时 Supabase 默认元数据里没有 nickname，补一个；老用户不覆盖
        ...(isNewUser && !linkData.user.user_metadata?.nickname
          ? { nickname: `微信用户${openid.slice(-4)}` }
          : {}),
      },
    });
    await admin.from("profiles").upsert({
      id: linkData.user.id,
      ...(isNewUser ? { nickname: `微信用户${openid.slice(-4)}` } : {}),
    });

    // 4. 服务端消费 token_hash 换会话（anon client，无 cookie）
    const anon = createSupabaseClient(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyErr || !verifyData.session) {
      console.error("[weapp/login] 消费 magic link 失败:", verifyErr?.message);
      return jsonResponse({ error: "建立会话失败，请稍后重试", code: "session_failed" }, { status: 502 });
    }

    return jsonResponse({
      accessToken: verifyData.session.access_token,
      refreshToken: verifyData.session.refresh_token,
      expiresAt: new Date((verifyData.session.expires_at ?? 0) * 1000).toISOString(),
      isNewUser,
    });
  } catch (err) {
    console.error("[weapp/login] 未捕获异常:", err);
    return jsonResponse({ error: "登录失败，请稍后重试", code: "internal_error" }, { status: 500 });
  }
}
