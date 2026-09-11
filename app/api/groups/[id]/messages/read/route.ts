import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/groups/[id]/messages/read — 标记该圈子聊天为已读（last_read_at = now） */
export async function POST(_request: NextRequest, { params }: Params) {
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

    const { error } = await supabase.rpc("mark_group_chat_read", {
      p_group_id: id,
    });
    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "标记已读失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: { ok: true } });
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
