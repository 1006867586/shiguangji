import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { ActivitySplit } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

/** 获取分账详情（含参与者 + 关联 profiles） */
async function fetchSplitDetail(
  supabase: SupabaseClient,
  splitId: string
): Promise<ActivitySplit | null> {
  const { data: split, error } = await supabase
    .from("activity_splits")
    .select(
      "id, activity_id, group_id, created_by, title, total_amount, currency, split_mode, status, created_at, updated_at"
    )
    .eq("id", splitId)
    .maybeSingle();
  if (error || !split) return null;

  const { data: participants, error: partErr } = await supabase
    .from("split_participants")
    .select("id, split_id, user_id, share_amount, paid, paid_at, created_at")
    .eq("split_id", splitId)
    .order("created_at", { ascending: true });
  if (partErr) {
    return { ...split, participants: [] } as ActivitySplit;
  }

  const userIds = (participants ?? []).map((p) => p.user_id);
  const profileMap = new Map<
    string,
    { id: string; nickname: string; avatar_url: string | null }
  >();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p);
    }
  }

  const participantsWithProfile = (participants ?? []).map((p) => ({
    ...p,
    profile: profileMap.get(p.user_id),
  }));

  return { ...split, participants: participantsWithProfile } as ActivitySplit;
}

/** GET /api/splits/[id] — 获取分账详情（含参与者） */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data: split } = await supabase
      .from("activity_splits")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

    if (!split) {
      return jsonResponse({ error: "分账不存在" }, { status: 404 });
    }

    // 校验当前用户为分账所在团体的成员
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", split.group_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const detail = await fetchSplitDetail(supabase, id);
    if (!detail) {
      return jsonResponse({ error: "分账不存在" }, { status: 404 });
    }
    return jsonResponse({ data: detail });
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

/** PATCH /api/splits/[id] — 更新分账（仅创建者） */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data: split } = await supabase
      .from("activity_splits")
      .select("id, created_by")
      .eq("id", id)
      .maybeSingle();

    if (!split) {
      return jsonResponse({ error: "分账不存在" }, { status: 404 });
    }
    if (split.created_by !== user.id) {
      return jsonResponse({ error: "仅创建者可编辑" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      totalAmount?: number;
      status?: "open" | "settled";
    };

    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string") {
      patch.title = body.title.trim() || "聚餐账单";
    }
    if (body.totalAmount !== undefined) {
      const t = Number(body.totalAmount);
      if (!Number.isInteger(t) || t < 0) {
        return jsonResponse(
          { error: "totalAmount 必须为非负整数" },
          { status: 400 }
        );
      }
      patch.total_amount = t;
    }
    if (body.status !== undefined) {
      if (body.status !== "open" && body.status !== "settled") {
        return jsonResponse(
          { error: "status 参数不合法" },
          { status: 400 }
        );
      }
      patch.status = body.status;
    }

    if (Object.keys(patch).length === 0) {
      return jsonResponse({ error: "没有可更新的字段" }, { status: 400 });
    }
    patch.updated_at = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("activity_splits")
      .update(patch)
      .eq("id", id);

    if (updateErr) {
      return jsonResponse(
        { error: safeErrorMessage(updateErr, "更新失败") },
        { status: 500 }
      );
    }

    const detail = await fetchSplitDetail(supabase, id);
    return jsonResponse({ data: detail });
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

/** DELETE /api/splits/[id] — 删除分账（仅创建者） */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data: split } = await supabase
      .from("activity_splits")
      .select("id, created_by")
      .eq("id", id)
      .maybeSingle();

    if (!split) {
      return jsonResponse({ error: "分账不存在" }, { status: 404 });
    }
    if (split.created_by !== user.id) {
      return jsonResponse({ error: "仅创建者可删除" }, { status: 403 });
    }

    // 先删参与者，再删分账（兼容无级联删除的外键约束）
    const { error: partErr } = await supabase
      .from("split_participants")
      .delete()
      .eq("split_id", id);

    if (partErr) {
      return jsonResponse(
        { error: safeErrorMessage(partErr, "删除失败") },
        { status: 500 }
      );
    }

    const { error: delErr } = await supabase
      .from("activity_splits")
      .delete()
      .eq("id", id);

    if (delErr) {
      return jsonResponse(
        { error: safeErrorMessage(delErr, "删除失败") },
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
