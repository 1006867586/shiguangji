import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, generateInviteCode } from "@/lib/utils";
import type { CreateGroupBody, Group } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/groups — 当前用户加入的团体列表 */
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const { data: memberships, error } = await supabase
      .from("group_members")
      .select(
        `role, joined_at, group:groups!inner(*)`
      )
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false });

    if (error) {
      return jsonResponse({ error: error.message }, { status: 500 });
    }

    const groups = (memberships ?? []).map((m) => {
      const g = m.group as unknown as Group;
      return { ...g, role: m.role, joined_at: m.joined_at };
    });

    return jsonResponse({ data: groups });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}

/** POST /api/groups — 创建新团体 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as CreateGroupBody;
    if (!body.name?.trim()) {
      return jsonResponse({ error: "团体名称不能为空" }, { status: 400 });
    }

    // 生成唯一邀请码（最多重试 5 次）
    let inviteCode = "";
    for (let i = 0; i < 5; i++) {
      const code = generateInviteCode();
      const { data: existing } = await supabase
        .from("groups")
        .select("id")
        .eq("invite_code", code)
        .maybeSingle();
      if (!existing) {
        inviteCode = code;
        break;
      }
    }
    if (!inviteCode) {
      return jsonResponse({ error: "邀请码生成失败，请重试" }, { status: 500 });
    }

    const { data: group, error } = await supabase
      .from("groups")
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        avatar_url: body.avatarUrl ?? null,
        invite_code: inviteCode,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !group) {
      return jsonResponse(
        { error: error?.message ?? "创建团体失败" },
        { status: 500 }
      );
    }

    // 创建者自动加入为 admin
    const { error: memberErr } = await supabase
      .from("group_members")
      .insert({
        group_id: group.id,
        user_id: user.id,
        role: "admin",
      });

    if (memberErr) {
      return jsonResponse({ error: memberErr.message }, { status: 500 });
    }

    return jsonResponse({ data: group }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
