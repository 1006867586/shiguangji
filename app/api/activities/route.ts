import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { parseExternalLinkUrl } from "@/lib/link-preview";
import { jsonResponse, isUrl, detectPlatform } from "@/lib/utils";
import type { CreateActivityBody, ExternalLink } from "@/types";

export const dynamic = "force-dynamic";

/** POST /api/activities — 发起新活动（原创或转发） */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as CreateActivityBody & {
      parseLink?: boolean;
      linkUrl?: string;
    };

    if (!body.groupId) {
      return jsonResponse({ error: "缺少 groupId" }, { status: 400 });
    }

    // 校验是否为团体成员
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", body.groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse(
        { error: "你不是该团体成员，无权发布" },
        { status: 403 }
      );
    }

    // 转发
    if (body.repostOfId) {
      const { data: orig, error: origErr } = await supabase
        .from("activities")
        .select("id, group_id")
        .eq("id", body.repostOfId)
        .maybeSingle();

      if (origErr || !orig) {
        return jsonResponse({ error: "原活动不存在" }, { status: 404 });
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
          { error: error?.message ?? "转发失败" },
          { status: 500 }
        );
      }
      return jsonResponse({ data: activity }, { status: 201 });
    }

    // 原创活动
    const content = body.content?.trim() || null;
    let externalLink: ExternalLink | null = body.externalLink ?? null;

    // 后端再次解析链接（可选）
    if (body.parseLink && body.linkUrl && isUrl(body.linkUrl)) {
      const parsed = await parseExternalLinkUrl(body.linkUrl);
      if (parsed) externalLink = parsed;
      else if (!externalLink) {
        externalLink = {
          platform: detectPlatform(body.linkUrl),
          url: body.linkUrl,
          title: "",
          coverImage: null,
          rating: null,
          address: null,
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
        { error: error?.message ?? "发布失败" },
        { status: 500 }
      );
    }

    return jsonResponse({ data: activity }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
