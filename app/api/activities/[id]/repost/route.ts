import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/activities/[id]/repost — 分享活动到另一个团体（带附言） */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { data: orig } = await supabase
      .from("activities")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

    if (!orig) {
      return jsonResponse({ error: "原活动不存在" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      groupId?: string;
      comment?: string;
      content?: string;
    };

    // 站内分享必须指定目标团体，且不能是原活动所在团体
    if (!body.groupId) {
      return jsonResponse(
        { error: "请选择要分享到的团体" },
        { status: 400 }
      );
    }
    if (body.groupId === orig.group_id) {
      return jsonResponse(
        { error: "不能分享到原活动所在的团体，请选择其他团体" },
        { status: 400 }
      );
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", body.groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse(
        { error: "你不是目标团体成员，无法分享" },
        { status: 403 }
      );
    }

    const { data: activity, error } = await supabase
      .from("activities")
      .insert({
        group_id: body.groupId,
        author_id: user.id,
        type: "repost",
        content: body.content?.trim() || null,
        repost_of_id: id,
        repost_comment: body.comment?.trim() || null,
      })
      .select("id")
      .single();

    if (error || !activity) {
      return jsonResponse(
        { error: error?.message ?? "分享失败" },
        { status: 500 }
      );
    }

    return jsonResponse({ data: activity }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
