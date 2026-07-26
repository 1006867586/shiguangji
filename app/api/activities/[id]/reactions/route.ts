import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { ReactionEmoji, ReactionSummary } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 合法 emoji 集合 */
const VALID_EMOJIS: ReactionEmoji[] = [
  "like",
  "love",
  "haha",
  "wow",
  "sad",
  "angry",
];

function emptySummary(): ReactionSummary {
  return {
    like: 0,
    love: 0,
    haha: 0,
    wow: 0,
    sad: 0,
    angry: 0,
    my_reaction: null,
  };
}

/**
 * GET /api/activities/[id]/reactions — 获取活动的所有反应汇总
 * 返回 { data: ReactionSummary }
 */
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

    // 拉取该活动的全部反应 + 当前用户的反应
    const [allRes, mineRes] = await Promise.all([
      supabase
        .from("activity_reactions")
        .select("emoji")
        .eq("activity_id", id),
      supabase
        .from("activity_reactions")
        .select("emoji")
        .eq("activity_id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (allRes.error) {
      return jsonResponse(
        { error: safeErrorMessage(allRes.error, "获取反应失败") },
        { status: 500 }
      );
    }

    const summary = emptySummary();
    for (const r of (allRes.data ?? []) as { emoji: ReactionEmoji }[]) {
      if (VALID_EMOJIS.includes(r.emoji)) {
        summary[r.emoji] += 1;
      }
    }
    summary.my_reaction = (mineRes.data as { emoji: ReactionEmoji } | null)
      ?.emoji ?? null;

    return jsonResponse({ data: summary });
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

/**
 * POST /api/activities/[id]/reactions — 添加/切换反应
 * body: { emoji }
 * 行为：同一 emoji 已存在 → 删除（toggle off）；不同 emoji 已存在 → 替换；不存在 → 插入
 * 返回 { data: { reacted: boolean, emoji } }
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { emoji?: string };
    const emoji = body.emoji as ReactionEmoji | undefined;
    if (!emoji || !VALID_EMOJIS.includes(emoji)) {
      return jsonResponse(
        { error: "emoji 参数不合法" },
        { status: 400 }
      );
    }

    // 校验活动存在 + 当前用户为团体成员
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

    // 查询当前用户在该活动上的现有反应（最多 1 条，符合 my_reaction 语义）
    const { data: existing } = await supabase
      .from("activity_reactions")
      .select("id, emoji")
      .eq("activity_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing && existing.emoji === emoji) {
      // 同一 emoji 已存在 → 删除（toggle off）
      const { error } = await supabase
        .from("activity_reactions")
        .delete()
        .eq("id", existing.id);
      if (error) {
        return jsonResponse(
          { error: safeErrorMessage(error, "操作失败") },
          { status: 500 }
        );
      }
      return jsonResponse({ data: { reacted: false, emoji } });
    }

    // 不同 emoji 已存在 → 删除旧的（替换）；不存在 → 直接插入
    if (existing) {
      const { error: delErr } = await supabase
        .from("activity_reactions")
        .delete()
        .eq("id", existing.id);
      if (delErr) {
        return jsonResponse(
          { error: safeErrorMessage(delErr, "操作失败") },
          { status: 500 }
        );
      }
    }

    const { error: insertErr } = await supabase
      .from("activity_reactions")
      .insert({
        activity_id: id,
        user_id: user.id,
        emoji,
      });
    if (insertErr) {
      return jsonResponse(
        { error: safeErrorMessage(insertErr, "操作失败") },
        { status: 500 }
      );
    }
    return jsonResponse(
      { data: { reacted: true, emoji } },
      { status: 201 }
    );
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
