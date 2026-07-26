import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { RateActivityBody } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/activities/[id]/rating — 获取当前用户评分 + 平均分 + 评分人数 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验活动存在 + 当前用户为团体成员（与 RLS 策略一致）
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
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const { data: ratings, error } = await supabase
      .from("activity_ratings")
      .select("user_id, score")
      .eq("activity_id", id);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取评分失败") },
        { status: 500 }
      );
    }

    const all = (ratings ?? []) as { user_id: string; score: number }[];
    const count = all.length;
    // 平均分保留 1 位小数
    const average =
      count > 0
        ? Math.round((all.reduce((sum, r) => sum + r.score, 0) / count) * 10) / 10
        : 0;
    const mine = all.find((r) => r.user_id === user.id);

    return jsonResponse({
      data: {
        my_score: mine?.score ?? null,
        average,
        count,
      },
    });
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

/** POST /api/activities/[id]/rating — 评分 / 更新评分（upsert，每个用户仅一条） */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

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

    const body = (await request.json().catch(() => ({}))) as RateActivityBody;
    const score = Number(body.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return jsonResponse(
        { error: "score 必须为 1-5 的整数" },
        { status: 400 }
      );
    }

    const comment =
      typeof body.comment === "string" ? body.comment.trim() || null : null;

    const { error } = await supabase
      .from("activity_ratings")
      .upsert(
        {
          activity_id: id,
          user_id: user.id,
          score,
          comment,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "activity_id,user_id" }
      );

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "评分失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: { score } });
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

/** DELETE /api/activities/[id]/rating — 删除自己的评分 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { error } = await supabase
      .from("activity_ratings")
      .delete()
      .eq("activity_id", id)
      .eq("user_id", user.id);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "删除失败") },
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
