import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 徽章图标集：key（decor_items.key）→ 内联 SVG 图形。
 *
 * - 统一 24×24 视窗，用 currentColor 着色，由外层 .badge-glow 混合主题色与前景色决定最终颜色，
 *   因此浅色/暗色模式下都能保持对比度。
 * - 相比 emoji：跨平台渲染完全一致，20px 小尺寸下依然锐利。
 * - 新增徽章若没有对应图形，BadgeGlow 会自动回退到 emoji（见下方 fallback）。
 */
const BADGE_ICONS: Record<string, ReactNode> = {
  /** 🍽️ 本周吃了5顿 —— 刀叉 */
  badge_meals_week_5: (
    <>
      <path d="M7 3v6a2 2 0 0 0 4 0V3" />
      <path d="M9 9.6V21" />
      <path d="M17 3v18" />
      <path d="M17 4.5c1.5 2 2.4 4.3 2.4 6.5 0 1.7-.9 2.9-2.4 3.4" />
    </>
  ),
  /** 🔥 本周吃了10顿 —— 火焰 */
  badge_meals_week_10: (
    <path
      d="M12 2.8c3.4 4.3 5.8 6.3 5.8 9.7a5.8 5.8 0 0 1-11.6 0c0-2.9 1.9-4.6 3.9-6.7-.5 2.1.3 3.7 1.6 4.5-.3-3.2-.2-5.4.3-7.5Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  /** 🏅 美食家 —— 奖牌 */
  badge_total_meals_20: (
    <>
      <circle cx="12" cy="8.8" r="5.4" />
      <circle cx="12" cy="8.8" r="2.1" />
      <path d="M9 13.9 6.8 21" />
      <path d="M15 13.9 17.2 21" />
    </>
  ),
  /** ⚡ 连续打卡3天 —— 闪电 */
  badge_streak_3: (
    <path
      d="M13.2 2.5 5.5 13.8h5.2L9.4 21.5 18.5 9.8h-5.4l.1-7.3Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  /** 📅 一周不缺席 —— 日历 */
  badge_streak_7: (
    <>
      <rect x="3.6" y="5.2" width="16.8" height="15.2" rx="3" />
      <path d="M3.6 10h16.8" />
      <path d="M8.2 3v4.2M15.8 3v4.2" />
      <circle cx="9" cy="14.6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14.6" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  /** 👥 社交达人 —— 人群 */
  badge_circles_3: (
    <>
      <circle cx="9.2" cy="8" r="3.2" fill="currentColor" stroke="none" />
      <path
        d="M3 20.2c0-3.4 2.8-6.2 6.2-6.2s6.2 2.8 6.2 6.2Z"
        fill="currentColor"
        stroke="none"
      />
      <circle
        cx="17.4"
        cy="9.4"
        r="2.3"
        fill="currentColor"
        stroke="none"
        opacity="0.6"
      />
      <path
        d="M15.4 20.2c0-2.7 1.6-4.9 4-4.9 1.1 0 2.1.4 2.9 1.2"
        opacity="0.6"
      />
    </>
  ),
  /** 🎉 发起人 —— 礼花 */
  badge_activities_1: (
    <>
      <path d="M4.8 19.4 13.8 6.6l4.6 3.4L9.6 19.4H4.8Z" />
      <path d="M17.6 3.6v3.6M19.4 5.4h-3.6" />
      <path d="M7 8.6 8.5 10.2M20.4 12.2 18.8 10.6" />
      <circle cx="12" cy="13.4" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  /** ⭐ 闪耀之星 —— 星星 */
  badge_star: (
    <path
      d="m12 3.2 2.7 5.7 6.2.8-4.6 4.3 1.2 6.2L12 17.2l-5.5 3 1.2-6.2-4.6-4.3 6.2-.8L12 3.2Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  /** 🏆 干饭冠军 —— 奖杯 */
  badge_cup: (
    <>
      <path d="M8 4.2h8v4.6a4 4 0 0 1-8 0V4.2Z" />
      <path d="M8 5.4H5.6v1.6a3.4 3.4 0 0 0 3.2 3.4" />
      <path d="M16 5.4h2.4v1.6a3.4 3.4 0 0 1-3.2 3.4" />
      <path d="M12 12.8v4.4" />
      <path d="M8.6 20.4h6.8" />
      <path d="M9.4 20.4c0-1.4 1.1-2.4 2.6-2.4s2.6 1 2.6 2.4" />
    </>
  ),
  /** 🍲 火锅信徒 —— 锅与蒸汽 */
  badge_hotpot: (
    <>
      <path d="M3.6 11.4h16.8v1.8a5.6 5.6 0 0 1-5.6 5.6H9.2a5.6 5.6 0 0 1-5.6-5.6v-1.8Z" />
      <path d="M8.2 8.4c0-1.1 1-1.6 1-2.6s-1-1.5-1-2.6" />
      <path d="M12 8.4c0-1.1 1-1.6 1-2.6s-1-1.5-1-2.6" />
      <path d="M15.8 8.4c0-1.1 1-1.6 1-2.6s-1-1.5-1-2.6" />
    </>
  ),
  /** 👑 饕餮之王 —— 皇冠 */
  badge_crown: (
    <>
      <path d="M3.2 8.2 7 11.4 12 4.6l5 6.8 3.8-3.2-1.9 11.6H5.1L3.2 8.2Z" />
      <circle cx="12" cy="14.6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="6.2" cy="16.8" r="1" fill="currentColor" stroke="none" />
      <circle cx="17.8" cy="16.8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
};

/** 是否存在对应的内联 SVG 图形 */
export function hasBadgeIcon(badgeKey?: string | null): boolean {
  return typeof badgeKey === "string" && badgeKey in BADGE_ICONS;
}

interface BadgeIconProps {
  /** decor_items.key */
  badgeKey: string;
  className?: string;
}

/** 单个徽章图形（纯 SVG，不含底板）。无对应图形时返回 null */
export function BadgeIcon({ badgeKey, className }: BadgeIconProps) {
  const glyph = BADGE_ICONS[badgeKey];
  if (!glyph) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}

interface BadgeGlowProps {
  /** decor_items.key，用于匹配 SVG；缺失时回退 emoji */
  badgeKey?: string | null;
  /** 主题色（hex）。缺省用中性灰 */
  color?: string | null;
  /** emoji 兜底（decor_items.icon） */
  icon?: string | null;
  name: string;
  /** 无障碍/悬浮提示文案，缺省用 name */
  title?: string;
  /** 纯装饰（旁侧已有名称文本）时置 true：不出悬浮提示，读屏跳过，避免重复播报 */
  decorative?: boolean;
  /** 尺寸与字号，例如 "h-5 w-5 text-[11px]" */
  className?: string;
}

/**
 * 霓虹光晕徽章：半透明主题色底 + 彩色描边 + 外发光。
 *
 * 颜色通过 CSS 变量 --badge-c 注入，.badge-glow 内部再把主题色与前景色混合，
 * 因此浅色模式下图形自动加深、暗色模式下自动提亮，两端都有足够对比度。
 */
export function BadgeGlow({
  badgeKey,
  color,
  icon,
  name,
  title,
  decorative = false,
  className,
}: BadgeGlowProps) {
  return (
    <span
      className={cn("badge-glow", className)}
      style={{ "--badge-c": color ?? "#94a3b8" } as CSSProperties}
      title={decorative ? undefined : (title ?? name)}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
    >
      {hasBadgeIcon(badgeKey) ? (
        <BadgeIcon badgeKey={badgeKey!} className="h-[58%] w-[58%]" />
      ) : (
        <span aria-hidden="true" className="leading-none">
          {icon ?? "•"}
        </span>
      )}
    </span>
  );
}
