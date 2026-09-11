import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/groups/[id]/messages/unread-count — 当前用户在该圈子的未读聊天数 */
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

    const { data, error } = await supabase.rpc("get_chat_unread_count", {
      p_group_id: id,
    });
    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取未读数失败") },
        { status: 500 }
      );
    }

    const row = (data ?? [])[0] as { unread_count?: number } | undefined;
    return jsonResponse({ data: { count: row?.unread_count ?? 0 } });
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
