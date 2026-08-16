import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { NextRequest } from "next/server";
import type { ExternalLink, ExternalPlatform } from "@/types";

/** cn: 合并 className（shadcn 约定） */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 解析可能缺协议的环境变量 URL 为完整 URL 字符串。
 * EdgeOne 等平台有时会注入裸域名（如 shiguangji-xxx.edgeone.cool），
 * 直接 new URL() 会抛 ERR_INVALID_URL。这里补 https:// 前缀。
 * 输入为空或无法解析时返回 fallback（默认 localhost）。
 */
export function normalizeEnvUrl(
  value: string | undefined,
  fallback = "http://localhost:3000"
): string {
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  if (/^https?:\/\//i.test(raw)) return raw;
  // 裸域名补 https://
  return `https://${raw}`;
}

/**
 * 判定一个 host 是否是"内网/容器监听"类的无效主机名（拿到了也不能当公开域名用）。
 * 这类 host 作为 redirect origin 会让用户跳到错误地址（典型就是 0.0.0.0）。
 */
function isPrivateHost(host: string): boolean {
  if (!host) return true;
  const h = host.toLowerCase().split(":")[0]; // 去掉端口
  return (
    h === "0.0.0.0" ||
    h === "127.0.0.1" ||
    h === "localhost" ||
    h.endsWith(".local") ||
    h.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || // 172.16/12
    /^192\.168\./.test(h)
  );
}

/**
 * 获取服务端场景下可信的 origin（对外公开 URL）。
 *
 * 反代部署时（Cloudflare Worker / Nginx / CloudBase 网关）：
 *   - Next.js 收到的 `new URL(request.url).origin` 可能是内网监听地址（0.0.0.0、127.0.0.1、CloudBase 默认域名等），
 *     而不是用户实际访问的自定义域名；
 *   - Cloudflare Worker → Vercel 回源场景下 X-Forwarded-Host 会是 *.vercel.app；
 *
 * 优先级从高到低（任何一步拿到了"非内网 host"就立即返回）：
 *   1. NEXT_PUBLIC_APP_URL 环境变量（显式配置，最权威——QQ 回调域名等必须与之一致）
 *   2. X-Forwarded-Host + X-Forwarded-Proto（反代层透传的真实 Host/scheme）
 *   3. 普通 Host 头（如果反代层直接覆盖了 Host 为自定义域名，也能生效）
 *   4. request.url / request.nextUrl 的 origin（最后兜底，如果仍是内网地址则强制用 NEXT_PUBLIC_APP_URL，否则用该值）
 *
 * 目前在 `app/api/auth/*` 里用它替换 `new URL(request.url).origin`，避免 OAuth / 邮箱回调跳回错误域名。
 */
export function getPublicOrigin(request: NextRequest | Request): string {
  // ---- 1) NEXT_PUBLIC_APP_URL 环境变量（最高优先级，显式配置）----
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) {
    const normalized = normalizeEnvUrl(env, env);
    try {
      const u = new URL(normalized);
      if (!isPrivateHost(u.hostname)) return normalized;
    } catch {
      /* ignore */
    }
  }

  // ---- 2) X-Forwarded-Host + X-Forwarded-Proto ----
  const fwHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("X-Forwarded-Host");
  const fwProto = (
    request.headers.get("x-forwarded-proto") ||
    request.headers.get("X-Forwarded-Proto") ||
    ""
  ).toLowerCase();
  if (fwHost) {
    // 可能是逗号分隔的多段（多级反代），取第一段
    const host = fwHost.split(",")[0].trim();
    if (host && !isPrivateHost(host)) {
      // CloudBase 网关可能覆盖 X-Forwarded-Proto 为 http（回源是 HTTP），
      // 生产环境下直接用 https 更安全
      const scheme =
        fwProto.startsWith("https") || process.env.NODE_ENV === "production"
          ? "https:"
          : "http:";
      return `${scheme}//${host}`;
    }
  }

  // ---- 3) 普通 Host 头 ----
  // （部分反代会把 Host 直接设成自定义域名，不写 X-Forwarded-Host）
  const plainHost = request.headers.get("host") || request.headers.get("Host");
  if (plainHost && !isPrivateHost(plainHost)) {
    // scheme 推断：生产环境默认 https（反代层都是 HTTPS 对外）
    const scheme =
      fwProto.startsWith("https") || process.env.NODE_ENV === "production"
        ? "https:"
        : fwProto.startsWith("http")
          ? "http:"
          : "https:";
    return `${scheme}//${plainHost}`;
  }

  // ---- 4) request.url / nextUrl 兜底 ----
  const candidates: string[] = [];
  try {
    candidates.push(new URL(request.url).origin);
  } catch {
    /* ignore */
  }
  // NextRequest 额外有 nextUrl
  if ("nextUrl" in request && typeof (request as NextRequest).nextUrl?.origin === "string") {
    candidates.push((request as NextRequest).nextUrl.origin);
  }
  for (const c of candidates) {
    try {
      const u = new URL(c);
      if (!isPrivateHost(u.hostname)) return c;
    } catch {
      /* ignore */
    }
  }

  // ---- 末级兜底：哪怕 env 是 localhost，也比 0.0.0.0 强 ----
  if (env) return normalizeEnvUrl(env, env);

  // ---- 最终兜底 ----
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}
const rtf = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
const dateShortFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});
const dateFullFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatRelativeTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const now = Date.now();
  const diffMs = now - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (sec < 60) return "刚刚";
  if (min < 60) return rtf.format(-min, "minute");
  if (hour < 24) return rtf.format(-hour, "hour");
  if (day < 7) return rtf.format(-day, "day");

  const sameYear = date.getFullYear() === new Date().getFullYear();
  return sameYear ? dateShortFormatter.format(date) : dateFullFormatter.format(date);
}

/** 完整日期时间格式化（基于 Intl.DateTimeFormat） */
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDateTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return dateTimeFormatter.format(date);
}

/** 生成 6 位邀请码（排除易混淆字符） */
export function generateInviteCode(length = 6): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/** 生成随机文件 key（R2 存储路径） */
export function generateObjectKey(ext: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}.${ext}`;
}

/** 从文件名提取扩展名 */
export function getExt(filename: string): string {
  const m = filename.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "jpg";
}

/** 校验邀请码格式 */
export function isValidInviteCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

/** 校验是否为合法 URL */
export function isUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** 从文本中提取第一个 URL（支持被反引号/引号包裹的情况） */
export function extractUrlFromText(text: string): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s`<>】"'，。]+/);
  return m ? m[0] : null;
}

/**
 * 识别外部链接平台
 * 用户粘贴的链接保持原平台标记（美团就是美团）。
 * 仅 AI 联网搜索补齐（enrich-place）强制使用大众点评，与本函数无关。
 */
export function detectPlatform(url: string): "dianping" | "meituan" | "other" {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (host.includes("dianping") || host.includes("dpurl")) return "dianping";
  if (host.includes("meituan") || host.includes("meituanwa")) return "meituan";
  return "other";
}

/** 简单 JSON 响应封装 */
export function jsonResponse(
  body: unknown,
  init?: ResponseInit
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

/** 校验是否为合法 UUID（v1-v5 通用格式） */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * 校验媒体 URL 是否来自允许的域名。
 * 允许 R2 公开域名、环境变量配置的域名，以及常见第三方图片 CDN（用户头像可能来自第三方）。
 * 图片与视频共用同一套域名白名单（R2 同桶存储），故导出别名以语义化使用。
 */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const allowedHosts = [
      // 与 lib/r2.ts 保持一致：上传返回的公开 URL 来自 R2_PUBLIC_URL，
      // 这里必须校验同一个变量，否则自定义 R2 域名会被误判为非法。
      // 注意：EdgeOne 等平台可能注入裸域名（无协议前缀），用 normalizeEnvUrl 补齐。
      process.env.R2_PUBLIC_URL,
      process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
      process.env.NEXT_PUBLIC_APP_URL,
    ]
      .filter(Boolean)
      .map((h) => {
        try {
          return new URL(normalizeEnvUrl(h as string)).hostname;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];
    const cdnHosts = [
      "img.xiangke.app",
      "img.xiangke.dev",
      "lh3.googleusercontent.com",
      "avatars.githubusercontent.com",
      "q.qlogo.cn",
      "thirdqq.qlogo.cn",
      "img1.zykh.top",
    ];
    const host = u.hostname.toLowerCase();
    return (
      [...allowedHosts, ...cdnHosts].includes(host) ||
      // 允许 q.qlogo.cn 的所有子域名（thirdqq.qlogo.cn 等 QQ 头像 CDN）
      host.endsWith(".qlogo.cn") ||
      // 允许 zykh.top 的所有子域名（img1.zykh.top 等自建 CDN）
      host.endsWith(".zykh.top")
    );
  } catch {
    return false;
  }
}

/**
 * 校验媒体（视频）URL 是否来自允许的域名。
 * 与 isAllowedImageUrl 共用同一套域名白名单（R2 同桶存储），仅为语义清晰而导出别名。
 */
export const isAllowedMediaUrl = isAllowedImageUrl;

/** 安全解析分页 limit 参数：非正数或超限回退到默认值，并限制上限 */
export function safeParseInt(
  value: string | null,
  defaultValue: number,
  max = 200
): number {
  if (value == null) return defaultValue;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  return Math.min(Math.floor(n), max);
}

/**
 * 统一安全错误信息处理。
 * 始终将原始错误记录到 console.error；生产环境返回通用 fallback，开发环境保留详情。
 * 兼容 Error 实例与 Supabase 的 PostgrestError（含 message 字段的对象）。
 */
export function safeErrorMessage(err: unknown, fallback: string): string {
  let message = fallback;
  if (err instanceof Error) {
    message = err.message;
  } else if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") message = m;
  } else if (typeof err === "string") {
    message = err;
  }
  console.error(`[API error] ${message}`, err);
  return process.env.NODE_ENV === "production" ? fallback : message;
}

/**
 * 校验并清洗 externalLink 对象：仅保留已知字段，字段值必须是 string/number。
 * 非 object（或数组）输入返回 null。
 */
export function sanitizeExternalLink(link: unknown): ExternalLink | null {
  if (!link || typeof link !== "object" || Array.isArray(link)) return null;
  const obj = link as Record<string, unknown>;
  const rawPlatform = typeof obj.platform === "string" ? obj.platform : "other";
  const platform: ExternalPlatform =
    rawPlatform === "dianping" || rawPlatform === "meituan" || rawPlatform === "other"
      ? rawPlatform
      : "other";
  return {
    platform,
    url: typeof obj.url === "string" ? obj.url : "",
    title: typeof obj.title === "string" ? obj.title : "",
    coverImage: typeof obj.coverImage === "string" ? obj.coverImage : null,
    rating: typeof obj.rating === "number" ? obj.rating : null,
    address: typeof obj.address === "string" ? obj.address : null,
    phone: typeof obj.phone === "string" ? obj.phone : null,
    price: typeof obj.price === "string" ? obj.price : null,
    category: typeof obj.category === "string" ? obj.category : null,
    location: sanitizeLinkLocation(obj.location),
  };
}

/** 校验经纬度对象（GCJ-02）：必须是 { lng, lat } 且均为有限数值 */
function sanitizeLinkLocation(raw: unknown): ExternalLink["location"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const lng = typeof r.lng === "number" && Number.isFinite(r.lng) ? r.lng : null;
  const lat = typeof r.lat === "number" && Number.isFinite(r.lat) ? r.lat : null;
  if (lng === null || lat === null) return null;
  return { lng, lat };
}

/**
 * 校验重定向路径，防止开放重定向攻击。
 * 只允许以 `/` 开头且不以 `//` 开头的站内路径，否则回退到 `/`。
 */
export function safeRedirectPath(next: string | null | undefined): string {
  if (!next || typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
