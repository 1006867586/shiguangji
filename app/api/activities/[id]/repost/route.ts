import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/activities/[id]/repost — 转发活动（带附言） */
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

    // 校验当前用户是某个团体的成员（转发到自己所在团体）
    const body = (await request.json().catch(() => ({}))) as {
      groupId?: string;
      comment?: string;
      content?: string;
    };

    const targetGroupId = body.groupId ?? orig.group_id;

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", targetGroupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse(
        { error: "你不是该团体成员，无法转发" },
        { status: 403 }
      );
    }

    if (targetGroupId === orig.group_id) {
      // 同团体转发：避免自我引用循环
      // 仍允许（用户可能想强调），但 repost_of 不能是自己
      if (id === user.id) {
        return jsonResponse({ error: "不能转发自己" }, { status: 400 });
      }
    }

    const { data: activity, error } = await supabase
      .from("activities")
      .insert({
        group_id: targetGroupId,
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
        { error: error?.message ?? "转发失败" },
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
