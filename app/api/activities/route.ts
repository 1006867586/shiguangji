import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { parseExternalLink } from "@/lib/link-preview";
import { jsonResponse, isUuid, detectPlatform, safeErrorMessage, sanitizeExternalLink } from "@/lib/utils";
import { containsSensitiveWord } from "@/lib/sensitive-words";
import { extractMentionedUserIds } from "@/lib/mention";
import type { CreateActivityBody, ExternalLink } from "@/types";

export const dynamic = "force-dynamic";

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

/**
 * 为活动内容中被 @提及的同圈子成员创建 mention 通知。
 * best-effort：失败仅记录日志，不阻塞活动创建。
 */
async function createMentionNotifications(
  supabase: SupabaseClient,
  groupId: string,
  actorId: string,
  activityId: string,
  content: string
): Promise<void> {
  if (!content) return;
  try {
    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);

    const memberUserIds = (members ?? []).map((m) => m.user_id);
    if (memberUserIds.length === 0) return;

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

    const mentionedIds = extractMentionedUserIds(content, membersWithProfile);
    // 排除作者自己
    const targetIds = mentionedIds.filter((uid) => uid !== actorId);
    if (targetIds.length === 0) return;

    const notifications = targetIds.map((uid) => ({
      user_id: uid,
      actor_id: actorId,
      type: "mention" as const,
      activity_id: activityId,
      group_id: groupId,
      comment_id: null,
      data: { snippet: content.trim().slice(0, 100) },
    }));
    await supabase.from("notifications").insert(notifications);
  } catch (err) {
    console.error("[activities/mention] 创建提及通知失败", err);
  }
}

/** POST /api/activities — 发起新活动（原创或转发） */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as CreateActivityBody & {
      parseLink?: boolean;
      linkUrl?: string;
    };

    if (!body.groupId || !isUuid(body.groupId)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验是否为圈子成员
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", body.groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse(
        { error: "你不是该圈子成员，无权发布" },
        { status: 403 }
      );
    }

    // 敏感词检查（阻断策略）：检查正文 + 转发评论
    const textToCheck = [body.content, body.repostComment]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join(" ");
    if (textToCheck) {
      const sensitiveCheck = containsSensitiveWord(textToCheck);
      if (sensitiveCheck.found) {
        return jsonResponse(
          { error: "内容包含敏感词，请修改后重试" },
          { status: 400 }
        );
      }
    }

    // 转发
    if (body.repostOfId) {
      if (!isUuid(body.repostOfId)) {
        return jsonResponse({ error: "参数错误" }, { status: 400 });
      }
      const { data: orig, error: origErr } = await supabase
        .from("activities")
        .select("id, group_id")
        .eq("id", body.repostOfId)
        .maybeSingle();

      if (origErr || !orig) {
        return jsonResponse({ error: "原活动不存在" }, { status: 404 });
      }

      // IDOR 防护：必须是原活动所在圈子的成员才能转发
      const { data: origMembership } = await supabase
        .from("group_members")
        .select("id")
        .eq("group_id", orig.group_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!origMembership) {
        return jsonResponse(
          { error: "无权转发该活动" },
          { status: 403 }
        );
      }

      const { data: activity, error } = await supabase
        .from("activities")
        .insert({
          group_id: body.groupId,
          author_id: user.id,
          type: "repost",
          content: body.content?.trim() || null,
          repost_of_id: body.repostOfId,
          repost_comment: body.repostComment?.trim() || null,
        })
        .select("id")
        .single();

      if (error || !activity) {
        return jsonResponse(
          { error: safeErrorMessage(error, "转发失败") },
          { status: 500 }
        );
      }
      // 解析 @提及（正文 + 转发评论）
      const repostMentionText = [body.content, body.repostComment]
        .filter((s): s is string => typeof s === "string" && s.length > 0)
        .join(" ");
      if (repostMentionText) {
        await createMentionNotifications(
          supabase,
          body.groupId,
          user.id,
          activity.id,
          repostMentionText
        );
      }
      return jsonResponse({ data: activity }, { status: 201 });
    }

    // 原创活动
    const content = body.content?.trim() || null;
    let externalLink: ExternalLink | null = sanitizeExternalLink(body.externalLink);

    // 后端再次解析链接（可选）
    if (body.parseLink && body.linkUrl) {
      const parsed = await parseExternalLink(body.linkUrl);
      if (parsed) externalLink = parsed;
      else if (!externalLink) {
        const url = body.linkUrl;
        externalLink = {
          platform: detectPlatform(url),
          url,
          title: "",
          coverImage: null,
          rating: null,
          address: null,
          phone: null,
          price: null,
        };
      }
    }

    if (!content && !externalLink) {
      return jsonResponse(
        { error: "内容或链接至少需要一项" },
        { status: 400 }
      );
    }

    const { data: activity, error } = await supabase
      .from("activities")
      .insert({
        group_id: body.groupId,
        author_id: user.id,
        type: "original",
        content,
        external_link: externalLink as unknown as Record<string, unknown>,
      })
      .select("id")
      .single();

    if (error || !activity) {
      return jsonResponse(
        { error: safeErrorMessage(error, "发布失败") },
        { status: 500 }
      );
    }

    // 解析 @提及（仅正文）
    if (content) {
      await createMentionNotifications(
        supabase,
        body.groupId,
        user.id,
        activity.id,
        content
      );
    }

    return jsonResponse({ data: activity }, { status: 201 });
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
