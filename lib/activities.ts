import { createServerClient } from "./supabase/server";
import type {
  Activity,
  ActivityPhoto,
  Comment,
  ExternalLink,
} from "@/types";

/** 将 jsonb 字段安全转换为 ExternalLink */
export function parseExternalLink(raw: unknown): ExternalLink | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const url = typeof r.url === "string" ? r.url : "";
  const title = typeof r.title === "string" ? r.title : "";
  if (!url && !title) return null;
  return {
    platform: (r.platform as ExternalLink["platform"]) ?? "other",
    url,
    title,
    coverImage: (r.coverImage as string) ?? (r.cover_image as string) ?? null,
    rating: typeof r.rating === "number" ? r.rating : null,
    address: (r.address as string) ?? null,
    price: (r.price as string) ?? null,
  };
}

/** 从 DB 行（get_group_feed 返回）映射为 Activity 聚合对象 */
export function mapFeedRow(row: Record<string, unknown>): Activity {
  return {
    id: row.id as string,
    type: row.type as Activity["type"],
    content: (row.content as string) ?? null,
    external_link: parseExternalLink(row.external_link),
    created_at: row.created_at as string,
    author: row.author as Activity["author"],
    photos: [],
    photo_count: Number(row.photo_count ?? 0),
    comment_count: Number(row.comment_count ?? 0),
    like_count: Number(row.like_count ?? 0),
    is_liked: Boolean(row.is_liked),
    repost_of: (row.repost_of as Activity["repost_of"]) ?? null,
    group_id: (row.group_id as string) ?? "",
  };
}

/**
 * 获取 feed 列表（通过 RPC 函数避免 N+1），并补充前 9 张照片缩略图。
 */
export async function fetchFeed(opts: {
  groupId: string;
  cursor?: string | null;
  limit?: number;
  userId: string;
}): Promise<{ data: Activity[]; next_cursor: string | null }> {
  const supabase = await createServerClient();
  const limit = opts.limit ?? 20;

  const { data, error } = await supabase.rpc("get_group_feed", {
    p_group_id: opts.groupId,
    p_cursor: opts.cursor ?? null,
    p_limit: limit,
    p_user_id: opts.userId,
  });

  if (error) {
    throw new Error(`获取 feed 失败: ${error.message}`);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const activities = rows.map(mapFeedRow);

  // 批量获取照片（每条活动最多 9 张用于网格展示）
  if (activities.length > 0) {
    const ids = activities.map((a) => a.id);
    const { data: photos, error: photoErr } = await supabase
      .from("activity_photos")
      .select("id, activity_id, uploaded_by, url, caption, created_at")
      .in("activity_id", ids)
      .order("created_at", { ascending: true });

    if (photoErr) {
      throw new Error(`获取照片失败: ${photoErr.message}`);
    }

    const byActivity = new Map<string, ActivityPhoto[]>();
    for (const p of (photos ?? []) as ActivityPhoto[]) {
      const list = byActivity.get(p.activity_id) ?? [];
      list.push(p);
      byActivity.set(p.activity_id, list);
    }
    for (const a of activities) {
      const all = byActivity.get(a.id) ?? [];
      a.photos = all.slice(0, 9);
    }
  }

  const next_cursor =
    activities.length === limit && activities.length > 0
      ? activities[activities.length - 1].created_at
      : null;

  return { data: activities, next_cursor };
}

/**
 * 获取单个活动详情（含全部照片 + 一级评论）。
 */
export async function fetchActivityDetail(opts: {
  activityId: string;
  userId: string;
}): Promise<Activity | null> {
  const supabase = await createServerClient();

  const { data: activity, error } = await supabase
    .from("activities")
    .select(
      `id, type, content, external_link, created_at, group_id, repost_of_id, repost_comment,
       author:profiles!activities_author_id_fkey(id, nickname, avatar_url)`
    )
    .eq("id", opts.activityId)
    .single();

  if (error || !activity) return null;

  const a = activity as Record<string, unknown>;

  // 照片
  const { data: photos } = await supabase
    .from("activity_photos")
    .select(
      "id, activity_id, uploaded_by, url, caption, created_at, uploader:profiles!activity_photos_uploaded_by_fkey(id, nickname, avatar_url)"
    )
    .eq("activity_id", opts.activityId)
    .order("created_at", { ascending: true });

  // 一级评论 + 作者
  const { data: comments } = await supabase
    .from("comments")
    .select(
      "id, activity_id, author_id, content, parent_id, created_at, author:profiles!comments_author_id_fkey(id, nickname, avatar_url)"
    )
    .eq("activity_id", opts.activityId)
    .order("created_at", { ascending: true });

  // 计数
  const { count: photoCount } = await supabase
    .from("activity_photos")
    .select("id", { count: "exact", head: true })
    .eq("activity_id", opts.activityId);

  const { count: commentCount } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("activity_id", opts.activityId);

  const { count: likeCount } = await supabase
    .from("activity_likes")
    .select("id", { count: "exact", head: true })
    .eq("activity_id", opts.activityId);

  const { data: myLike } = await supabase
    .from("activity_likes")
    .select("id")
    .eq("activity_id", opts.activityId)
    .eq("user_id", opts.userId)
    .maybeSingle();

  // 转发源
  let repostOf: Activity["repost_of"] = null;
  if (a.repost_of_id) {
    const { data: ro } = await supabase
      .from("activities")
      .select(
        `id, type, content, external_link, created_at,
         author:profiles!activities_author_id_fkey(id, nickname, avatar_url)`
      )
      .eq("id", a.repost_of_id as string)
      .maybeSingle();
    if (ro) {
      const r = ro as Record<string, unknown>;
      repostOf = {
        id: r.id as string,
        type: r.type as Activity["type"],
        content: (r.content as string) ?? null,
        external_link: parseExternalLink(r.external_link),
        created_at: r.created_at as string,
        author: r.author as Activity["author"],
      };
    }
  }

  const commentList = (comments ?? []) as unknown as Comment[];
  // 组装楼中楼
  const topComments = commentList.filter((c) => !c.parent_id);
  for (const c of topComments) {
    c.replies = commentList.filter((r) => r.parent_id === c.id);
  }

  return {
    id: a.id as string,
    type: a.type as Activity["type"],
    content: (a.content as string) ?? null,
    external_link: parseExternalLink(a.external_link),
    created_at: a.created_at as string,
    author: a.author as Activity["author"],
    photos: ((photos ?? []) as unknown as ActivityPhoto[]).map((p) => ({
      ...p,
      uploader: (p as unknown as { uploader: ActivityPhoto["uploader"] })
        .uploader,
    })),
    photo_count: photoCount ?? 0,
    comment_count: commentCount ?? 0,
    like_count: likeCount ?? 0,
    is_liked: Boolean(myLike),
    repost_of: repostOf,
    repost_comment: (a.repost_comment as string) ?? null,
    group_id: a.group_id as string,
  };
}
