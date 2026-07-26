import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/notifications/unread-count — 当前用户未读通知数 */
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取未读数失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: { count: count ?? 0 } });
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
