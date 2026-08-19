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
 * GET /api/map/places/nearby?lng=114.31&lat=30.59&radius=500&city=武汉市
 *
 * 返回指定经纬度附近 N 米内的打卡点（按距离升序）。
 *
 * 简化实现（M1）：用 Haversine 在 JS 中计算距离，先按 lng/lat 范围粗筛
 *   再精算。一期数据量小够用，数据量大后改 PostGIS GIST + ST_DWithin（M2）。
 *
 * 参数：
 *   - lng / lat：必填，WGS84/GCJ-02 都行（与 places.lng/lat 同系即可）
 *   - radius：可选，默认 500，单位米，上限 5000
 *   - city：可选，限定同一城市的店
 *   - category：可选
 *   - exclude_checked：可选，"true" 排除已打卡
 *   - limit：可选，默认 20，最大 50
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const sp = new URL(request.url).searchParams;
    const lng = parseFloat(sp.get("lng") ?? "");
    const lat = parseFloat(sp.get("lat") ?? "");
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return jsonResponse({ error: "lng/lat 不合法" }, { status: 400 });
    }
    const radius = Math.min(5000, Math.max(50, Number(sp.get("radius") ?? 500)));
    const city = sp.get("city");
    const category = sp.get("category");
    const excludeChecked = sp.get("exclude_checked") === "true";
    const limit = Math.min(50, Math.max(1, Number(sp.get("limit") ?? 20)));

    // 1° ≈ 111km，先按矩形粗筛减少传输
    const degLat = radius / 111_000;
    const degLng = radius / (111_000 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
    let query = supabase
      .from("places")
      .select(
        "id, name, address, city, district, category, lng, lat, source, poi_id, status, created_at"
      )
      .eq("status", "approved")
      .gte("lng", lng - degLng)
      .lte("lng", lng + degLng)
      .gte("lat", lat - degLat)
      .lte("lat", lat + degLat);
    if (city) query = query.eq("city", city);
    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "附近查询失败") },
        { status: 500 }
      );
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;

    // 精算 Haversine 距离 + 过滤 + 排序
    const withDistance = rows
      .map((r) => {
        const rLng = Number(r.lng);
        const rLat = Number(r.lat);
        return { r, distance: haversine(lng, lat, rLng, rLat) };
      })
      .filter((x) => x.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    const placeIds = withDistance.map((x) => x.r.id as string);
    const checkedSet = new Set<string>();
    if (placeIds.length > 0 && excludeChecked) {
      const { data: mine } = await supabase
        .from("checkins")
        .select("place_id")
        .eq("user_id", user.id)
        .in("place_id", placeIds);
      for (const row of mine ?? []) checkedSet.add(row.place_id as string);
    }

    const places: Array<MapPlace & { distance_m: number }> = withDistance
      .filter((x) => (excludeChecked ? !checkedSet.has(x.r.id as string) : true))
      .map(({ r, distance }) => ({
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
        i_checkin_id: null,
        distance_m: Math.round(distance),
      }));

    return jsonResponse({ data: places });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "附近查询失败") },
      { status: 500 }
    );
  }
}

/** Haversine 公式，返回米 */
function haversine(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371_000; // 地球半径（米）
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}