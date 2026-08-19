import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeParseInt, safeErrorMessage } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { Checkin, MapPlace } from "@/types";

export const dynamic = "force-dynamic";

/** 归一化 numeric → number */
function toNumber(value: unknown): number {
  return Number(value);
}

/**
 * GET /api/map/checkins/me?cursor=<iso>&limit=20
 * 我的足迹：按 created_at 倒序游标分页，附带地点摘要与关联活动摘要。
 * 返回 { data: Checkin[], next_cursor }。
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

    let query = supabase
      .from("checkins")
      .select(
        `id, user_id, place_id, activity_id, note, checked_at, created_at,
         place:places(id, name, address, city, district, category, lng, lat, source, poi_id, status, created_at),
         activity:activities(id, group_id, content)`
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取打卡记录失败") },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const checkins: Checkin[] = pageRows.map((r) => {
      const placeRaw = (r.place ?? null) as Record<string, unknown> | null;
      return {
        id: r.id as string,
        user_id: r.user_id as string,
        place_id: r.place_id as string,
        activity_id: (r.activity_id as string | null) ?? null,
        note: (r.note as string | null) ?? null,
        checked_at: r.checked_at as string,
        created_at: r.created_at as string,
        place: placeRaw
          ? {
              id: placeRaw.id as string,
              name: placeRaw.name as string,
              address: (placeRaw.address as string | null) ?? null,
              city: (placeRaw.city as string | null) ?? null,
              district: (placeRaw.district as string | null) ?? null,
              category: (placeRaw.category as string | null) ?? null,
              lng: toNumber(placeRaw.lng),
              lat: toNumber(placeRaw.lat),
              source: placeRaw.source as MapPlace["source"],
              poi_id: (placeRaw.poi_id as string | null) ?? null,
              status: (placeRaw.status ?? "approved") as MapPlace["status"],
              created_at: placeRaw.created_at as string,
            }
          : undefined,
        activity: (r.activity ?? null) as Checkin["activity"],
      };
    });

    const next_cursor =
      hasMore && pageRows.length > 0
        ? (pageRows[pageRows.length - 1].created_at as string)
        : null;

    return jsonResponse({ data: checkins, next_cursor });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "获取打卡记录失败") },
      { status: 500 }
    );
  }
}
