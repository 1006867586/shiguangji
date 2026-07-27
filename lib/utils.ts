import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ExternalLink, ExternalPlatform } from "@/types";

/** cn: 合并 className（shadcn 约定） */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 相对时间格式化（中文）。基于 Intl.RelativeTimeFormat，兼顾 i18n。 */
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
 * 校验图片 URL 是否来自允许的域名。
 * 允许 R2 公开域名、环境变量配置的域名，以及常见第三方图片 CDN（用户头像可能来自第三方）。
 */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const allowedHosts = [
      // 与 lib/r2.ts 保持一致：上传返回的公开 URL 来自 R2_PUBLIC_URL，
      // 这里必须校验同一个变量，否则自定义 R2 域名会被误判为非法。
      process.env.R2_PUBLIC_URL,
      process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
      process.env.NEXT_PUBLIC_APP_URL,
    ]
      .filter(Boolean)
      .map((h) => {
        try {
          return new URL(h as string).hostname;
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
    ];
    return [...allowedHosts, ...cdnHosts].includes(u.hostname);
  } catch {
    return false;
  }
}

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
  };
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
