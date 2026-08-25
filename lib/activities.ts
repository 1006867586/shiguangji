import { createServerClient } from "./supabase/server";
import type {
  Achievement,
  Activity,
  ActivityPhoto,
  Comment,
  ExternalLink,
  RsvpStatus,
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
    phone: (r.phone as string) ?? null,
    price: (r.price as string) ?? null,
    category: (r.category as string) ?? null,
    location: parseLinkLocation(r.location),
  };
}

/** jsonb 中的经纬度（GCJ-02）：兼容 { lng, lat } 与 { longitude, latitude } 两种命名 */
function parseLinkLocation(raw: unknown): ExternalLink["location"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lng =
    typeof r.lng === "number"
      ? r.lng
      : typeof r.longitude === "number"
        ? r.longitude
        : null;
  const lat =
    typeof r.lat === "number"
      ? r.lat
      : typeof r.latitude === "number"
        ? r.latitude
        : null;
  if (lng === null || lat === null) return null;
  return { lng, lat };
}

/** 将 feed RPC 返回的 repost_of jsonb 规范化为 RepostOf（external_link 同样走 parseExternalLink） */
function parseRepostOf(raw: unknown): Activity["repost_of"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  return {
    id: r.id,
    type: (r.type as Activity["type"]) ?? "original",
    content: (r.content as string) ?? null,
    external_link: parseExternalLink(r.external_link),
    created_at: (r.created_at as string) ?? "",
    author: r.author as Activity["author"],
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
    repost_of: parseRepostOf(row.repost_of),
    repost_comment: (row.repost_comment as string) ?? null,
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
  keyword?: string | null;
}): Promise<{ data: Activity[]; next_cursor: string | null }> {
  const supabase = await createServerClient();
  const limit = opts.limit ?? 20;

  const { data, error } = await supabase.rpc("get_group_feed", {
    p_group_id: opts.groupId,
    p_cursor: opts.cursor ?? null,
    p_limit: limit,
    p_user_id: opts.userId,
    p_keyword: opts.keyword?.trim() ? opts.keyword.trim() : null,
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
      .select("id, activity_id, uploaded_by, url, caption, kind, paired_video_url, created_at")
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

  // 批量补充 RSVP：每个活动统计 3 种状态人数 + 当前用户状态，
  // 使列表页可直接展示/切换参加状态而不依赖详情页
  const rsvpActivityIds = activities.map((a) => a.id);
  if (rsvpActivityIds.length > 0) {
    const { data: rsvpRows, error: rsvpErr } = await supabase
      .from("activity_rsvp")
      .select("activity_id, user_id, status")
      .in("activity_id", rsvpActivityIds);

    if (rsvpErr) {
      throw new Error(`获取 RSVP 失败: ${rsvpErr.message}`);
    }

    const byActivity = new Map<
      string,
      { attending: number; maybe: number; declined: number; myStatus: RsvpStatus | null }
    >();
    for (const ap of (rsvpRows ?? []) as {
      activity_id: string;
      user_id: string;
      status: RsvpStatus;
    }[]) {
      const entry = byActivity.get(ap.activity_id) ?? {
        attending: 0,
        maybe: 0,
        declined: 0,
        myStatus: null,
      };
      if (ap.status === "attending") entry.attending += 1;
      else if (ap.status === "maybe") entry.maybe += 1;
      else if (ap.status === "declined") entry.declined += 1;
      if (ap.user_id === opts.userId) entry.myStatus = ap.status;
      byActivity.set(ap.activity_id, entry);
    }

    for (const a of activities) {
      const e = byActivity.get(a.id);
      let attending = 0;
      let maybe = 0;
      let declined = 0;
      let myStatus: RsvpStatus | null = null;
      if (e) {
        attending = e.attending;
        maybe = e.maybe;
        declined = e.declined;
        myStatus = e.myStatus;
      }
      a.rsvp_summary = { attending, maybe, declined };
      a.rsvp = myStatus ? { status: myStatus } : null;
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

  // 并行发起无依赖的查询（photos/comments/photoCount/commentCount/likeCount/myLike/repostOf/rsvp）
  const [
    photosRes,
    commentsRes,
    photoCountRes,
    commentCountRes,
    likeCountRes,
    myLikeRes,
    repostOfRes,
    rsvpRes,
  ] = await Promise.all([
    supabase
      .from("activity_photos")
      .select(
        "id, activity_id, uploaded_by, url, caption, kind, paired_video_url, created_at, uploader:profiles!activity_photos_uploaded_by_fkey(id, nickname, avatar_url)"
      )
      .eq("activity_id", opts.activityId)
      .order("created_at", { ascending: true }),
    supabase
      .from("comments")
      .select(
        "id, activity_id, author_id, content, parent_id, created_at, author:profiles!comments_author_id_fkey(id, nickname, avatar_url)"
      )
      .eq("activity_id", opts.activityId)
      .order("created_at", { ascending: true }),
    supabase
      .from("activity_photos")
      .select("id", { count: "exact", head: true })
      .eq("activity_id", opts.activityId),
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("activity_id", opts.activityId),
    supabase
      .from("activity_likes")
      .select("id", { count: "exact", head: true })
      .eq("activity_id", opts.activityId),
    supabase
      .from("activity_likes")
      .select("id")
      .eq("activity_id", opts.activityId)
      .eq("user_id", opts.userId)
      .maybeSingle(),
    a.repost_of_id
      ? supabase
          .from("activities")
          .select(
            `id, type, content, external_link, created_at,
             author:profiles!activities_author_id_fkey(id, nickname, avatar_url)`
          )
          .eq("id", a.repost_of_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("activity_rsvp")
      .select("user_id, status")
      .eq("activity_id", opts.activityId),
  ]);

  const photos = photosRes.data;
  const comments = commentsRes.data;
  const photoCount = photoCountRes.count;
  const commentCount = commentCountRes.count;
  const likeCount = likeCountRes.count;
  const myLike = myLikeRes.data;

  // RSVP 汇总：统计 3 种状态人数 + 当前用户状态，与 fetchFeed 保持一致，
  // 使详情页复用 FeedCard 的紧凑「参加」按钮在刷新后仍能正确显示
  const rsvpRows = (rsvpRes.data ?? []) as {
    user_id: string;
    status: RsvpStatus;
  }[];
  let attending = 0;
  let maybe = 0;
  let declined = 0;
  let myRsvpStatus: RsvpStatus | null = null;
  for (const r of rsvpRows) {
    if (r.status === "attending") attending += 1;
    else if (r.status === "maybe") maybe += 1;
    else if (r.status === "declined") declined += 1;
    if (r.user_id === opts.userId) myRsvpStatus = r.status;
  }

  // 转发源
  let repostOf: Activity["repost_of"] = null;
  if (repostOfRes.data) {
    const r = repostOfRes.data as Record<string, unknown>;
    repostOf = {
      id: r.id as string,
      type: r.type as Activity["type"],
      content: (r.content as string) ?? null,
      external_link: parseExternalLink(r.external_link),
      created_at: r.created_at as string,
      author: r.author as Activity["author"],
    };
  }

  // 批量拉取作者 / 转发作者已解锁成就（security definer 函数，绕过仅本人可读 RLS）
  const authorId = (a.author as { id?: string } | null)?.id;
  const repostAuthorId = repostOf?.author?.id;
  const achUserIds = [authorId, repostAuthorId].filter(
    (x): x is string => Boolean(x)
  );
  const achMap = new Map<string, Achievement[]>();
  if (achUserIds.length > 0) {
    const { data: achRows } = await supabase.rpc(
      "get_unlocked_achievements_for_users",
      { p_user_ids: achUserIds }
    );
    for (const row of (achRows ?? []) as Array<{
      user_id: string;
      achievements: Achievement[];
    }>) {
      achMap.set(row.user_id, row.achievements ?? []);
    }
  }
  const authorObj = a.author as Activity["author"] & {
    achievements?: Achievement[];
  };
  if (authorObj?.id) {
    authorObj.achievements = achMap.get(authorObj.id) ?? [];
  }
  if (repostOf?.author?.id) {
    (repostOf.author as Activity["author"] & {
      achievements?: Achievement[];
    }).achievements = achMap.get(repostOf.author.id) ?? [];
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
    rsvp_summary: { attending, maybe, declined },
    rsvp: myRsvpStatus ? { status: myRsvpStatus } : null,
  };
}
