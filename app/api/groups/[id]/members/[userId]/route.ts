import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; userId: string }> };

/**
 * DELETE /api/groups/[id]/members/[userId] — 移除团体成员
 * 仅团体 admin 可调用，且不能移除自己（需使用退出团体接口）。
 * 调用 RPC remove_group_member（security definer，内部已校验权限与目标身份）。
 */
export async function DELETE(
  _request: NextRequest,
  { params }: Params
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id, userId } = await params;

    if (!isUuid(id) || !isUuid(userId)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 不能移除自己：交给 RPC 抛错也可，但提前拦截给出更友好的错误
    if (userId === user.id) {
      return jsonResponse(
        { error: "不能移除自己，请使用退出团体" },
        { status: 400 }
      );
    }

    // 校验当前用户为团体 admin（双重保险，RPC 内部也会校验）
    const { data: membership } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }
    if (membership.role !== "admin") {
      return jsonResponse(
        { error: "仅管理员可移除成员" },
        { status: 403 }
      );
    }

    const { error: rpcErr } = await supabase.rpc("remove_group_member", {
      p_group_id: id,
      p_user_id: userId,
    });

    if (rpcErr) {
      return jsonResponse(
        { error: safeErrorMessage(rpcErr, "移除成员失败") },
        { status: 400 }
      );
    }

    return jsonResponse({ success: true });
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
