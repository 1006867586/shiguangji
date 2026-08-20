import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/map/checkins/[id] — 撤销自己的打卡记录
 * 返回 { data: { success: true } }；非本人记录 RLS 拒绝，返回 404。
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("checkins")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      return jsonResponse({ error: "打卡记录不存在" }, { status: 404 });
    }

    const { error } = await supabase.from("checkins").delete().eq("id", id);
    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "撤销打卡失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: { success: true } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "撤销打卡失败") },
      { status: 500 }
    );
  }
}
