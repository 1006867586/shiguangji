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

/** GET /api/activities/[id]/split — 获取该活动的分账（含 participants） */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
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
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const { data: split, error } = await supabase
      .from("activity_splits")
      .select("id")
      .eq("activity_id", id)
      .maybeSingle();

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取分账失败") },
        { status: 500 }
      );
    }

    if (!split) {
      return jsonResponse({ data: null });
    }

    const detail = await fetchSplitDetail(supabase, split.id);
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

/** POST /api/activities/[id]/split — 创建分账 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验活动存在 + 获取 group_id
    const { data: activity } = await supabase
      .from("activities")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

    if (!activity) {
      return jsonResponse({ error: "活动不存在" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      totalAmount?: number;
      splitMode?: "equal" | "custom";
      participantIds?: string[];
      shares?: Record<string, number>;
    };

    const totalAmount = Number(body.totalAmount);
    if (!Number.isInteger(totalAmount) || totalAmount < 0) {
      return jsonResponse(
        { error: "totalAmount 必须为非负整数（单位:分）" },
        { status: 400 }
      );
    }

    const splitMode: "equal" | "custom" =
      body.splitMode === "custom" ? "custom" : "equal";

    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "聚餐账单";

    // 参与者去重 + UUID 校验
    const participantIds = Array.from(new Set(body.participantIds ?? []));
    if (participantIds.length === 0) {
      return jsonResponse(
        { error: "至少需要一名参与者" },
        { status: 400 }
      );
    }
    if (!participantIds.every((uid) => typeof uid === "string" && isUuid(uid))) {
      return jsonResponse({ error: "参与者 ID 不合法" }, { status: 400 });
    }

    // 一次性校验：创建者自身 + 所有参与者均为圈子成员
    const allUserIds = Array.from(new Set([user.id, ...participantIds]));
    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", activity.group_id)
      .in("user_id", allUserIds);
    const memberSet = new Set((members ?? []).map((m) => m.user_id));
    if (!memberSet.has(user.id)) {
      return jsonResponse({ error: "无权操作" }, { status: 403 });
    }
    const nonMembers = participantIds.filter((uid) => !memberSet.has(uid));
    if (nonMembers.length > 0) {
      return jsonResponse(
        { error: "参与者必须都是圈子成员" },
        { status: 403 }
      );
    }

    // 计算各参与者份额（单位:分）
    const shares: Record<string, number> = {};
    if (splitMode === "equal") {
      const n = participantIds.length;
      const base = Math.floor(totalAmount / n);
      const remainder = totalAmount - base * n;
      for (const uid of participantIds) {
        shares[uid] = base;
      }
      // 余数加给创建者（若其在参与者中），否则加给第一个参与者
      const target = participantIds.includes(user.id)
        ? user.id
        : participantIds[0];
      shares[target] = base + remainder;
    } else {
      // custom 模式：必须提供 shares，且总和等于 totalAmount
      const rawShares = body.shares;
      if (!rawShares || typeof rawShares !== "object") {
        return jsonResponse(
          { error: "custom 模式需提供 shares" },
          { status: 400 }
        );
      }
      let sum = 0;
      for (const uid of participantIds) {
        const s = Number(rawShares[uid]);
        if (!Number.isInteger(s) || s < 0) {
          return jsonResponse(
            { error: "shares 中存在不合法的份额" },
            { status: 400 }
          );
        }
        shares[uid] = s;
        sum += s;
      }
      if (sum !== totalAmount) {
        return jsonResponse(
          { error: "各份额之和必须等于总金额" },
          { status: 400 }
        );
      }
    }

    // 创建分账
    const { data: split, error: splitErr } = await supabase
      .from("activity_splits")
      .insert({
        activity_id: id,
        group_id: activity.group_id,
        created_by: user.id,
        title,
        total_amount: totalAmount,
        currency: "CNY",
        split_mode: splitMode,
        status: "open",
      })
      .select("id")
      .single();

    if (splitErr || !split) {
      return jsonResponse(
        { error: safeErrorMessage(splitErr, "创建分账失败") },
        { status: 500 }
      );
    }

    // 写入参与者
    const participantRows = participantIds.map((uid) => ({
      split_id: split.id,
      user_id: uid,
      share_amount: shares[uid],
    }));
    const { error: partErr } = await supabase
      .from("split_participants")
      .insert(participantRows);

    if (partErr) {
      // 回滚已创建的分账
      await supabase.from("activity_splits").delete().eq("id", split.id);
      return jsonResponse(
        { error: safeErrorMessage(partErr, "创建参与者失败") },
        { status: 500 }
      );
    }

    const detail = await fetchSplitDetail(supabase, split.id);
    return jsonResponse({ data: detail }, { status: 201 });
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
