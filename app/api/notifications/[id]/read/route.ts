import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/notifications/[id]/read — 将指定通知标记为已读（校验归属当前用户） */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验该通知存在且属于当前用户（RLS 也会限制，这里提前给出友好错误）
    const { data: notification, error: findErr } = await supabase
      .from("notifications")
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (findErr || !notification) {
      return jsonResponse({ error: "通知不存在" }, { status: 404 });
    }
    if (notification.user_id !== user.id) {
      return jsonResponse({ error: "无权操作" }, { status: 403 });
    }

    // 仅更新尚未读的通知，避免覆盖已读时间戳
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);

    if (updateErr) {
      return jsonResponse(
        { error: safeErrorMessage(updateErr, "标记已读失败") },
        { status: 500 }
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
