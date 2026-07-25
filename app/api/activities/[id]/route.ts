import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { fetchActivityDetail } from "@/lib/activities";
import { jsonResponse } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/activities/[id] — 活动详情 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const activity = await fetchActivityDetail({
      activityId: id,
      userId: user.id,
    });

    if (!activity) {
      return jsonResponse({ error: "活动不存在或无权访问" }, { status: 404 });
    }
    return jsonResponse({ data: activity });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}

/** DELETE /api/activities/[id] — 删除活动（仅作者） */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { data: activity, error } = await supabase
      .from("activities")
      .select("id, author_id")
      .eq("id", id)
      .maybeSingle();

    if (error || !activity) {
      return jsonResponse({ error: "活动不存在" }, { status: 404 });
    }
    if (activity.author_id !== user.id) {
      return jsonResponse({ error: "仅作者可删除" }, { status: 403 });
    }

    const { error: delErr } = await supabase
      .from("activities")
      .delete()
      .eq("id", id);

    if (delErr) {
      return jsonResponse({ error: delErr.message }, { status: 500 });
    }
    return jsonResponse({ success: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
