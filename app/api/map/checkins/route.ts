import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import type { CreateCheckinBody, CreateCheckinResult } from "@/types";

export const dynamic = "force-dynamic";

/** 校验并归一化数值坐标 */
function parseCoord(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * POST /api/map/checkins
 * 打卡：body = { place: { name, address?, city?, district?, category?, lng, lat, source?, poi_id? }, activity_id?, note? }
 * 流程：若带 activity_id 先校验用户是该活动所属圈子成员；
 *       upsert place（按 source+poi_id 或 name+city+坐标去重）→ insert checkin。
 * 返回 { data: { checkin, place, place_created } }。
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json().catch(() => null)) as
      | CreateCheckinBody
      | null;
    if (!body?.place) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const lng = parseCoord(body.place.lng);
    const lat = parseCoord(body.place.lat);
    const name = (body.place.name ?? "").trim();
    if (!name || lng === null || lat === null) {
      return jsonResponse(
        { error: "地点名称与坐标不能为空" },
        { status: 400 }
      );
    }

    // 关联聚餐活动时，校验当前用户为该活动所属圈子成员
    const activityId = body.activity_id?.trim() || null;
    if (activityId) {
      const { data: activity, error: actErr } = await supabase
        .from("activities")
        .select("group_id")
        .eq("id", activityId)
        .maybeSingle();
      if (actErr) {
        return jsonResponse(
          { error: safeErrorMessage(actErr, "校验活动失败") },
          { status: 500 }
        );
      }
      if (!activity) {
        return jsonResponse({ error: "活动不存在" }, { status: 404 });
      }
      const { data: membership } = await supabase
        .from("group_members")
        .select("id")
        .eq("group_id", activity.group_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!membership) {
        return jsonResponse(
          { error: "仅圈子成员可在该聚餐活动下打卡" },
          { status: 403 }
        );
      }
    }

    const source = body.place.source ?? "manual";
    const poiId = body.place.poi_id?.trim() || null;

    // ---- upsert place：优先按来源 POI 去重，其次按 名称+城市+坐标 ----
    let place: Record<string, unknown> | null = null;

    if (source !== "manual" && poiId) {
      const { data } = await supabase
        .from("places")
        .select("*")
        .eq("source", source)
        .eq("poi_id", poiId)
        .maybeSingle();
      place = (data as Record<string, unknown> | null) ?? null;
    }
    if (!place) {
      const { data } = await supabase
        .from("places")
        .select("*")
        .eq("name", name)
        .eq("city", body.place.city ?? null)
        .eq("lng", lng)
        .eq("lat", lat)
        .maybeSingle();
      place = (data as Record<string, unknown> | null) ?? null;
    }

    let placeCreated = false;
    if (!place) {
      const insertPayload = {
        name,
        address: body.place.address?.trim() || null,
        city: body.place.city?.trim() || null,
        district: body.place.district?.trim() || null,
        category: body.place.category?.trim() || null,
        lng,
        lat,
        source,
        poi_id: poiId,
        created_by: user.id,
        status: "approved" as const,
        // 富文本字段（来自迁移 021，可选）
        rating: typeof body.place.rating === "number" ? body.place.rating : null,
        average_price: typeof body.place.average_price === "string" ? body.place.average_price.trim() || null : null,
        phone: typeof body.place.phone === "string" ? body.place.phone.trim() || null : null,
        business_hours: typeof body.place.business_hours === "string" ? body.place.business_hours.trim() || null : null,
        description: typeof body.place.description === "string" ? body.place.description.trim() || null : null,
        tags: Array.isArray(body.place.tags)
          ? body.place.tags.filter((s): s is string => typeof s === "string").filter(Boolean)
          : null,
      };
      const { data: inserted, error: insertErr } = await supabase
        .from("places")
        .insert(insertPayload)
        .select("*")
        .single();
      if (insertErr && insertErr.code !== "23505") {
        return jsonResponse(
          { error: safeErrorMessage(insertErr, "保存地点失败") },
          { status: 500 }
        );
      }
      if (inserted) {
        place = inserted as Record<string, unknown>;
        placeCreated = true;
      } else {
        // 唯一键冲突：并发写入，回查一次
        const { data: existing } = await supabase
          .from("places")
          .select("*")
          .eq("name", name)
          .eq("city", body.place.city ?? null)
          .eq("lng", lng)
          .eq("lat", lat)
          .maybeSingle();
        place = (existing as Record<string, unknown> | null) ?? null;
      }
    }

    if (!place) {
      return jsonResponse({ error: "保存地点失败" }, { status: 500 });
    }

    // ---- insert checkin ----
    const { data: checkin, error: checkinErr } = await supabase
      .from("checkins")
      .insert({
        user_id: user.id,
        place_id: place.id as string,
        activity_id: activityId,
        note: body.note?.trim() || null,
      })
      .select("*")
      .single();
    if (checkinErr) {
      return jsonResponse(
        { error: safeErrorMessage(checkinErr, "打卡失败") },
        { status: 500 }
      );
    }

    const result: CreateCheckinResult = {
      checkin: checkin as CreateCheckinResult["checkin"],
      place: {
        id: place.id as string,
        name: place.name as string,
        address: (place.address as string | null) ?? null,
        city: (place.city as string | null) ?? null,
        district: (place.district as string | null) ?? null,
        category: (place.category as string | null) ?? null,
        lng: Number(place.lng),
        lat: Number(place.lat),
        source: place.source as CreateCheckinResult["place"]["source"],
        poi_id: (place.poi_id as string | null) ?? null,
        status: place.status as CreateCheckinResult["place"]["status"],
        created_at: place.created_at as string,
      },
      place_created: placeCreated,
    };

    return jsonResponse({ data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "打卡失败") },
      { status: 500 }
    );
  }
}
