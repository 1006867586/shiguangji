import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/activities/[id]/like — 点赞 / 取消点赞（toggle） */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { data: activity } = await supabase
      .from("activities")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

    if (!activity) {
      return jsonResponse({ error: "活动不存在" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", activity.group_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权操作" }, { status: 403 });
    }

    const { data: existing } = await supabase
      .from("activity_likes")
      .select("id")
      .eq("activity_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      // 取消点赞
      const { error } = await supabase
        .from("activity_likes")
        .delete()
        .eq("activity_id", id)
        .eq("user_id", user.id);
      if (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
      }
      return jsonResponse({ data: { liked: false } });
    }

    // 点赞
    const { error } = await supabase
      .from("activity_likes")
      .insert({
        activity_id: id,
        user_id: user.id,
      });
    if (error) {
      return jsonResponse({ error: error.message }, { status: 500 });
    }
    return jsonResponse({ data: { liked: true } }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
