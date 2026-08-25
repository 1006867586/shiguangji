import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { jsonResponse } from "@/lib/utils";
import { isWeappConfigured } from "@/lib/wechat";
import {
  exchangeCodeForSession,
  WeappSessionError,
  httpStatusForWeappError,
} from "@/lib/auth/weapp-session";

/**
 * POST /api/auth/weapp/confirm-login — 小程序「确认登录」页调用
 *
 * 请求 { code, uuid, nickname?, avatarUrl? }：
 * - code 为 wx.login 凭证
 * - uuid 为 PC 端二维码携带的 sessionId
 * - nickname / avatarUrl 来自小程序确认页的 chooseAvatar + Input type="nickname"，
 *   avatarUrl 须是已上传到 R2 的公网 URL（小程序端走 uploadToR2 拿到）。
 *
 * 流程：校验会话行有效 → 微信登录 + 自动注册（仅新用户写入昵称/头像，
 * 绝不能覆盖老用户资料）→ 幂等登记 openid/user_id → PC 轮询端消费。
 *
 * 响应：{ accessToken, refreshToken, expiresAt, isNewUser, nickname?, avatarUrl? }
 */

const UUID_RE = /^[0-9a-f]{32}$/;
const NICKNAME_MAX_LEN = 20;
const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");
const isHttpUrl = (s: string) => /^https?:\/\/\S+/.test(s);

export async function POST(request: Request) {
  let body: { code?: string; uuid?: string; nickname?: string; avatarUrl?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const code = body.code?.trim();
  const uuid = body.uuid?.trim().toLowerCase() ?? "";
  const nicknameRaw = body?.nickname?.trim() ?? "";
  const avatarUrlRaw = body?.avatarUrl?.trim() ?? "";
  const nickname = nicknameRaw ? nicknameRaw.slice(0, NICKNAME_MAX_LEN) : undefined;
  const avatarUrl = avatarUrlRaw && isHttpUrl(avatarUrlRaw) ? avatarUrlRaw : undefined;
  if (!code) {
    return jsonResponse({ error: "缺少微信登录 code" }, { status: 400 });
  }
  if (!UUID_RE.test(uuid)) {
    return jsonResponse({ error: "无效的登录二维码" }, { status: 400 });
  }
  if (avatarUrlRaw && !avatarUrl) {
    return jsonResponse({ error: "avatarUrl 必须是 http(s) 链接" }, { status: 400 });
  }

  if (!isWeappConfigured()) {
    return jsonResponse(
      { error: "小程序登录未配置：请在服务端设置 WEAPP_APPID 与 WEAPP_SECRET", code: "weapp_not_configured" },
      { status: 501 }
    );
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isPlaceholder(supabaseUrl) || isPlaceholder(anonKey) || isPlaceholder(serviceRoleKey)) {
    return jsonResponse({ error: "服务端 Supabase 未配置", code: "supabase_not_configured" }, { status: 501 });
  }

  try {
    const admin = createSupabaseClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. 校验登录会话行有效
    const { data: row, error: rowErr } = await admin
      .from("wechat_login_sessions")
      .select("uuid")
      .eq("uuid", uuid)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) {
      return jsonResponse({ error: "二维码已失效，请刷新后重试", code: "login_session_expired" }, { status: 400 });
    }

    // 2. 微信登录 + 自动注册（返回 token，小程序端顺带自动登录）。
    //    传入了有效的 nickname / avatarUrl 即写入 user_metadata + profiles；
    //    确认页已预填已有资料，老用户不改则回传原值，不会丢资料。
    const session = await exchangeCodeForSession(code, { nickname, avatarUrl });

    // 3. 幂等登记 openid/user_id → PC 轮询端消费；影响 0 行视为已被消费/过期
    const { data: updated, error: updateErr } = await admin
      .from("wechat_login_sessions")
      .update({ openid: session.openid, user_id: session.user.id })
      .eq("uuid", uuid)
      .gt("expires_at", new Date().toISOString())
      .select("uuid");
    if (updateErr) throw updateErr;
    if (!updated || updated.length === 0) {
      return jsonResponse({ error: "二维码已失效，请刷新后重试", code: "login_session_expired" }, { status: 400 });
    }

    return jsonResponse({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      isNewUser: session.isNewUser,
      ...(session.nickname ? { nickname: session.nickname } : {}),
      ...(session.avatarUrl ? { avatarUrl: session.avatarUrl } : {}),
    });
  } catch (err) {
    if (err instanceof WeappSessionError) {
      console.error("[weapp/confirm-login] 微信登录失败:", err.code, err.message);
      return jsonResponse(
        { error: err.message, code: err.code },
        { status: httpStatusForWeappError(err) }
      );
    }
    console.error("[weapp/confirm-login] 未捕获异常:", err);
    return jsonResponse({ error: "登录失败，请稍后重试", code: "internal_error" }, { status: 500 });
  }
}
