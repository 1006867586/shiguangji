import { NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import { matchPoi } from "@/lib/poi/matcher";
import {
  isPoiProviderConfigured,
  PoiProviderError,
} from "@/lib/poi/providers";

export const dynamic = "force-dynamic";
// 三级降级最坏 3 轮串行 × 单请求 8s 超时（每轮双平台并行）
export const maxDuration = 30;

/**
 * POST /api/places/match-poi
 * 通过高德/百度地图官方 POI 检索接口，对店铺名做多级降级匹配，
 * 补齐电话、地址、坐标、评分、品类等信息。
 *
 * 请求体: { name: string, city?: string, phone?: string, category?: string }
 * 返回: { data: MatchResult }
 *   - tier=high/medium: matched=true，可自动写入
 *   - tier=low: matched=false 但保留 candidate，供人工确认
 */
export async function POST(req: NextRequest) {
  try {
    await requireUser();

    const configured = isPoiProviderConfigured();
    if (!configured.amap && !configured.baidu) {
      return jsonResponse(
        { error: "地图 POI 检索未启用：需配置 AMAP_KEY 或 BAIDU_MAP_AK" },
        { status: 503 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      city?: string;
      phone?: string;
      category?: string;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) {
      return jsonResponse({ error: "name 不合法" }, { status: 400 });
    }

    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : null;

    const result = await matchPoi({
      name,
      city: str(body.city),
      knownPhone: str(body.phone),
      knownCategory: str(body.category),
    });

    return jsonResponse({ data: result });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return jsonResponse({ error: "未登录" }, { status: 401 });
    }
    if (e instanceof PoiProviderError) {
      return jsonResponse(
        { error: `地图接口调用失败: ${e.message}` },
        { status: 502 }
      );
    }
    return jsonResponse(
      { error: safeErrorMessage(e, "POI 匹配失败") },
      { status: 500 }
    );
  }
}
