import { createServerClient } from "@/lib/supabase/server";
import type { WornDecorBadge } from "@/types";

type ServerSupabase = Awaited<ReturnType<typeof createServerClient>>;

/** 可挂载装饰的 profile 精简对象（必须含 id） */
export interface DecoratableProfile {
  id: string;
  frameColor?: string | null;
  wornBadges?: WornDecorBadge[];
}

interface DecorItemRow {
  id: string;
  kind: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface DecorDisplayRow {
  user_id: string;
  avatar_frame_id: string | null;
  badge_ids: string[];
}

/**
 * 批量把用户的「头像框环色 + 佩戴徽章」挂到 profile 对象上。
 * - 空列表 / 全无佩戴时零成本跳过。
 * - 供 feed / 活动详情 / 聊天等「他人视角」展示使用，
 *   与 026 迁移中的 get_users_decor_display（security definer）配合绕过 RLS。
 * - 入参对象会被原地改写（追加 frameColor / wornBadges 字段）。
 */
export async function attachDecorToProfiles(
  supabase: ServerSupabase,
  profiles: (DecoratableProfile | null | undefined)[] | null | undefined
): Promise<void> {
  const list = (profiles ?? []).filter(
    (p): p is DecoratableProfile => Boolean(p?.id)
  );
  if (list.length === 0) return;

  const ids = Array.from(new Set(list.map((p) => p.id)));

  const [displayRes, itemsRes] = await Promise.all([
    supabase.rpc("get_users_decor_display", { p_user_ids: ids }),
    supabase.from("decor_items").select("id, kind, name, icon, color"),
  ]);

  const itemMap = new Map<string, DecorItemRow>();
  for (const it of (itemsRes.data ?? []) as DecorItemRow[]) {
    itemMap.set(it.id, it);
  }

  const frameIdByUser = new Map<string, string | null>();
  const badgeIdsByUser = new Map<string, string[]>();
  for (const row of (displayRes.data ?? []) as DecorDisplayRow[]) {
    frameIdByUser.set(row.user_id, row.avatar_frame_id ?? null);
    badgeIdsByUser.set(row.user_id, row.badge_ids ?? []);
  }

  for (const p of list) {
    const frameId = frameIdByUser.get(p.id) ?? null;
    const frameItem = frameId ? itemMap.get(frameId) : null;
    p.frameColor = frameItem?.color ?? null;

    const badgeIds = badgeIdsByUser.get(p.id) ?? [];
    p.wornBadges = badgeIds
      .map((id) => itemMap.get(id))
      .filter((it): it is DecorItemRow => Boolean(it))
      .map((it) => ({ id: it.id, icon: it.icon, color: it.color, name: it.name }));
  }
}
