import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { GroupMember, Profile } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/groups/[id]/members — 获取圈子成员列表
 * 仅圈子成员可调用，按 joined_at 升序返回。
 * 返回 { data: GroupMember[] }，每项含 profile: { id, nickname, avatar_url }。
 *
 * 注意：group_members.user_id 指向 auth.users 而非 profiles，
 * PostgREST 无法直接嵌套，故分两次查询后在 JS 中合并。
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验当前用户为圈子成员
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    // 拉取成员记录（按加入时间升序）
    const { data: members, error: membersErr } = await supabase
      .from("group_members")
      .select("id, user_id, role, joined_at")
      .eq("group_id", id)
      .order("joined_at", { ascending: true });

    if (membersErr) {
      return jsonResponse(
        { error: safeErrorMessage(membersErr, "获取成员列表失败") },
        { status: 500 }
      );
    }

    const list = (members ?? []) as Array<{
      id: string;
      user_id: string;
      role: GroupMember["role"];
      joined_at: string;
    }>;

    if (list.length === 0) {
      return jsonResponse({ data: [] });
    }

    // 批量拉取成员的 profile 信息（含 created_at 以匹配 GroupMember.profile 类型）
    const userIds = list.map((m) => m.user_id);
    const { data: profiles, error: profileErr } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url, created_at")
      .in("id", userIds);

    if (profileErr) {
      return jsonResponse(
        { error: safeErrorMessage(profileErr, "获取成员资料失败") },
        { status: 500 }
      );
    }

    const profileMap = new Map<string, Profile>();
    for (const p of (profiles ?? []) as Profile[]) {
      profileMap.set(p.id, {
        id: p.id,
        nickname: p.nickname,
        avatar_url: p.avatar_url,
        created_at: p.created_at,
      });
    }

    // 批量拉取各成员已解锁成就（security definer 函数，绕过仅本人可读的 RLS）
    const { data: achRows } = await supabase.rpc(
      "get_unlocked_achievements_for_users",
      { p_user_ids: userIds }
    );
    const achMap = new Map<string, Profile["achievements"]>();
    for (const row of (achRows ?? []) as Array<{
      user_id: string;
      achievements: Profile["achievements"];
    }>) {
      achMap.set(row.user_id, row.achievements ?? []);
    }
    for (const [uid, profile] of profileMap) {
      profile.achievements = achMap.get(uid) ?? [];
    }

    // 批量拉取成员佩戴配置（security definer 函数）+ 装饰目录，组装头像框 / 徽章
    const [decorDisplayRes, decorItemsRes] = await Promise.all([
      supabase.rpc("get_users_decor_display", { p_user_ids: userIds }),
      supabase
        .from("decor_items")
        .select("id, kind, key, name, icon, color, price, unlock_type, achievement_key, sort_order"),
    ]);
    const decorItemMap = new Map<string, {
      id: string;
      key: string;
      icon: string | null;
      color: string | null;
      name: string;
    }>();
    for (const item of (decorItemsRes.data ?? []) as Array<{
      id: string;
      key: string;
      icon: string | null;
      color: string | null;
      name: string;
    }>) {
      decorItemMap.set(item.id, item);
    }
    for (const row of (decorDisplayRes.data ?? []) as Array<{
      user_id: string;
      avatar_frame_id: string | null;
      badge_ids: string[] | null;
    }>) {
      const profile = profileMap.get(row.user_id);
      if (!profile) continue;
      profile.frameColor = row.avatar_frame_id
        ? (decorItemMap.get(row.avatar_frame_id)?.color ?? null)
        : null;
      profile.wornBadges = (row.badge_ids ?? [])
        .map((id) => decorItemMap.get(id))
        .filter(
          (it): it is {
            id: string;
            key: string;
            icon: string | null;
            color: string | null;
            name: string;
          } => !!it
        );
    }

    const result: GroupMember[] = list.map((m) => ({
      id: m.id,
      group_id: id,
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      profile: profileMap.get(m.user_id) ?? undefined,
    }));

    return jsonResponse({ data: result });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "服务器错误") },
      { status: 500 }
    );
  }
}
