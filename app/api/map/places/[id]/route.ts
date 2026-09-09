import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { MapPlace } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const PLACE_SELECT =
  "id, name, address, city, district, category, lng, lat, source, poi_id, status, created_at, updated_at, rating, average_price, phone, business_hours, description, tags, cover_image_url";

/**
 * GET /api/map/places/[id] — 按 id 获取单个打卡点（分享链接 ?focus=<id> 定位用）。
 * 仅返回 approved 地点；附带当前用户是否已打卡（i_checked / i_checkin_id）。
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("places")
      .select(PLACE_SELECT)
      .eq("id", id)
      .eq("status", "approved")
      .maybeSingle();
    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取打卡点失败") },
        { status: 500 }
      );
    }
    if (!data) {
      return jsonResponse({ error: "打卡点不存在" }, { status: 404 });
    }

    // 当前用户是否已打卡（checkins 仅本人可见，走常规查询）
    let i_checkin_id: string | null = null;
    const { data: mine } = await supabase
      .from("checkins")
      .select("id")
      .eq("user_id", user.id)
      .eq("place_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mine) i_checkin_id = mine.id;

    const r = data as Record<string, unknown>;
    const place: MapPlace = {
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
      rating: r.rating != null ? Number(r.rating) : null,
      average_price: (r.average_price as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      business_hours: (r.business_hours as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      tags: (r.tags as string[] | null) ?? null,
      cover_image_url: (r.cover_image_url as string | null) ?? null,
      updated_at: (r.updated_at as string | null) ?? undefined,
      i_checked: i_checkin_id != null,
      i_checkin_id,
    };

    return jsonResponse({ data: place });
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