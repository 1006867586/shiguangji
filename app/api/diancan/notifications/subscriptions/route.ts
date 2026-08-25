import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/diancan/notifications/subscriptions — 当前用户订阅消息授权状态 */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const { data: subscriptions, error } = await supabase
      .from("notification_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("subscribed_at", { ascending: false });
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "查询失败") }, { status: 500 });
    }
    return jsonResponse({ data: { subscriptions: subscriptions ?? [] } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}