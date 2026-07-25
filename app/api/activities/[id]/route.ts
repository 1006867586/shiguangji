import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { fetchActivityDetail } from "@/lib/activities";
import { jsonResponse } from "@/lib/utils";
import type { UpdateActivityBody } from "@/types";

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

/** PATCH /api/activities/[id] — 编辑活动（仅作者，仅原创可编辑内容/链接） */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    // 校验存在性 + 作者身份 + 类型（RLS 也会限制，这里提前拦截给出友好错误）
    const { data: activity, error: actErr } = await supabase
      .from("activities")
      .select("id, author_id, type")
      .eq("id", id)
      .maybeSingle();

    if (actErr || !activity) {
      return jsonResponse({ error: "活动不存在" }, { status: 404 });
    }
    if (activity.author_id !== user.id) {
      return jsonResponse({ error: "仅作者可编辑" }, { status: 403 });
    }
    if (activity.type !== "original") {
      return jsonResponse(
        { error: "转发活动不支持编辑，请删除后重新发布" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as UpdateActivityBody;

    // 构造更新字段（只允许这两个字段被修改）
    const patch: Record<string, unknown> = {};
    if (typeof body.content === "string") {
      patch.content = body.content.trim() || null;
    }
    if (body.externalLink !== undefined) {
      patch.external_link = body.externalLink
        ? (body.externalLink as unknown as Record<string, unknown>)
        : null;
    }

    // 至少有一项可改 + 改后不能两者都为空
    if (Object.keys(patch).length === 0) {
      return jsonResponse({ error: "没有可更新的字段" }, { status: 400 });
    }
    if (patch.content === null && patch.external_link === null) {
      return jsonResponse(
        { error: "内容和链接不能同时为空" },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabase
      .from("activities")
      .update(patch)
      .eq("id", id);

    if (updateErr) {
      return jsonResponse({ error: updateErr.message }, { status: 500 });
    }

    // 返回最新的活动详情
    const updated = await fetchActivityDetail({ activityId: id, userId: user.id });
    return jsonResponse({ data: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
