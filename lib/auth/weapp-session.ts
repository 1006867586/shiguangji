import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { code2Session, Code2SessionError } from "@/lib/wechat";

/**
 * 微信登录统一会话建立（PC 扫码登录 + 小程序登录共用）。
 *
 * 链路：openid → 虚拟邮箱 wx_{openid}@wechat.local → admin.generateLink(magiclink)
 * → 服务端消费 token_hash（verifyOtp）建立 Supabase 会话。
 * 首次登录自动注册（admin.generateLink 自动建用户），新用户补 nickname / profiles。
 */

export type WeappSessionErrorCode =
  | "code2session_failed"
  | "wechat_unavailable"
  | "link_failed"
  | "session_failed";

export class WeappSessionError extends Error {
  code: WeappSessionErrorCode;
  /** 微信业务错误码（code2session_failed 时携带） */
  errcode?: number;
  constructor(code: WeappSessionErrorCode, message: string, errcode?: number) {
    super(message);
    this.name = "WeappSessionError";
    this.code = code;
    this.errcode = errcode;
  }
}

export interface WeappSessionResult {
  user: { id: string; created_at: string; user_metadata?: Record<string, unknown> };
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  isNewUser: boolean;
  openid: string;
  unionid?: string;
}

const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

export function buildWeappVirtualEmail(openid: string): string {
  return `wx_${openid}@wechat.local`;
}

/**
 * 用 openid 建立（或复用）Supabase 会话：虚拟邮箱 + magic link。
 * 不调用微信接口，供 PC 轮询命中后使用。
 */
export async function exchangeOpenIdForSession(
  openid: string,
  extra?: { unionid?: string }
): Promise<WeappSessionResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isPlaceholder(url) || isPlaceholder(anonKey) || isPlaceholder(serviceRoleKey)) {
    throw new WeappSessionError("session_failed", "服务端 Supabase 未配置");
  }

  const admin = createSupabaseClient(url!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const virtualEmail = buildWeappVirtualEmail(openid);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: virtualEmail,
  });
  if (linkErr || !linkData?.properties?.hashed_token || !linkData.user) {
    console.error("[weapp-session] 生成 magic link 失败:", linkErr?.message);
    throw new WeappSessionError("link_failed", "建立会话失败，请稍后重试");
  }

  const createdMinutesAgo =
    (Date.now() - new Date(linkData.user.created_at).getTime()) / 60_000;
  const isNewUser = createdMinutesAgo < 2;
  await admin.auth.admin.updateUserById(linkData.user.id, {
    user_metadata: {
      ...(linkData.user.user_metadata ?? {}),
      weapp_openid: openid,
      ...(extra?.unionid ? { weapp_unionid: extra.unionid } : {}),
      ...(isNewUser && !linkData.user.user_metadata?.nickname
        ? { nickname: `微信用户${openid.slice(-4)}` }
        : {}),
    },
  });
  await admin.from("profiles").upsert({
    id: linkData.user.id,
    ...(isNewUser ? { nickname: `微信用户${openid.slice(-4)}` } : {}),
  });

  const anon = createSupabaseClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyErr || !verifyData.session) {
    console.error("[weapp-session] 消费 magic link 失败:", verifyErr?.message);
    throw new WeappSessionError("session_failed", "建立会话失败，请稍后重试");
  }

  return {
    user: linkData.user,
    accessToken: verifyData.session.access_token,
    refreshToken: verifyData.session.refresh_token,
    expiresAt: new Date((verifyData.session.expires_at ?? 0) * 1000).toISOString(),
    isNewUser,
    openid,
    ...(extra?.unionid ? { unionid: extra.unionid } : {}),
  };
}

/** wx.login code → 会话（code2Session 换 openid 后再建会话） */
export async function exchangeCodeForSession(code: string): Promise<WeappSessionResult> {
  let sessionInfo;
  try {
    sessionInfo = await code2Session(code);
  } catch (err) {
    if (err instanceof Code2SessionError) {
      throw new WeappSessionError("code2session_failed", err.message, err.errcode);
    }
    throw new WeappSessionError("wechat_unavailable", "微信登录服务暂不可用，请稍后重试");
  }
  return exchangeOpenIdForSession(sessionInfo.openid, {
    unionid: sessionInfo.unionid,
  });
}

/** WeappSessionError → HTTP 状态码（与旧 /api/auth/weapp/login 行为一致） */
export function httpStatusForWeappError(err: WeappSessionError): number {
  if (err.code === "code2session_failed") {
    return err.errcode === 40029 || err.errcode === 40163 ? 401 : 502;
  }
  return 502;
}
