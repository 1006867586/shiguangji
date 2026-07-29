import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { ReactionEmoji } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; emoji: string }> };

/** 合法 emoji 集合 */
const VALID_EMOJIS: ReactionEmoji[] = [
  "like",
  "love",
  "haha",
  "wow",
  "sad",
  "angry",
];

/**
 * DELETE /api/activities/[id]/reactions/[emoji] — 删除当前用户对该 emoji 的反应
 * 返回 { success: true }
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id, emoji } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }
    if (!VALID_EMOJIS.includes(emoji as ReactionEmoji)) {
      return jsonResponse(
        { error: "emoji 参数不合法" },
        { status: 400 }
      );
    }

    // 校验活动存在 + 当前用户为圈子成员
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

    const { error } = await supabase
      .from("activity_reactions")
      .delete()
      .eq("activity_id", id)
      .eq("user_id", user.id)
      .eq("emoji", emoji);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "操作失败") },
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
