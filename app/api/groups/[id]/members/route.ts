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
