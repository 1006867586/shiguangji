import type { WornDecorBadge } from "@/types";

interface Props {
  /** 已佩戴的装饰徽章（道具精简字段） */
  badges: WornDecorBadge[];
  /** 最多展示几个，超出用 +N 收起 */
  max?: number;
}

/**
 * 挂在昵称旁的一排「已佩戴」装扮徽章。
 * - 来自 user_decor_display.badge_ids 对应的 decor_items。
 * - 纯展示，用原生 title 做悬浮提示，可在服务端/客户端任意复用。
 */
export function WornBadges({ badges, max = 5 }: Props) {
  if (!badges || badges.length === 0) return null;

  const shown = badges.slice(0, max);
  const rest = badges.length - shown.length;

  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {shown.map((b) => (
        <span
          key={b.id}
          title={b.name}
          aria-label={b.name}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] leading-none shadow-xs ring-1 ring-black/5 transition-transform hover:scale-110 motion-reduce:transform-none"
          style={{ backgroundColor: b.color ?? "#e2e8f0" }}
        >
          <span aria-hidden="true">{b.icon}</span>
        </span>
      ))}
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