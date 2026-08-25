import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/diancan/notifications/subscribe — 订阅消息授权上报
 * body: { templateId, accept: bool }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as { templateId?: string; accept?: boolean };
    const templateId = body.templateId?.trim();
    if (!templateId) {
      return jsonResponse({ error: "缺少 templateId" }, { status: 400 });
    }

    const status = body.accept ? "accepted" : "rejected";
    const { data: subscription, error } = await supabase
      .from("notification_subscriptions")
      .upsert(
        {
          user_id: user.id,
          template_id: templateId,
          status,
          subscribed_at: new Date().toISOString(),
          unsubscribed_at: body.accept ? null : new Date().toISOString(),
        },
        { onConflict: "user_id,template_id" }
      )
      .select("*")
      .single();
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "上报失败") }, { status: 500 });
    }
    return jsonResponse({ data: { ok: true, subscription } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}