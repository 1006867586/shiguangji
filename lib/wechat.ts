/**
 * 微信小程序服务端接口封装（weapp）。
 *
 * 当前提供：
 * - getWeappAccessToken：stable_token 接口换取调用凭据（模块级缓存 + 提前刷新），
 *   供 msgSecCheck / mediaCheckAsync 等需要 access_token 的接口使用。
 * - checkImageContent：图片内容安全检测（media_check_async 提交 + 结果轮询），
 *   供发布照片入库前调用（UGC 内容安全，运营规范 10.2/5.18）。
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

// ---- 图片内容安全（media_check_async） ----

const MEDIA_CHECK_URL = "https://api.weixin.qq.com/wxa/media_check_async";
const MEDIA_CHECK_RESULT_URL =
  "https://api.weixin.qq.com/wxa/media_check_async_result";

export type MediaCheckSuggest = "pass" | "review" | "risky";

interface MediaCheckResponse {
  errcode?: number;
  errmsg?: string;
  trace_id?: string;
  result?: {
    suggest?: MediaCheckSuggest;
    label?: number;
  };
}

/** 提交一张图片做异步内容安全检测，返回 trace_id（media_type=2 图片，scene=3 UGC） */
async function submitMediaCheck(
  accessToken: string,
  mediaUrl: string,
  openid: string
): Promise<string> {
  const res = await fetch(
    `${MEDIA_CHECK_URL}?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        media_url: mediaUrl,
        media_type: 2,
        version: 2,
        openid,
        scene: 3,
      }),
    }
  );
  const data = (await res.json()) as MediaCheckResponse;
  if (data.errcode && data.errcode !== 0) {
    throw new Error(
      `media_check_async 提交失败: ${data.errcode} ${data.errmsg ?? ""}`
    );
  }
  if (!data.trace_id) {
    throw new Error("media_check_async 未返回 trace_id");
  }
  return data.trace_id;
}

/** 查询一次检测结果（结果未就绪时 errcode=0 且无 result） */
async function queryMediaCheckResult(
  accessToken: string,
  traceId: string
): Promise<{ suggest?: MediaCheckSuggest; label?: number } | null> {
  const res = await fetch(
    `${MEDIA_CHECK_RESULT_URL}?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trace_id: traceId }),
    }
  );
  const data = (await res.json()) as MediaCheckResponse;
  if (data.errcode && data.errcode !== 0) {
    throw new Error(
      `media_check_async_result 查询失败: ${data.errcode} ${data.errmsg ?? ""}`
    );
  }
  if (!data.result) return null; // 结果尚未就绪
  return { suggest: data.result.suggest ?? "pass", label: data.result.label };
}

/** 微信图片内容安全 label 含义（用于日志/提示） */
const MEDIA_RISK_LABELS: Record<number, string> = {
  100: "正常",
  10001: "广告",
  20001: "时政敏感",
  20002: "色情",
  20003: "辱骂",
  20006: "违法犯罪",
  20008: "欺诈",
  20012: "低俗",
  20013: "版权",
};

/**
 * 图片内容安全检测（提交 + 轮询，最多约 12 秒）。
 * - suggest = "risky" → 违规（调用方应拒绝入库）
 * - suggest = "review" / "pass" → 放行
 * - 微信接口故障 / 超时未出结果 → 抛错（调用方决定降级策略）
 * @param forceToken 遇 40001 时强制刷新 token（由本函数内部处理）
 */
export async function checkImageContent(
  mediaUrl: string,
  openid: string
): Promise<{ pass: boolean; suggest: MediaCheckSuggest; label?: number }> {
  const call = (token: string) => submitMediaCheck(token, mediaUrl, openid);
  let traceId: string;
  try {
    const token = await getWeappAccessToken();
    try {
      traceId = await call(token);
    } catch (err) {
      // 40001 token 失效：强制刷新后重试一次
      if (
        err instanceof Error &&
        err.message.includes("40001")
      ) {
        const fresh = await getWeappAccessToken(true);
        traceId = await call(fresh);
      } else {
        throw err;
      }
    }
  } catch (err) {
    throw new Error(`图片检测提交失败: ${err instanceof Error ? err.message : err}`);
  }

  // 轮询结果（微信异步检测通常秒级返回；最多 12 次 × 1s）
  const token = await getWeappAccessToken();
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const result = await queryMediaCheckResult(token, traceId);
    if (result?.suggest) {
      const suggest = result.suggest;
      return {
        pass: suggest !== "risky",
        suggest,
        label: result.label,
      };
    }
  }
  throw new Error("图片检测超时");
}
