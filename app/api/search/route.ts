import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { parseExternalLink } from "@/lib/activities";
import {
  jsonResponse,
  isUuid,
  safeParseInt,
  safeErrorMessage,
} from "@/lib/utils";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { Activity, ActivityPhoto, Comment } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=<keyword>&groupId?=&tag?=&cursor?=&limit?
 * 搜索活动，在 activities.content 和 external_link->>title 上做 ILIKE 模糊匹配。
 * - 若提供 groupId，必须是该团体成员
 * - 若无 groupId，搜索用户加入的所有团体
 * - 返回完整 Activity 对象数组 + next_cursor
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const rawQ = searchParams.get("q") ?? "";
    const q = rawQ.trim();
    const groupId = searchParams.get("groupId");
    const tag = searchParams.get("tag")?.trim() ?? "";
    const cursor = searchParams.get("cursor");
    const limit = safeParseInt(searchParams.get("limit"), DEFAULT_PAGE_SIZE, 50);

    if (!q) {
      return jsonResponse({ data: [], next_cursor: null });
    }

    // 解析可搜索的团体范围
    let groupIds: string[];
    if (groupId) {
      if (!isUuid(groupId)) {
        return jsonResponse({ error: "参数错误" }, { status: 400 });
      }
      // 校验是该团体成员
      const { data: membership } = await supabase
        .from("group_members")
        .select("id")
        .eq("group_id", groupId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!membership) {
        return jsonResponse({ error: "无权搜索该团体" }, { status: 403 });
      }
      groupIds = [groupId];
    } else {
      // 搜索用户加入的所有团体
      const { data: memberships, error: mbErr } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);

      if (mbErr) {
        return jsonResponse(
          { error: safeErrorMessage(mbErr, "获取团体列表失败") },
          { status: 500 }
        );
      }
      groupIds = (memberships ?? []).map((m) => m.group_id as string);
      if (groupIds.length === 0) {
        return jsonResponse({ data: [], next_cursor: null });
      }
    }

    // 若指定 tag，先解析出符合的 activity_id 列表
    let taggedActivityIds: string[] | null = null;
    if (tag) {
      const { data: tagRows, error: tagErr } = await supabase
        .from("tags")
        .select("id")
        .in("group_id", groupIds)
        .eq("name", tag);

      if (tagErr) {
        return jsonResponse(
          { error: safeErrorMessage(tagErr, "查询标签失败") },
          { status: 500 }
        );
      }
      const tagIds = (tagRows ?? []).map((t) => t.id as string);
      if (tagIds.length === 0) {
        return jsonResponse({ data: [], next_cursor: null });
      }

      const { data: atRows, error: atErr } = await supabase
        .from("activity_tags")
        .select("activity_id")
        .in("tag_id", tagIds);

      if (atErr) {
        return jsonResponse(
          { error: safeErrorMessage(atErr, "查询标签关联失败") },
          { status: 500 }
        );
      }
      taggedActivityIds = (atRows ?? []).map((r) => r.activity_id as string);
      if (taggedActivityIds.length === 0) {
        return jsonResponse({ data: [], next_cursor: null });
      }
    }

    // 转义 LIKE 模式中的特殊字符
    const escapedQ = q.replace(/[%_\\]/g, "\\$&");
    const pattern = `%${escapedQ}%`;

    // 主查询：activities JOIN author；ILIKE 匹配 content 与 external_link->>title
    let query = supabase
      .from("activities")
      .select(
        `id, type, content, external_link, created_at, group_id,
         repost_of_id, repost_comment,
         author:profiles!activities_author_id_fkey(id, nickname, avatar_url)`
      )
      .in("group_id", groupIds)
      .or(
        `content.ilike.${pattern},external_link->>title.ilike.${pattern}`
      )
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (taggedActivityIds) {
      query = query.in("id", taggedActivityIds);
    }

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data: rows, error: searchErr } = await query;

    if (searchErr) {
      return jsonResponse(
        { error: safeErrorMessage(searchErr, "搜索失败") },
        { status: 500 }
      );
    }

    const activities = (rows ?? []) as Record<string, unknown>[];

    // 截断 limit+1 用于判断 hasMore
    const hasMore = activities.length > limit;
    const pageRows = hasMore ? activities.slice(0, limit) : activities;

    if (pageRows.length === 0) {
      return jsonResponse({ data: [], next_cursor: null });
    }

    const ids = pageRows.map((a) => a.id as string);

    // 并行批量查询：photos / comments / likes / my_like / repost_of
    const [photosRes, commentsRes, likesRes, myLikesRes, repostIdsRes] =
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
        // 收集需要拉取的 repost_of_id
        Promise.resolve(
          pageRows
            .map((a) => a.repost_of_id as string | null)
            .filter((x): x is string => Boolean(x))
        ),
      ]);

    const repostIds = repostIdsRes;
    const repostOfMap = new Map<string, Record<string, unknown>>();
    if (repostIds.length > 0) {
      const { data: repostRows } = await supabase
        .from("activities")
        .select(
          `id, type, content, external_link, created_at,
           author:profiles!activities_author_id_fkey(id, nickname, avatar_url)`
        )
        .in("id", repostIds);
      for (const r of (repostRows ?? []) as Record<string, unknown>[]) {
        repostOfMap.set(r.id as string, r);
      }
    }

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

    // 组装 Activity[]
    const result: Activity[] = pageRows.map((a) => {
      const activityId = a.id as string;
      const allPhotos = photosByActivity.get(activityId) ?? [];
      const repostOfId = (a.repost_of_id as string | null) ?? null;
      const repostRow = repostOfId ? repostOfMap.get(repostOfId) : null;
      const repostOf = repostRow
        ? {
            id: repostRow.id as string,
            type: repostRow.type as Activity["type"],
            content: (repostRow.content as string) ?? null,
            external_link: parseExternalLink(repostRow.external_link),
            created_at: repostRow.created_at as string,
            author: repostRow.author as Activity["author"],
          }
        : null;

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
        repost_of: repostOf,
        repost_comment: (a.repost_comment as string) ?? null,
        group_id: (a.group_id as string) ?? "",
      };
    });

    const next_cursor =
      hasMore && result.length > 0 ? result[result.length - 1].created_at : null;

    return jsonResponse({ data: result, next_cursor });
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
