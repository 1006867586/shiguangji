import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage, safeParseInt } from "@/lib/utils";
import type { AppNotification } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/notifications — 当前用户通知列表（cursor 分页，JOIN profiles 取 actor） */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const limit = safeParseInt(searchParams.get("limit"), 30, 100);
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    // 多取一条用于判断是否还有下一页
    let query = supabase
      .from("notifications")
      .select(
        "id, user_id, actor_id, type, activity_id, group_id, comment_id, data, read_at, created_at, actor:profiles!notifications_actor_id_fkey(id, nickname, avatar_url)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (unreadOnly) {
      query = query.is("read_at", null);
    }

    // cursor 为上一页最后一条的 created_at，按 created_at desc 继续向前翻页
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取通知失败") },
        { status: 500 }
      );
    }

    const rawRows = (data ?? []) as Array<{
      id: string;
      user_id: string;
      actor_id: string | null;
      type: AppNotification["type"];
      activity_id: string | null;
      group_id: string | null;
      comment_id: string | null;
      data: Record<string, unknown> | null;
      read_at: string | null;
      created_at: string;
      actor: Array<{ id: string; nickname: string; avatar_url: string | null }> | { id: string; nickname: string; avatar_url: string | null } | null;
    }>;

    const rows: AppNotification[] = rawRows.map((r) => {
      const actorArr = Array.isArray(r.actor) ? r.actor : r.actor ? [r.actor] : [];
      return {
        ...r,
        actor: actorArr[0] ?? null,
      };
    });
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    const next_cursor =
      hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null;

    return jsonResponse({ data: rows, next_cursor });
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
