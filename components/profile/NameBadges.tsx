import type { Achievement } from "@/types";

interface Props {
  /** 仅传入「已解锁」的成就即可；组件内部会再过滤一次，调用更省心 */
  achievements: Achievement[];
  /** 最多展示几个图标，超出用 +N 收起 */
  max?: number;
}

/**
 * 挂在昵称/名称旁边的一排成就徽章。
 * - 只用原生 title 做悬浮提示，无交互状态，可在服务端/客户端任意位置复用。
 * - 未解锁的成就自动过滤，不渲染。
 */
export function NameBadges({ achievements, max = 5 }: Props) {
  const unlocked = achievements.filter((a) => a.unlocked);
  if (unlocked.length === 0) return null;

  const shown = unlocked.slice(0, max);
  const rest = unlocked.length - shown.length;

  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {shown.map((a) => (
        <span
          key={a.id}
          title={`${a.name} · ${a.description}`}
          aria-label={a.name}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-[13px] leading-none shadow-xs ring-1 ring-primary/20 transition-transform hover:scale-110 motion-reduce:transform-none"
        >
          <span aria-hidden="true">{a.icon}</span>
        </span>
      ))}
      {rest > 0 ? (
        <span
          title={`还有 ${rest} 个成就`}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground"
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
