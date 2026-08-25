import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage, isUuid } from "@/lib/utils";
import { matchPoi } from "@/lib/poi/matcher";
import { isPoiProviderConfigured } from "@/lib/poi/providers";
import type { FavoritePlace } from "@/types";

export const dynamic = "force-dynamic";
// 高德 POI 单条匹配通常 <5s，留足余量防止极端场景超时
export const maxDuration = 30;

/** POI 补齐结果（仅非空字段写回；高德无 store_url，故默认 null） */
interface EnrichedInfo {
  coverImageUrl: string | null;
  storeUrl: null;
  phone: string | null;
  address: string | null;
  category: string | null;
  rating: number | null;
  price: string | null;
}

/** POI 人均数字（元）→ 统一字符串格式 "¥X/人"（与网页抓取一致） */
function formatPrice(price: number): string {
  const n = Number.isInteger(price) ? price : Math.round(price);
  return `¥${n}/人`;
}

/**
 * POST /api/favorite-places/enrich
 * 收藏夹「联网补齐」默认通道：通过店铺名跑高德 POI 匹配，只填空字段。
 * 纯高德、不消耗 AI 配额、不写 store_url。
 *
 * 请求体: { placeId: string, force?: boolean }
 * 返回: { data: FavoritePlace, enriched: EnrichedInfo, updatedFields?: string[], skipped?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const configured = isPoiProviderConfigured();
    if (!configured.amap && !configured.baidu) {
      return jsonResponse(
        { error: "未配置地图检索密钥，无法联网补齐" },
        { status: 503 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      placeId?: string;
      force?: boolean;
    };
    const placeId =
      typeof body.placeId === "string" ? body.placeId.trim() : "";
    if (!placeId || !isUuid(placeId)) {
      return jsonResponse({ error: "placeId 不合法" }, { status: 400 });
    }
    const force = body.force === true;

    const supabase = await createServerClient();
    const { data: place, error: selectErr } = await supabase
      .from("favorite_places")
      .select(
        "id, user_id, title, address, phone, signature_dishes, platform, summary, city, category, rating, price, cover_image_url"
      )
      .eq("id", placeId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (selectErr) {
      return jsonResponse(
        { error: safeErrorMessage(selectErr, "查询店铺失败") },
        { status: 500 }
      );
    }
    if (!place) {
      return jsonResponse({ error: "店铺不存在或无权访问" }, { status: 404 });
    }

    // 已完整且非强制刷新 → 跳过（高德能补的字段：电话/地址/品类/评分/人均/封面）
    const isComplete =
      place.phone && place.address && place.category && place.rating != null &&
      place.price && place.cover_image_url;
    if (!force && isComplete) {
      return jsonResponse({
        data: place as FavoritePlace,
        enriched: {
          coverImageUrl: place.cover_image_url,
          storeUrl: null,
          phone: place.phone,
          address: place.address,
          category: place.category,
          rating: place.rating,
          price: place.price,
        },
        skipped: true,
      });
    }

    const title = String(place.title ?? "").trim();
    if (!title) {
      return jsonResponse({ error: "店铺名称为空，无法补齐" }, { status: 400 });
    }

    const result = await matchPoi({
      name: title,
      city: place.city ?? undefined,
      knownPhone: place.phone,
      knownCategory: place.category,
    });

    if (!result.matched || !result.candidate) {
      // 高置信匹配不到 → 视为未搜索到可补齐信息
      return jsonResponse({
        data: place as FavoritePlace,
        enriched: {
          coverImageUrl: null,
          storeUrl: null,
          phone: null,
          address: null,
          category: null,
          rating: null,
          price: null,
        },
        updatedFields: [],
      });
    }

    const cand = result.candidate;
    const updates: Record<string, string | number | null> = {};
    if (!place.phone && cand.phone) updates.phone = cand.phone;
    if (!place.address && cand.address) updates.address = cand.address;
    if (!place.category && cand.category) updates.category = cand.category;
    if (place.rating == null && cand.rating != null) {
      updates.rating = cand.rating;
    }
    if (!place.price && cand.price != null) {
      updates.price = formatPrice(cand.price);
    }
    // 封面图：仅当缺时用高德 POI 返回的真实可访问照片 URL 补全
    if (!place.cover_image_url && cand.photos && cand.photos.length > 0) {
      updates.cover_image_url = cand.photos[0];
    }

    let updated: FavoritePlace = place as FavoritePlace;
    if (Object.keys(updates).length > 0) {
      const { data: updatedRow, error: updateErr } = await supabase
        .from("favorite_places")
        .update(updates)
        .eq("id", placeId)
        .eq("user_id", user.id)
        .select(
          "id, user_id, title, address, phone, signature_dishes, platform, summary, source_screenshot_url, created_at, category, rating, price, cover_image_url, store_url"
        )
        .maybeSingle();
      if (updateErr) {
        return jsonResponse(
          {
            error: `保存补齐信息失败 [${updateErr.code ?? "?"}] ${updateErr.message ?? ""}`.trim(),
          },
          { status: 500 }
        );
      }
      if (updatedRow) updated = updatedRow as FavoritePlace;
    }

    return jsonResponse({
      data: updated,
      enriched: {
        coverImageUrl: updates.cover_image_url ?? place.cover_image_url ?? null,
        storeUrl: null,
        phone: updates.phone ?? place.phone ?? null,
        address: updates.address ?? place.address ?? null,
        category: updates.category ?? place.category ?? null,
        rating:
          updates.rating != null ? Number(updates.rating) : (place.rating ?? null),
        price: updates.price ?? place.price ?? null,
      },
      updatedFields: Object.keys(updates),
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return jsonResponse({ error: "未登录" }, { status: 401 });
    }
    // 透传高德接口错误，便于前端 Network 面板定位
    const errMsg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: `高德补齐失败: ${errMsg}` }, { status: 500 });
  }
}