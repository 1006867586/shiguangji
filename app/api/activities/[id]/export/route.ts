import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import { parseExternalLink } from "@/lib/activities";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 格式化日期为 YYYY-MM-DD（用于文件名） */
function formatDateForFilename(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * GET /api/activities/[id]/export — 导出单个活动为 JSON
 * 返回 Content-Disposition: attachment，仅团体成员可调用。
 * 含活动本身 + 所有照片 + 所有评论（含楼中楼） + 标签 + 评分 + RSVP + 分账。
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 取活动（含作者 + 转发源）
    const { data: activity, error: actErr } = await supabase
      .from("activities")
      .select(
        `id, type, content, external_link, created_at, group_id, repost_of_id, repost_comment,
         author:profiles!activities_author_id_fkey(id, nickname, avatar_url)`
      )
      .eq("id", id)
      .maybeSingle();

    if (actErr || !activity) {
      return jsonResponse({ error: "活动不存在" }, { status: 404 });
    }

    // 校验当前用户为团体成员
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", activity.group_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    // 并行拉取相关数据
    const [photosRes, commentsRes, tagsRes, ratingsRes, rsvpRes, splitRes, repostOfRes] =
      await Promise.all([
        supabase
          .from("activity_photos")
          .select(
            "id, activity_id, uploaded_by, url, caption, kind, created_at, uploader:profiles!activity_photos_uploaded_by_fkey(id, nickname, avatar_url)"
          )
          .eq("activity_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("comments")
          .select(
            "id, activity_id, author_id, content, parent_id, created_at, author:profiles!comments_author_id_fkey(id, nickname, avatar_url)"
          )
          .eq("activity_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("activity_tags")
          .select("tag:tags(id, group_id, name, created_by, created_at)")
          .eq("activity_id", id),
        supabase
          .from("activity_ratings")
          .select("user_id, score, comment, created_at, profile:profiles!activity_ratings_user_id_fkey(id, nickname, avatar_url)")
          .eq("activity_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("activity_rsvp")
          .select("user_id, status, updated_at, profile:profiles!activity_rsvp_user_id_fkey(id, nickname, avatar_url)")
          .eq("activity_id", id)
          .order("updated_at", { ascending: false }),
        supabase
          .from("activity_splits")
          .select("id, activity_id, group_id, created_by, title, total_amount, currency, split_mode, status, created_at, updated_at")
          .eq("activity_id", id)
          .maybeSingle(),
        activity.repost_of_id
          ? supabase
              .from("activities")
              .select(
                `id, type, content, external_link, created_at,
                 author:profiles!activities_author_id_fkey(id, nickname, avatar_url)`
              )
              .eq("id", activity.repost_of_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

    if (photosRes.error) {
      return jsonResponse(
        { error: safeErrorMessage(photosRes.error, "获取照片失败") },
        { status: 500 }
      );
    }
    if (commentsRes.error) {
      return jsonResponse(
        { error: safeErrorMessage(commentsRes.error, "获取评论失败") },
        { status: 500 }
      );
    }

    // 标签解包
    const tags = (tagsRes.data ?? [])
      .map((r) => (r as { tag?: unknown }).tag)
      .filter((t) => Boolean(t) && !Array.isArray(t));

    // 评分
    const ratings = (ratingsRes.data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        user_id: row.user_id,
        score: row.score,
        comment: row.comment,
        created_at: row.created_at,
        profile: row.profile,
      };
    });

    // RSVP
    const rsvp = (rsvpRes.data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        user_id: row.user_id,
        status: row.status,
        updated_at: row.updated_at,
        profile: row.profile,
      };
    });

    // 转发源
    let repost_of: Record<string, unknown> | null = null;
    if (repostOfRes.data) {
      const r = repostOfRes.data as Record<string, unknown>;
      repost_of = {
        id: r.id,
        type: r.type,
        content: r.content,
        external_link: parseExternalLink(r.external_link),
        created_at: r.created_at,
        author: r.author,
      };
    }

    // 组装楼中楼
    const commentList = (commentsRes.data ?? []) as Array<Record<string, unknown>>;
    const topComments = commentList.filter((c) => !c.parent_id);
    for (const c of topComments) {
      (c as { replies?: unknown[] }).replies = commentList.filter(
        (r) => r.parent_id === c.id
      );
    }

    const payload = {
      exported_at: new Date().toISOString(),
      exported_by: user.id,
      activity: {
        id: activity.id,
        type: activity.type,
        content: activity.content,
        external_link: parseExternalLink(activity.external_link),
        created_at: activity.created_at,
        group_id: activity.group_id,
        repost_comment: activity.repost_comment,
        author: activity.author,
        repost_of: repost_of,
      },
      photos: (photosRes.data ?? []).map((p) => {
        const row = p as Record<string, unknown>;
        return {
          id: row.id,
          url: row.url,
          caption: row.caption,
          kind: row.kind,
          uploaded_by: row.uploaded_by,
          created_at: row.created_at,
          uploader: row.uploader,
        };
      }),
      comments: topComments,
      tags,
      ratings,
      rsvp,
      split: splitRes.data ?? null,
    };

    const dateStr = formatDateForFilename(new Date());
    const filename = `xiangke-activity-${dateStr}.json`;
    // 同时提供 filename* 以兼容非 ASCII 字符（这里全 ASCII，但保持规范）
    const contentDisposition = `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": contentDisposition,
        "cache-control": "no-store",
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
