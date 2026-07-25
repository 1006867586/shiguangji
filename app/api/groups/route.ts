import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse } from "@/lib/utils";
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

    // 调用 create_group RPC（security definer，绕过 RLS 的 auth.uid() 识别问题）
    const { data: group, error } = await supabase.rpc("create_group", {
      p_name: body.name.trim(),
      p_description: body.description?.trim() ?? null,
      p_avatar_url: body.avatarUrl ?? null,
    });

    if (error || !group) {
      return jsonResponse(
        { error: error?.message ?? "创建团体失败" },
        { status: 500 }
      );
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
