"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * 复古贴纸徽章（v3 视觉体系）
 *
 * - 渲染一张完整的 PNG 贴纸资源（撕纸边 + 厚黑描边 + 半色调网点）
 * - 资源路径：`/badges/v3/{rarity}/{badgeKey}.png`
 * - 加载失败时回退到主题色圆形（不破坏布局）
 * - 三档稀有度：common / rare / epic，epic 在 rare 基础上加缓慢旋转光环
 *
 * 与旧 BadgeGlow（`.badge-glow` 圆环 + 内联 SVG）并行存在，不破坏现有调用方。
 * 新代码优先用本组件；旧组件计划在 11 枚徽章资源齐备后迁移。
 */
export type BadgeRarity = "common" | "rare" | "epic";

export interface BadgeStickerProps {
  /** decor_items.key */
  badgeKey: string;
  /** 稀有度：默认 common */
  rarity?: BadgeRarity;
  /** 主题色（hex），加载失败时兜底 */
  color?: string | null;
  /** 装饰模式：true 时不出悬浮提示，读屏跳过 */
  decorative?: boolean;
  /** 名称，用于悬浮提示与无障碍 */
  name: string;
  /** 自定义悬浮提示，默认用 name */
  title?: string;
  /** 尺寸类，例如 "h-5 w-5" / "h-10 w-10" / "h-16 w-16" */
  className?: string;
}

function resourceUrl(badgeKey: string, rarity: BadgeRarity): string {
  return `/badges/v3/${rarity}/${badgeKey}.png`;
}

/**
 * v3 资源白名单：仅这些 key 会去取 PNG，其他走旧 BadgeGlow。
 * 新增徽章时把 key 加进来即可启用新视觉，无需改任何调用方。
 *
 * 现状（2026-09 落地）：复刻全部 11 枚存量徽章。
 * 后续新徽章上线时，先把 PNG 放到 public/badges/v3/{rarity}/，
 * 再把 key 加到这个集合里。
 */
const V3_KEYS = new Set<string>([
  "badge_activities_1",
  "badge_circles_3",
  "badge_crown",
  "badge_cup",
  "badge_hotpot",
  "badge_meals_week_10",
  "badge_meals_week_5",
  "badge_star",
  "badge_streak_3",
  "badge_streak_7",
  "badge_total_meals_20",
]);

/** 该 key 是否存在 v3 资源；调用方据此决定走哪个组件。 */
export function hasBadgeSticker(badgeKey?: string | null): boolean {
  return typeof badgeKey === "string" && V3_KEYS.has(badgeKey);
}

/**
 * 单枚贴纸徽章（img + 稀有度样式 + 兜底）。
 * 与 BadgeGlow 互不替代；本组件专供 v3 复古贴纸视觉。
 */
export function BadgeSticker({
  badgeKey,
  rarity = "common",
  color,
  decorative = false,
  name,
  title,
  className,
}: BadgeStickerProps) {
  const [failed, setFailed] = useState(false);

  const url = resourceUrl(badgeKey, rarity);
  const showImg = !failed;

  return (
    <span
      className={cn(
        "badge-sticker",
        `badge-sticker--${rarity}`,
        className
      )}
      title={decorative ? undefined : (title ?? name)}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      style={
        failed && color
          ? ({ "--badge-c": color } as React.CSSProperties)
          : undefined
      }
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- 静态 public 资源 + unoptimized
        <img
          src={url}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="badge-sticker__img"
        />
      ) : (
        // 兜底：主题色实心圆
        <span aria-hidden="true" className="badge-sticker__fallback" />
      )}
    </span>
  );
}
