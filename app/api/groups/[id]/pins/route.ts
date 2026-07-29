import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { parseExternalLink } from "@/lib/activities";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { Activity, ActivityPhoto, Comment } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/groups/[id]/pins — 获取圈子置顶活动列表
 * 返回 { data: Activity[] }（按 pinned_at 倒序），每条 Activity.is_pinned = true。
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验当前用户为圈子成员
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    // 主查询：activity_pins INNER JOIN activities + author，仅返回本圈子的置顶
    const { data: pinRows, error: pinErr } = await supabase
      .from("activity_pins")
      .select(
        `pinned_at,
         activity:activities!inner(
           id, type, content, external_link, created_at, group_id,
           repost_of_id, repost_comment,
           author:profiles!activities_author_id_fkey(id, nickname, avatar_url)
         )`
      )
      .eq("activity.group_id", id)
      .order("pinned_at", { ascending: false });

    if (pinErr) {
      return jsonResponse(
        { error: safeErrorMessage(pinErr, "获取置顶列表失败") },
        { status: 500 }
      );
    }

    // PostgREST 将多对一嵌套资源返回为单对象，但 TS 推断为数组；用 unknown 中转
    const rows = (pinRows ?? []) as unknown as Array<{
      pinned_at: string;
      activity: Record<string, unknown> | null;
    }>;

    // 过滤掉活动已被删除（外键级联保护，理论上不会出现 null）
    const validRows = rows.filter((r) => r.activity);
    const activities = validRows.map((r) => r.activity as Record<string, unknown>);

    if (activities.length === 0) {
      return jsonResponse({ data: [] });
    }

    const ids = activities.map((a) => a.id as string);

    // 并行批量查询：photos / comments / likes / my_like / my_favorite
    const [photosRes, commentsRes, likesRes, myLikesRes, myFavsRes] =
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
          .from("activity_favorites")
          .select("activity_id")
          .in("activity_id", ids)
          .eq("user_id", user.id),
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
    for (const ml of (myLikesRes.data ?? []) as { activity_id: string }[]) {
      myLikedActivities.add(ml.activity_id);
    }

    const favoritedActivities = new Set<string>();
    for (const f of (myFavsRes.data ?? []) as { activity_id: string }[]) {
      favoritedActivities.add(f.activity_id);
    }

    // 组装 Activity[]（repost_of 字段保持 null，详情页中拉取）
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
        is_favorited: favoritedActivities.has(activityId),
        is_pinned: true,
        repost_of: null,
        repost_comment: (a.repost_comment as string) ?? null,
        group_id: (a.group_id as string) ?? "",
      };
    });

    return jsonResponse({ data: result });
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
