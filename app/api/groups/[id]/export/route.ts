import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import { parseExternalLink } from "@/lib/activities";
import type { Group } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 格式化日期为 YYYY-MM-DD（用于文件名） */
function formatDateForFilename(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 将圈子名清洗为文件名安全的 ASCII 片段；非 ASCII 用拼音占位或保留 slug */
function sanitizeGroupNameForFilename(name: string): string {
  if (!name) return "group";
  // 移除文件名危险字符：路径分隔符、控制字符、引号等
  const cleaned = name.replace(/[\\/:*?"<>|\r\n\t]+/g, "").trim();
  // 若仍含非 ASCII（如中文），用 encodeURIComponent 编码后嵌入文件名
  if (!cleaned || /[^\x20-\x7E]/.test(cleaned)) {
    return encodeURIComponent(name) || "group";
  }
  return cleaned || "group";
}

/**
 * GET /api/groups/[id]/export — 导出圈子所有活动为 JSON
 * 返回 Content-Disposition: attachment; filename="xiangke-{groupName}-{date}.json"
 * 仅圈子成员可调用。包含该圈子的所有 activities + photos + comments + tags + ratings + rsvp。
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验圈子存在 + 当前用户为成员
    const { data: group, error: groupErr } = await supabase
      .from("groups")
      .select("id, name, description, avatar_url, invite_code, created_by, created_at, updated_at, settings")
      .eq("id", id)
      .maybeSingle();

    if (groupErr || !group) {
      return jsonResponse({ error: "圈子不存在" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("id, role, joined_at")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    // 拉取圈子所有活动（含作者 + 转发源摘要）
    const { data: activities, error: actErr } = await supabase
      .from("activities")
      .select(
        `id, type, content, external_link, created_at, group_id, repost_of_id, repost_comment,
         author:profiles!activities_author_id_fkey(id, nickname, avatar_url)`
      )
      .eq("group_id", id)
      .order("created_at", { ascending: false });

    if (actErr) {
      return jsonResponse(
        { error: safeErrorMessage(actErr, "获取活动失败") },
        { status: 500 }
      );
    }

    const activityList = (activities ?? []) as Array<Record<string, unknown>>;
    const activityIds = activityList.map((a) => a.id as string);

    // 并行批量拉取所有活动的关联数据
    const [photosRes, commentsRes, tagsRes, ratingsRes, rsvpRes, splitsRes] =
      await Promise.all([
        activityIds.length > 0
          ? supabase
              .from("activity_photos")
              .select(
                "id, activity_id, uploaded_by, url, caption, kind, created_at, uploader:profiles!activity_photos_uploaded_by_fkey(id, nickname, avatar_url)"
              )
              .in("activity_id", activityIds)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        activityIds.length > 0
          ? supabase
              .from("comments")
              .select(
                "id, activity_id, author_id, content, parent_id, created_at, author:profiles!comments_author_id_fkey(id, nickname, avatar_url)"
              )
              .in("activity_id", activityIds)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        activityIds.length > 0
          ? supabase
              .from("activity_tags")
              .select("activity_id, tag:tags(id, group_id, name, created_by, created_at)")
              .in("activity_id", activityIds)
          : Promise.resolve({ data: [], error: null }),
        activityIds.length > 0
          ? supabase
              .from("activity_ratings")
              .select("activity_id, user_id, score, comment, created_at, profile:profiles!activity_ratings_user_id_fkey(id, nickname, avatar_url)")
              .in("activity_id", activityIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        activityIds.length > 0
          ? supabase
              .from("activity_rsvp")
              .select("activity_id, user_id, status, updated_at, profile:profiles!activity_rsvp_user_id_fkey(id, nickname, avatar_url)")
              .in("activity_id", activityIds)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        activityIds.length > 0
          ? supabase
              .from("activity_splits")
              .select("id, activity_id, group_id, created_by, title, total_amount, currency, split_mode, status, created_at, updated_at")
              .in("activity_id", activityIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
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

    // 按 activity_id 分组
    const photosByActivity = new Map<string, unknown[]>();
    for (const p of (photosRes.data ?? []) as Array<Record<string, unknown>>) {
      const arr = photosByActivity.get(p.activity_id as string) ?? [];
      arr.push({
        id: p.id,
        url: p.url,
        caption: p.caption,
        kind: p.kind,
        uploaded_by: p.uploaded_by,
        created_at: p.created_at,
        uploader: p.uploader,
      });
      photosByActivity.set(p.activity_id as string, arr);
    }

    const commentsByActivity = new Map<string, Array<Record<string, unknown>>>();
    for (const c of (commentsRes.data ?? []) as Array<Record<string, unknown>>) {
      const arr = commentsByActivity.get(c.activity_id as string) ?? [];
      arr.push(c);
      commentsByActivity.set(c.activity_id as string, arr);
    }

    const tagsByActivity = new Map<string, unknown[]>();
    for (const r of (tagsRes.data ?? []) as Array<Record<string, unknown>>) {
      const tag = r.tag;
      if (!tag || Array.isArray(tag)) continue;
      const aid = r.activity_id as string;
      const arr = tagsByActivity.get(aid) ?? [];
      arr.push(tag);
      tagsByActivity.set(aid, arr);
    }

    const ratingsByActivity = new Map<string, unknown[]>();
    for (const r of (ratingsRes.data ?? []) as Array<Record<string, unknown>>) {
      const aid = r.activity_id as string;
      const arr = ratingsByActivity.get(aid) ?? [];
      arr.push({
        user_id: r.user_id,
        score: r.score,
        comment: r.comment,
        created_at: r.created_at,
        profile: r.profile,
      });
      ratingsByActivity.set(aid, arr);
    }

    const rsvpByActivity = new Map<string, unknown[]>();
    for (const r of (rsvpRes.data ?? []) as Array<Record<string, unknown>>) {
      const aid = r.activity_id as string;
      const arr = rsvpByActivity.get(aid) ?? [];
      arr.push({
        user_id: r.user_id,
        status: r.status,
        updated_at: r.updated_at,
        profile: r.profile,
      });
      rsvpByActivity.set(aid, arr);
    }

    const splitsByActivity = new Map<string, unknown>();
    for (const s of (splitsRes.data ?? []) as Array<Record<string, unknown>>) {
      splitsByActivity.set(s.activity_id as string, s);
    }

    // 组装每个活动的完整数据
    const activitiesPayload = activityList.map((a) => {
      // 组装楼中楼
      const commentList = commentsByActivity.get(a.id as string) ?? [];
      const topComments = commentList.filter((c) => !c.parent_id);
      for (const c of topComments) {
        (c as { replies?: unknown[] }).replies = commentList.filter(
          (r) => r.parent_id === c.id
        );
      }

      return {
        id: a.id,
        type: a.type,
        content: a.content,
        external_link: parseExternalLink(a.external_link),
        created_at: a.created_at,
        group_id: a.group_id,
        repost_comment: a.repost_comment,
        author: a.author,
        photos: photosByActivity.get(a.id as string) ?? [],
        comments: topComments,
        tags: tagsByActivity.get(a.id as string) ?? [],
        ratings: ratingsByActivity.get(a.id as string) ?? [],
        rsvp: rsvpByActivity.get(a.id as string) ?? [],
        split: splitsByActivity.get(a.id as string) ?? null,
      };
    });

    const payload = {
      exported_at: new Date().toISOString(),
      exported_by: user.id,
      group: group as Group,
      activities: activitiesPayload,
      stats: {
        activity_count: activitiesPayload.length,
        photo_count: activitiesPayload.reduce(
          (sum, a) => sum + (a.photos as unknown[]).length,
          0
        ),
        comment_count: activitiesPayload.reduce(
          (sum, a) => sum + (a.comments as unknown[]).length,
          0
        ),
      },
    };

    const dateStr = formatDateForFilename(new Date());
    const safeName = sanitizeGroupNameForFilename(group.name);
    const filename = `xiangke-${safeName}-${dateStr}.json`;
    // 同时提供 filename* 兼容非 ASCII
    const encodedFilename = encodeURIComponent(
      `xiangke-${group.name}-${dateStr}.json`
    );
    const contentDisposition = `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`;

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
