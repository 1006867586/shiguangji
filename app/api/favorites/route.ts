import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { parseExternalLink } from "@/lib/activities";
import { jsonResponse, safeParseInt, safeErrorMessage } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { Activity, ActivityPhoto, Comment } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/favorites?cursor=<iso>&limit=20
 * 获取当前用户收藏的活动列表，按 favorite.created_at 倒序分页。
 * 返回完整 Activity 对象（含 author / photos / counts / is_liked / is_pinned）。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const limit = safeParseInt(
      searchParams.get("limit"),
      DEFAULT_PAGE_SIZE,
      50
    );

    // 主查询：activity_favorites JOIN activities + author + repost_of
    let query = supabase
      .from("activity_favorites")
      .select(
        `created_at,
         activity:activities(
           id, type, content, external_link, created_at, group_id,
           repost_of_id, repost_comment,
           author:profiles!activities_author_id_fkey(id, nickname, avatar_url)
         )`
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data: favRows, error: favErr } = await query;

    if (favErr) {
      return jsonResponse(
        { error: safeErrorMessage(favErr, "获取收藏失败") },
        { status: 500 }
      );
    }

    // PostgREST 将多对一嵌套资源返回为单对象，但 TS 推断为数组；用 unknown 中转
    const rows = (favRows ?? []) as unknown as Array<{
      created_at: string;
      activity: Record<string, unknown> | null;
    }>;

    // 截断 limit+1 用于判断 hasMore
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    // 过滤掉活动已被删除（外键 set null / 级联保护）
    const validRows = pageRows.filter((r) => r.activity);
    const activities = validRows.map((r) => r.activity as Record<string, unknown>);

    const next_cursor =
      hasMore && validRows.length > 0
        ? validRows[validRows.length - 1].created_at
        : null;

    if (activities.length === 0) {
      return jsonResponse({ data: [], next_cursor: null });
    }

    const ids = activities.map((a) => a.id as string);

    // 并行批量查询：photos / comments / likes / my_like / pins
    const [photosRes, commentsRes, likesRes, myLikesRes, pinsRes] =
      await Promise.all([
        supabase
          .from("activity_photos")
          .select(
            "id, activity_id, uploaded_by, url, caption, created_at, kind"
          )
          .in("activity_id", ids)
          .order("created_at", { ascending: true }),
        supabase
          .from("comments")
          .select("id, activity_id")
          .in("activity_id", ids),
        supabase
          .from("activity_likes")
          .select("id, activity_id, user_id")
          .in("activity_id", ids),
        supabase
          .from("activity_likes")
          .select("activity_id")
          .in("activity_id", ids)
          .eq("user_id", user.id),
        supabase
          .from("activity_pins")
          .select("activity_id")
          .in("activity_id", ids),
      ]);

    // 按 activity_id 分组
    const photosByActivity = new Map<string, ActivityPhoto[]>();
    for (const p of (photosRes.data ?? []) as ActivityPhoto[]) {
      const list = photosByActivity.get(p.activity_id) ?? [];
      list.push(p);
      photosByActivity.set(p.activity_id, list);
    }

    const commentCountByActivity = new Map<string, number>();
    for (const c of (commentsRes.data ?? []) as Comment[]) {
      commentCountByActivity.set(
        c.activity_id,
        (commentCountByActivity.get(c.activity_id) ?? 0) + 1
      );
    }

    const likeCountByActivity = new Map<string, number>();
    const myLikedActivities = new Set<string>();
    for (const l of (likesRes.data ?? []) as {
      id: string;
      activity_id: string;
      user_id: string;
    }[]) {
      likeCountByActivity.set(
        l.activity_id,
        (likeCountByActivity.get(l.activity_id) ?? 0) + 1
      );
      if (l.user_id === user.id) myLikedActivities.add(l.activity_id);
    }

    // myLikesRes 是 user_id 过滤后的，直接将其 activity_id 加入集合
    for (const ml of (myLikesRes.data ?? []) as { activity_id: string }[]) {
      myLikedActivities.add(ml.activity_id);
    }

    const pinnedActivities = new Set<string>();
    for (const pin of (pinsRes.data ?? []) as { activity_id: string }[]) {
      pinnedActivities.add(pin.activity_id);
    }

    // 组装 Activity[]
    // 注：repost_of 字段在收藏列表中保持为 null，转发源信息在详情页中拉取
    const result: Activity[] = activities.map((a) => {
      const activityId = a.id as string;
      const allPhotos = photosByActivity.get(activityId) ?? [];

      return {
        id: activityId,
        type: a.type as Activity["type"],
        content: (a.content as string) ?? null,
        external_link: parseExternalLink(a.external_link),
        created_at: a.created_at as string,
        author: a.author as Activity["author"],
        photos: allPhotos.slice(0, 9),
        photo_count: allPhotos.length,
        comment_count: commentCountByActivity.get(activityId) ?? 0,
        like_count: likeCountByActivity.get(activityId) ?? 0,
        is_liked: myLikedActivities.has(activityId),
        is_favorited: true,
        is_pinned: pinnedActivities.has(activityId),
        repost_of: null,
        repost_comment: (a.repost_comment as string) ?? null,
        group_id: (a.group_id as string) ?? "",
      };
    });

    return jsonResponse({ data: result, next_cursor: next_cursor });
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
