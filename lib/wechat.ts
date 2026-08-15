/**
 * 微信小程序服务端接口封装（weapp）。
 *
 * 当前提供：
 * - getWeappAccessToken：stable_token 接口换取调用凭据（模块级缓存 + 提前刷新），
 *   供 msgSecCheck 等需要 access_token 的接口使用。
 *
 * 为什么用 stable_token 而不是经典 /cgi-bin/token：
 * stable_token 不会使旧 token 立即失效，serverless 多实例各自缓存时
 * 不会互相顶掉对方的 token。
 */

const TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/stable_token";

interface CachedToken {
  token: string;
  /** 过期时间戳（毫秒） */
  expiresAt: number;
}

let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

const isPlaceholder = (v?: string) =>
  !v || v.startsWith("BUILD_PLACEHOLDER") || v.startsWith("placeholder");

export function isWeappConfigured(): boolean {
  return !isPlaceholder(process.env.WEAPP_APPID) && !isPlaceholder(process.env.WEAPP_SECRET);
}

/**
 * 获取（或复用缓存的）小程序 access_token。
 * 提前 5 分钟刷新；并发调用共享同一个进行中的请求。
 * @param force 忽略缓存强制刷新（如遇到 40001 token 失效时）
 */
export async function getWeappAccessToken(force = false): Promise<string> {
  if (!force && cached && cached.expiresAt > Date.now() + 5 * 60_000) {
    return cached.token;
  }
  if (inflight && !force) return inflight;

  inflight = (async () => {
    const appid = process.env.WEAPP_APPID!;
    const secret = process.env.WEAPP_SECRET!;
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credential",
        appid,
        secret,
        // true: 强制刷新；false: 有效期内直接返回现 token（实例间友好）
        force_refresh: force,
      }),
    });
    if (!res.ok) {
      throw new Error(`stable_token HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      errcode?: number;
      errmsg?: string;
    };
    if (!data.access_token || data.errcode) {
      throw new Error(`stable_token 失败: ${data.errcode} ${data.errmsg ?? ""}`);
    }
    const expiresIn = data.expires_in ?? 7200;
    cached = {
      token: data.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return cached.token;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
