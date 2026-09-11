import type { DecorDisplay, DecorItem } from "@/types";

/** 解析佩戴配置：给定目录 + 佩戴记录，返回 头像框 与 已佩戴徽章 详情 */
export function resolveDecorDisplay(
  items: DecorItem[],
  display: DecorDisplay | null | undefined
): { frame: DecorItem | null; wornBadges: DecorItem[] } {
  const byId = new Map(items.map((it) => [it.id, it]));
  const frame = display?.avatar_frame_id
    ? byId.get(display.avatar_frame_id) ?? null
    : null;
  const wornBadges = (display?.badge_ids ?? [])
    .map((id) => byId.get(id))
    .filter((it): it is DecorItem => !!it);
  return { frame, wornBadges };
}