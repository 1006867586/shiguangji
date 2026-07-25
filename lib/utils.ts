import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** cn: 合并 className（shadcn 约定） */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 相对时间格式化（中文） */
export function formatRelativeTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const now = Date.now();
  const diff = now - date.getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (sec < 60) return "刚刚";
  if (min < 60) return `${min}分钟前`;
  if (hour < 24) return `${hour}小时前`;
  if (day < 7) return `${day}天前`;

  // 超过 7 天显示日期
  const y = date.getFullYear();
  const sameYear = y === new Date().getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayStr = String(date.getDate()).padStart(2, "0");
  if (sameYear) return `${month}-${dayStr}`;
  return `${y}-${month}-${dayStr}`;
}

/** 完整日期时间格式化 */
export function formatDateTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
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

/** 识别外部链接平台 */
export function detectPlatform(url: string): "dianping" | "meituan" | "other" {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (host.includes("dianping")) return "dianping";
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
