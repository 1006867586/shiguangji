import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 校验当前用户是否为活动所在圈子的管理员；返回活动的 group_id 或 null */
async function getActivityGroupAsAdmin(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  activityId: string,
  userId: string
): Promise<string | null> {
  const { data: activity } = await supabase
    .from("activities")
    .select("id, group_id")
    .eq("id", activityId)
    .maybeSingle();
  if (!activity) return null;

  const { data: admin } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", activity.group_id)
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  return admin ? (activity.group_id as string) : null;
}

/**
 * POST /api/activities/[id]/pin — 置顶 / 取消置顶（toggle），仅圈子管理员可用
 * 返回 { pinned: boolean }
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验活动存在 + 当前用户为该活动所在圈子的 admin
    const { data: activity } = await supabase
      .from("activities")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

    if (!activity) {
      return jsonResponse({ error: "活动不存在" }, { status: 404 });
    }

    const { data: admin } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", activity.group_id)
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!admin) {
      return jsonResponse(
        { error: "仅圈子管理员可置顶活动" },
        { status: 403 }
      );
    }

    // 查询是否已置顶
    const { data: existing } = await supabase
      .from("activity_pins")
      .select("activity_id")
      .eq("activity_id", id)
      .maybeSingle();

    if (existing) {
      // 已置顶 → 取消置顶
      const { error } = await supabase
        .from("activity_pins")
        .delete()
        .eq("activity_id", id);
      if (error) {
        return jsonResponse(
          { error: safeErrorMessage(error, "操作失败") },
          { status: 500 }
        );
      }
      return jsonResponse({ pinned: false });
    }

    // 未置顶 → 插入置顶
    const { error } = await supabase.from("activity_pins").insert({
      activity_id: id,
      pinned_by: user.id,
    });
    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "操作失败") },
        { status: 500 }
      );
    }
    return jsonResponse({ pinned: true }, { status: 201 });
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

/** DELETE /api/activities/[id]/pin — 取消置顶，仅圈子管理员可用，返回 { success: true } */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const groupId = await getActivityGroupAsAdmin(supabase, id, user.id);
    if (groupId === null) {
      // 活动不存在或非管理员
      const { data: activity } = await supabase
        .from("activities")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (!activity) {
        return jsonResponse({ error: "活动不存在" }, { status: 404 });
      }
      return jsonResponse(
        { error: "仅圈子管理员可取消置顶" },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from("activity_pins")
      .delete()
      .eq("activity_id", id);

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
