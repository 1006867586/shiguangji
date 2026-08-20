import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { code2Session, Code2SessionError } from "@/lib/wechat";

/**
 * 微信登录统一会话建立（PC 扫码登录 + 小程序登录共用）。
 *
 * 链路：openid → 虚拟邮箱 wx_{openid}@wechat.local → admin.generateLink(magiclink)
 * → 服务端消费 token_hash（verifyOtp）建立 Supabase 会话。
 *
 * 新用户自动注册（admin.generateLink 自动建用户）。可选接收前端传入的
 * nickname / avatarUrl（小程序确认页 chooseAvatar + Input type="nickname"
 * 收集后经 R2 直传得到公网 URL）。只要确认页传入有效资料就写入
 * user_metadata 与 profiles——前端确认页会「预填已有资料」，老用户不改则回传
 * 原值，不会丢资料；未传/空值不写入，避免用默认占位抹掉已有资料。
 *
 * options.writeProfile=false：跳过 updateUserById 与 profiles.upsert，仅保留
 * generateLink + verifyOtp 建会话的能力。PC 扫码的 login-status 命中后调用
 * 此模式，因为 confirm-login 已经把资料写过了，不应重复 upsert 抹平头像。
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
  /** 实际写入的昵称 / 头像（仅新用户且有传入时返回） */
  nickname?: string;
  avatarUrl?: string;
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
  extra?: { unionid?: string; nickname?: string; avatarUrl?: string },
  options?: { writeProfile?: boolean }
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
  const writeProfile = options?.writeProfile !== false;

  // 只要确认页传入有效资料即写入昵称/头像（不限定 isNewUser）：
  // - 前端确认页已「预填已有资料」，老用户不改则回传原值、改则回传新值，不会丢资料；
  // - 新老用户由此都能在确认页更新头像/昵称（PC 扫码登录默认回显已有资料）。
  // 注意：传入空值/未传（undefined）时不写，避免用默认占位抹掉已有资料。
  const shouldWriteNickname = writeProfile && !!extra?.nickname;
  const shouldWriteAvatar = writeProfile && !!extra?.avatarUrl;

  if (writeProfile) {
    await admin.auth.admin.updateUserById(linkData.user.id, {
      user_metadata: {
        ...(linkData.user.user_metadata ?? {}),
        weapp_openid: openid,
        ...(extra?.unionid ? { weapp_unionid: extra.unionid } : {}),
        ...(isNewUser && !linkData.user.user_metadata?.nickname
          ? { nickname: `微信用户${openid.slice(-4)}` }
          : {}),
        ...(shouldWriteNickname ? { nickname: extra!.nickname } : {}),
        ...(shouldWriteAvatar ? { avatar_url: extra!.avatarUrl } : {}),
      },
    });
    await admin.from("profiles").upsert({
      id: linkData.user.id,
      ...(isNewUser && !shouldWriteNickname
        ? { nickname: `微信用户${openid.slice(-4)}` }
        : {}),
      ...(shouldWriteNickname ? { nickname: extra!.nickname } : {}),
      ...(shouldWriteAvatar ? { avatar_url: extra!.avatarUrl } : {}),
    });
  }

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
    ...(shouldWriteNickname ? { nickname: extra!.nickname } : {}),
    ...(shouldWriteAvatar ? { avatarUrl: extra!.avatarUrl } : {}),
  };
}

/** wx.login code → 会话（code2Session 换 openid 后再建会话） */
export async function exchangeCodeForSession(
  code: string,
  extra?: { nickname?: string; avatarUrl?: string }
): Promise<WeappSessionResult> {
  let sessionInfo;
  try {
    sessionInfo = await code2Session(code);
  } catch (err) {
    if (err instanceof Code2SessionError) {
      throw new WeappSessionError("code2session_failed", err.message, err.errcode);
    }
    throw new WeappSessionError("wechat_unavailable", "微信登录服务暂不可用，请稍后重试");
  }
  return exchangeOpenIdForSession(
    sessionInfo.openid,
    {
      unionid: sessionInfo.unionid,
      nickname: extra?.nickname,
      avatarUrl: extra?.avatarUrl,
    },
    { writeProfile: true }
  );
}

/** WeappSessionError → HTTP 状态码（与旧 /api/auth/weapp/login 行为一致） */
export function httpStatusForWeappError(err: WeappSessionError): number {
  if (err.code === "code2session_failed") {
    return err.errcode === 40029 || err.errcode === 40163 ? 401 : 502;
  }
  return 502;
}