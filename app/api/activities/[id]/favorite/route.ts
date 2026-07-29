import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/activities/[id]/favorite — 收藏 / 取消收藏（toggle），返回 { favorited: boolean } */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验活动存在
    const { data: activity } = await supabase
      .from("activities")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

    if (!activity) {
      return jsonResponse({ error: "活动不存在" }, { status: 404 });
    }

    // 仅圈子成员可收藏（与 RLS 策略一致）
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", activity.group_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权操作" }, { status: 403 });
    }

    // 查询是否已收藏
    const { data: existing } = await supabase
      .from("activity_favorites")
      .select("id")
      .eq("activity_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      // 已收藏 → 取消收藏
      const { error } = await supabase
        .from("activity_favorites")
        .delete()
        .eq("activity_id", id)
        .eq("user_id", user.id);
      if (error) {
        return jsonResponse(
          { error: safeErrorMessage(error, "操作失败") },
          { status: 500 }
        );
      }
      return jsonResponse({ favorited: false });
    }

    // 未收藏 → 插入收藏
    const { error } = await supabase
      .from("activity_favorites")
      .insert({
        activity_id: id,
        user_id: user.id,
      });
    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "操作失败") },
        { status: 500 }
      );
    }
    return jsonResponse({ favorited: true }, { status: 201 });
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

/** DELETE /api/activities/[id]/favorite — 取消收藏，返回 { success: true } */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { error } = await supabase
      .from("activity_favorites")
      .delete()
      .eq("activity_id", id)
      .eq("user_id", user.id);

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
