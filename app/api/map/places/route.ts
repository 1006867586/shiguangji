import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import type { MapPlace } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/map/places?city=上海&category=餐厅
 * 获取打卡地点列表（仅 approved），附当前用户是否已打过卡（i_checked）。
 * 一期按城市全量返回，数据量大后改为 bbox+zoom 后端网格聚合（M2）。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");
    const category = searchParams.get("category");

    let query = supabase
      .from("places")
      .select(
        "id, name, address, city, district, category, lng, lat, source, poi_id, status, created_at"
      )
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (city) query = query.eq("city", city);
    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取打卡点失败") },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const placeIds = rows.map((r) => r.id as string);

    // 当前用户已打卡的地点集合（checkins 仅本人可见，走常规查询即可）
    const checkedSet = new Set<string>();
    const checkinIdByPlace = new Map<string, string>();
    if (placeIds.length > 0) {
      const { data: mine } = await supabase
        .from("checkins")
        .select("id, place_id")
        .eq("user_id", user.id)
        .in("place_id", placeIds);
      for (const row of mine ?? []) {
        const pid = row.place_id as string;
        if (!checkinIdByPlace.has(pid)) {
          checkinIdByPlace.set(pid, row.id as string);
        }
        checkedSet.add(pid);
      }
    }

    const places: MapPlace[] = rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      address: (r.address as string | null) ?? null,
      city: (r.city as string | null) ?? null,
      district: (r.district as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      lng: Number(r.lng),
      lat: Number(r.lat),
      source: r.source as MapPlace["source"],
      poi_id: (r.poi_id as string | null) ?? null,
      status: r.status as MapPlace["status"],
      created_at: r.created_at as string,
      i_checked: checkedSet.has(r.id as string),
      i_checkin_id: checkinIdByPlace.get(r.id as string) ?? null,
    }));

    return jsonResponse({ data: places });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "获取打卡点失败") },
      { status: 500 }
    );
  }
}
