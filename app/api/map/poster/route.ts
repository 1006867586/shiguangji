import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import { generatePoster, type PosterPoint, type PosterType } from "@/lib/poster";
import { uploadBufferToR2 } from "@/lib/r2";
import type { CircleCheckinPlace } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_POINTS = 12;

function todayText(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/**
 * POST /api/map/poster
 * 生成打卡地图海报（静态底图版）并上传 R2，返回公开访问 URL。
 * body: { type: "footprints" | "circle", groupId?: string }
 * 返回 { data: { url, points, width, height } }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json().catch(() => null)) as
      | { type?: string; groupId?: string }
      | null;
    const type = body?.type as PosterType | undefined;
    if (type !== "footprints" && type !== "circle") {
      return jsonResponse({ error: "type 必须为 footprints 或 circle" }, { status: 400 });
    }

    let points: PosterPoint[] = [];
    let title = "";
    let subtitle = "";

    if (type === "footprints") {
      // 我的足迹：最近打卡记录（含地点坐标）
      const { data, error } = await supabase
        .from("checkins")
        .select(
          `id, checked_at,
           place:places(id, name, address, city, lng, lat)`
        )
        .eq("user_id", user.id)
        .order("checked_at", { ascending: false })
        .limit(MAX_POINTS);
      if (error) {
        return jsonResponse(
          { error: safeErrorMessage(error, "读取打卡记录失败") },
          { status: 500 }
        );
      }
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      const seen = new Set<string>();
      for (const row of rows) {
        const place = (row.place ?? null) as Record<string, unknown> | null;
        if (!place || !place.lng || !place.lat) continue;
        const pid = place.id as string;
        if (seen.has(pid)) continue; // 同一店去重
        seen.add(pid);
        points.push({
          lng: Number(place.lng),
          lat: Number(place.lat),
          name: place.name as string,
          address: (place.address as string | null) ?? null,
        });
      }
      title = "我的打卡地图";
      const city =
        (rows.find((r) => {
          const p = (r.place ?? null) as Record<string, unknown> | null;
          return p?.city;
        })?.place as Record<string, unknown> | undefined)?.city ?? "足迹";
      subtitle = `${String(city)} · ${todayText()}`;
    } else {
      // 圈子打卡：校验成员 + 聚合数据
      const groupId = body?.groupId;
      if (!groupId || !isUuid(groupId)) {
        return jsonResponse({ error: "groupId 参数错误" }, { status: 400 });
      }
      const { data: membership } = await supabase
        .from("group_members")
        .select("group:groups!inner(name)")
        .eq("group_id", groupId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!membership) {
        return jsonResponse({ error: "无权访问该圈子" }, { status: 403 });
      }
      const groupName =
        (membership.group as { name?: string } | null)?.name ?? "圈子";

      const { data, error } = await supabase.rpc("get_group_checkin_places", {
        p_group_id: groupId,
      });
      if (error) {
        return jsonResponse(
          { error: safeErrorMessage(error, "获取圈子打卡数据失败") },
          { status: 500 }
        );
      }
      const rows = (data ?? []) as CircleCheckinPlace[];
      points = rows
        .slice(0, MAX_POINTS)
        .map((r) => ({
          lng: Number(r.lng),
          lat: Number(r.lat),
          name: r.name,
          address: r.address,
        }));
      const totalChecks = rows.reduce((sum, r) => sum + Number(r.checkin_count), 0);
      title = `${groupName} · 打卡地图`;
      subtitle = `${totalChecks} 次打卡 · ${todayText()}`;
    }

    if (points.length === 0) {
      return jsonResponse(
        { error: "暂无打卡记录，先打一次卡再生成海报吧" },
        { status: 400 }
      );
    }

    const posterBuf = await generatePoster({ type, title, subtitle, points });
    const { publicUrl } = await uploadBufferToR2({
      buffer: posterBuf,
      contentType: "image/png",
      ext: "png",
    });

    return jsonResponse({
      data: { url: publicUrl, points: points.length },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "海报生成失败") },
      { status: 500 }
    );
  }
}
