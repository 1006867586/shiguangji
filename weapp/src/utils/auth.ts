import Taro from "@tarojs/taro";
import { TOKEN_KEY, REFRESH_KEY, EXPIRES_KEY } from "./config";
import { request } from "./request";

/**
 * 登录态管理：wx.login code → /api/auth/weapp/login → 本地存储 token。
 * 服务端同构复用 Supabase 会话（Bearer 通道），Web/小程序同一账号体系。
 */

export interface WeappSession {
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
  isNewUser?: boolean;
}

export function isLoggedIn(): boolean {
  return Boolean(Taro.getStorageSync<string>(TOKEN_KEY));
}

export function getAccessToken(): string | null {
  return Taro.getStorageSync<string>(TOKEN_KEY) || null;
}

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 纯 JS base64url → UTF-8 字符串（小程序无 atob/TextDecoder，需手工解码；
 * 逐字节 fromCharCode 会破坏中文等非 ASCII 字符导致 JSON.parse 失败） */
function decodeB64Url(s: string): string {
  const cleaned = s.replace(/-/g, "+").replace(/_/g, "/");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of cleaned) {
    if (ch === "=") break;
    const val = B64_CHARS.indexOf(ch);
    if (val < 0) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  // UTF-8 解码（2/3 字节序列）
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b >= 0xc0 && b < 0xe0 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f));
    } else if (b >= 0xe0 && b < 0xf0 && i + 2 < bytes.length) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f)
      );
    } else {
      out += "?";
    }
  }
  return out;
}

/** 当前登录用户 id（从 Supabase JWT 的 sub 解码；未登录返回 null） */
export function getCurrentUserId(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(decodeB64Url(parts[1]));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

// 防止并发调用 weappLogin 触发 45011（微信频率限制）。
// 同时只允许一个 in-flight 请求，重复调用直接拒绝并等待首个结果。
let loginPromise: Promise<WeappSession> | null = null;

/** 微信一键登录：wx.login 拿 code，换服务端会话 token */
export async function weappLogin(): Promise<WeappSession> {
  if (loginPromise) {
    // 已有 in-flight 的登录请求，复用其结果（不重新拿 code、不重新 POST）
    return loginPromise;
  }

  loginPromise = (async () => {
    const { code } = await Taro.login();
    if (!code) throw new Error("微信登录失败：未获取到 code");

    const session = await request<WeappSession>("/api/auth/weapp/login", {
      method: "POST",
      data: { code },
      auth: false,
    });

    Taro.setStorageSync(TOKEN_KEY, session.accessToken);
    Taro.setStorageSync(REFRESH_KEY, session.refreshToken);
    if (session.expiresAt) Taro.setStorageSync(EXPIRES_KEY, session.expiresAt);
    return session;
  })();

  try {
    return await loginPromise;
  } finally {
    loginPromise = null;
  }
}

/** 退出登录：仅清本地凭据（服务端 Supabase token 自然过期） */
export function logout() {
  Taro.removeStorageSync(TOKEN_KEY);
  Taro.removeStorageSync(REFRESH_KEY);
  Taro.removeStorageSync(EXPIRES_KEY);
}

/** 启动时静默校验：本地凭据存在即可，真正有效性由请求层 401 兜底 */
export async function ensureSession(): Promise<void> {
  if (!isLoggedIn()) return;
  const expiresAt = Taro.getStorageSync<string>(EXPIRES_KEY);
  if (expiresAt && new Date(expiresAt).getTime() - Date.now() < 5 * 60_000) {
    // 即将过期，提前触发一次刷新（失败不阻塞启动）
    try {
      await request("/api/auth/weapp/refresh", {
        method: "POST",
        data: { refreshToken: Taro.getStorageSync<string>(REFRESH_KEY) },
        auth: false,
        silent: true,
      });
    } catch {
      // 交给请求层在真正 401 时处理
    }
  }
}
