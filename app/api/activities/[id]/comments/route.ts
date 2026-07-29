import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeParseInt, safeErrorMessage } from "@/lib/utils";
import { COMMENT_PAGE_SIZE } from "@/lib/constants";
import { containsSensitiveWord } from "@/lib/sensitive-words";
import { extractMentionedUserIds } from "@/lib/mention";
import type { CreateCommentBody } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/activities/[id]/comments — 评论列表（含楼中楼） */
export async function GET(request: NextRequest, { params }: Params) {
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
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = safeParseInt(
      searchParams.get("limit"),
      COMMENT_PAGE_SIZE,
      200
    );

    const { data: comments, error } = await supabase
      .from("comments")
      .select(
        "id, activity_id, author_id, content, parent_id, created_at, author:profiles!comments_author_id_fkey(id, nickname, avatar_url)"
      )
      .eq("activity_id", id)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取评论失败") },
        { status: 500 }
      );
    }

    // 组装楼中楼
    const all = (comments ?? []) as unknown as Array<{
      id: string;
      parent_id: string | null;
      [k: string]: unknown;
    }>;
    const top = all.filter((c) => !c.parent_id);
    for (const c of top) {
      (c as { replies?: unknown[] }).replies = all.filter(
        (r) => r.parent_id === c.id
      );
    }

    return jsonResponse({ data: top });
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

/** POST /api/activities/[id]/comments — 发表评论 */
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
      return jsonResponse({ error: "无权评论" }, { status: 403 });
    }

    const body = (await request.json()) as CreateCommentBody;
    if (!body.content?.trim()) {
      return jsonResponse({ error: "评论内容不能为空" }, { status: 400 });
    }

    // 敏感词检查（阻断策略）
    const sensitiveCheck = containsSensitiveWord(body.content);
    if (sensitiveCheck.found) {
      return jsonResponse(
        { error: "内容包含敏感词，请修改后重试" },
        { status: 400 }
      );
    }

    // 若指定 parent_id，校验其为合法 UUID 且属于同一活动且为一级评论
    if (body.parentId) {
      if (!isUuid(body.parentId)) {
        return jsonResponse({ error: "参数错误" }, { status: 400 });
      }
      const { data: parent } = await supabase
        .from("comments")
        .select("id, activity_id, parent_id")
        .eq("id", body.parentId)
        .maybeSingle();
      if (!parent || parent.activity_id !== id || parent.parent_id) {
        return jsonResponse(
          { error: "回复目标无效（仅支持楼中楼二级回复）" },
          { status: 400 }
        );
      }
    }

    const { data: comment, error } = await supabase
      .from("comments")
      .insert({
        activity_id: id,
        author_id: user.id,
        content: body.content.trim(),
        parent_id: body.parentId ?? null,
      })
      .select(
        "id, activity_id, author_id, content, parent_id, created_at, author:profiles!comments_author_id_fkey(id, nickname, avatar_url)"
      )
      .single();

    if (error || !comment) {
      return jsonResponse(
        { error: safeErrorMessage(error, "评论失败") },
        { status: 500 }
      );
    }

    // 解析 @提及并为被提及的同圈子成员创建 mention 通知（best-effort，失败不阻塞评论创建）
    try {
      // 拉取圈子成员 + profile 用于昵称匹配
      const { data: members } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", activity.group_id);

      const memberUserIds = (members ?? []).map((m) => m.user_id);
      let mentionedIds: string[] = [];

      if (memberUserIds.length > 0) {
        const { data: memberProfiles } = await supabase
          .from("profiles")
          .select("id, nickname")
          .in("id", memberUserIds);

        const membersWithProfile = (memberProfiles ?? [])
          .filter((p) => p.nickname)
          .map((p) => ({
            user_id: p.id,
            profile: { nickname: p.nickname },
          }));

        mentionedIds = extractMentionedUserIds(body.content, membersWithProfile);
      }

      // 排除评论作者自己
      const targetIds = mentionedIds.filter((uid) => uid !== user.id);

      if (targetIds.length > 0) {
        const notifications = targetIds.map((uid) => ({
          user_id: uid,
          actor_id: user.id,
          type: "mention" as const,
          activity_id: id,
          group_id: activity.group_id,
          comment_id: comment.id,
          data: { snippet: body.content.trim().slice(0, 100) },
        }));
        await supabase.from("notifications").insert(notifications);
      }
    } catch (mentionErr) {
      // 通知失败不影响评论创建
      console.error("[comments/mention] 创建提及通知失败", mentionErr);
    }

    return jsonResponse({ data: comment }, { status: 201 });
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
