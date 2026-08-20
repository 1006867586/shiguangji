import { NextRequest } from "next/server";
import {
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import {
  searchAmapPois,
  searchBaiduPois,
  isPoiProviderConfigured,
  PoiProviderError,
} from "@/lib/poi/providers";
import { bd09ToGcj02 } from "@/lib/poi/coords";
import type { PoiCandidate } from "@/lib/poi/types";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * GET /api/map/places/search?keyword=SLAB TOWN&city=上海
 * 打卡地点搜索联想：高德/百度 POI 检索合并，坐标统一为 GCJ-02。
 * 返回 { data: PoiCandidate[] }（每条 location.coordType 均为 gcj02）。
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();

    const configured = isPoiProviderConfigured();
    if (!configured.amap && !configured.baidu) {
      return jsonResponse(
        { error: "地图 POI 检索未启用：需配置 AMAP_KEY 或 BAIDU_MAP_AK" },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const keyword = (searchParams.get("keyword") ?? "").trim();
    const city = (searchParams.get("city") ?? "").trim() || null;

    if (!keyword || keyword.length > 100) {
      return jsonResponse({ error: "keyword 不合法" }, { status: 400 });
    }

    const options = { keyword, city, pageSize: 10 };

    const [amapRes, baiduRes] = await Promise.allSettled([
      configured.amap ? searchAmapPois(options) : Promise.resolve([]),
      configured.baidu ? searchBaiduPois(options) : Promise.resolve([]),
    ]);

    const candidates: PoiCandidate[] = [];
    if (amapRes.status === "fulfilled") {
      candidates.push(...amapRes.value);
    }
    if (baiduRes.status === "fulfilled") {
      // 百度 BD-09 → GCJ-02，统一坐标系
      candidates.push(
        ...baiduRes.value.map((c) => ({
          ...c,
          location: {
            lng: bd09ToGcj02(c.location.lng, c.location.lat).lng,
            lat: bd09ToGcj02(c.location.lng, c.location.lat).lat,
            coordType: "gcj02" as const,
          },
        }))
      );
    }

    if (candidates.length === 0) {
      // 两个平台都失败时给出可读错误
      if (amapRes.status === "rejected" && baiduRes.status === "rejected") {
        const err =
          amapRes.reason instanceof PoiProviderError
            ? amapRes.reason
            : new Error("地图接口调用失败");
        return jsonResponse({ error: err.message }, { status: 502 });
      }
    }

    // 简单去重：同名同坐标只保留一条（优先高德）
    const seen = new Set<string>();
    const unique = candidates.filter((c) => {
      const key = `${c.name}|${c.location.lng.toFixed(5)}|${c.location.lat.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return jsonResponse({ data: unique.slice(0, 10) });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return jsonResponse({ error: "未登录" }, { status: 401 });
    }
    if (e instanceof PoiProviderError) {
      return jsonResponse({ error: e.message }, { status: 502 });
    }
    return jsonResponse(
      { error: safeErrorMessage(e, "地点搜索失败") },
      { status: 500 }
    );
  }
}
