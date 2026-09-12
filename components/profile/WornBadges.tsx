import { BadgeGlow } from "@/components/decor/BadgeIcon";
import { BadgeSticker, hasBadgeSticker } from "@/components/decor/BadgeSticker";
import type { WornDecorBadge } from "@/types";

interface Props {
  /** 已佩戴的装饰徽章（道具精简字段） */
  badges: WornDecorBadge[];
  /** 最多展示几个，超出用 +N 收起 */
  max?: number;
}

/**
 * 挂在昵称旁的一排「已佩戴」装扮徽章。
 * - v3 资源存在时优先用 BadgeSticker（复古贴纸视觉）
 * - 否则走旧 BadgeGlow（霓虹光晕 + 内联 SVG / emoji 兜底）
 * - 纯展示，用原生 title 做悬浮提示，可在服务端/客户端任意复用。
 */
export function WornBadges({ badges, max = 5 }: Props) {
  if (!badges || badges.length === 0) return null;

  const shown = badges.slice(0, max);
  const rest = badges.length - shown.length;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      {shown.map((b) =>
        hasBadgeSticker(b.key) ? (
          <BadgeSticker
            key={b.id}
            badgeKey={b.key}
            rarity="common"
            color={b.color}
            name={b.name}
            className="h-5 w-5"
          />
        ) : (
          <BadgeGlow
            key={b.id}
            badgeKey={b.key}
            color={b.color}
            icon={b.icon}
            name={b.name}
            className="h-5 w-5 text-[11px]"
          />
        )
      )}
      {rest > 0 ? (
        <span
          title={`还有 ${rest} 个装扮`}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground"
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
