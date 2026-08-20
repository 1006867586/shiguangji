import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { CircleCheckinPlace } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/groups/[id]/map — 圈子打卡聚合视图（脱敏）
 * 仅圈子成员可调用（RPC 内校验）；返回该圈子聚餐关联的打卡点聚合，
 * 只含 地点+打卡数+最近打卡时间，不暴露打卡人身份。
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    // 成员校验由 RPC get_group_checkin_places 内部完成（security definer）
    await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("get_group_checkin_places", {
      p_group_id: id,
    });

    if (error) {
      // RPC 内 raise 'not a member' → PostgREST 返回 403 语义，这里统一映射
      if (String(error.message ?? "").includes("not a member")) {
        return jsonResponse({ error: "无权访问" }, { status: 403 });
      }
      return jsonResponse(
        { error: safeErrorMessage(error, "获取圈子打卡地图失败") },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const places: CircleCheckinPlace[] = rows.map((r) => ({
      place_id: r.place_id as string,
      name: r.name as string,
      address: (r.address as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      lng: Number(r.lng),
      lat: Number(r.lat),
      checkin_count: Number(r.checkin_count),
      last_checked_at: (r.last_checked_at as string | null) ?? null,
    }));

    return jsonResponse({ data: places });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "获取圈子打卡地图失败") },
      { status: 500 }
    );
  }
}
