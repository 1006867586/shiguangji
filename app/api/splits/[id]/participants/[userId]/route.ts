import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { UpdateSplitParticipantBody } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; userId: string }> };

/**
 * PATCH /api/splits/[id]/participants/[userId] — 标记支付状态
 * 权限：分账创建者可改任意参与者；普通参与者只能改自己
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id, userId } = await params;

    if (!isUuid(id) || !isUuid(userId)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data: split } = await supabase
      .from("activity_splits")
      .select("id, created_by")
      .eq("id", id)
      .maybeSingle();

    if (!split) {
      return jsonResponse({ error: "分账不存在" }, { status: 404 });
    }

    const isCreator = split.created_by === user.id;
    const isSelf = userId === user.id;
    if (!isCreator && !isSelf) {
      return jsonResponse(
        { error: "无权修改他人支付状态" },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as UpdateSplitParticipantBody;
    if (typeof body.paid !== "boolean") {
      return jsonResponse(
        { error: "paid 必须为布尔值" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("split_participants")
      .update({
        paid: body.paid,
        paid_at: body.paid ? new Date().toISOString() : null,
      })
      .eq("split_id", id)
      .eq("user_id", userId);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "更新失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: { paid: body.paid } });
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
