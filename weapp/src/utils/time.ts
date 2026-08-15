/**
 * 时间格式化：相对时间（刚刚 / n分钟前 / 今天 HH:mm / MM-DD HH:mm / YYYY-MM-DD）
 */

export function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";

  const now = Date.now();
  const diff = Math.max(0, now - t);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  // 未来时间直接走绝对时间展示
  if (t > now) return formatAbsoluteTime(iso);

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;

  const d = new Date(t);
  const nowD = new Date(now);
  const sameYear = d.getFullYear() === nowD.getFullYear();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // 昨天
  if (diff < 2 * day && nowD.getDate() - d.getDate() === 1) {
    return `昨天 ${hm}`;
  }
  return sameYear ? `${md} ${hm}` : `${d.getFullYear()}-${md}`;
}

/** 绝对时间：YYYY-MM-DD HH:mm */
export function formatAbsoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
