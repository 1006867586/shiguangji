import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isAllowedImageUrl, safeErrorMessage } from "@/lib/utils";
import type { CreateGroupBody, Group } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/groups — 当前用户加入的圈子列表 */
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
      return jsonResponse(
        { error: safeErrorMessage(error, "获取圈子列表失败") },
        { status: 500 }
      );
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
    return jsonResponse(
      { error: safeErrorMessage(err, "服务器错误") },
      { status: 500 }
    );
  }
}

/** POST /api/groups — 创建新圈子 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as CreateGroupBody;
    if (!body.name?.trim()) {
      return jsonResponse({ error: "圈子名称不能为空" }, { status: 400 });
    }

    // 头像 URL 域名校验（允许为空）
    const avatarUrl = body.avatarUrl ?? null;
    if (avatarUrl !== null && !isAllowedImageUrl(avatarUrl)) {
      return jsonResponse(
        { error: "头像 URL 域名不被允许" },
        { status: 400 }
      );
    }

    // 调用 create_group RPC（security definer，绕过 RLS 的 auth.uid() 识别问题）
    const { data: group, error } = await supabase.rpc("create_group", {
      p_name: body.name.trim(),
      p_description: body.description?.trim() ?? null,
      p_avatar_url: avatarUrl,
    });

    if (error || !group) {
      return jsonResponse(
        { error: safeErrorMessage(error, "创建圈子失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: group }, { status: 201 });
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
