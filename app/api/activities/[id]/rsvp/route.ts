import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { RsvpBody, RsvpStatus } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 合法 RSVP 状态 */
const VALID_STATUSES: RsvpStatus[] = ["attending", "maybe", "declined"];

/** GET /api/activities/[id]/rsvp — 获取活动 RSVP 汇总（含前 10 个出席者） */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验活动存在 + 当前用户为团体成员
    const { data: activity } = await supabase
      .from("activities")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

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
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const { data: rsvps, error } = await supabase
      .from("activity_rsvp")
      .select("user_id, status")
      .eq("activity_id", id);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取 RSVP 失败") },
        { status: 500 }
      );
    }

    const all = (rsvps ?? []) as { user_id: string; status: RsvpStatus }[];
    const attending = all.filter((r) => r.status === "attending");
    const maybe = all.filter((r) => r.status === "maybe");
    const declined = all.filter((r) => r.status === "declined");
    const myStatus = all.find((r) => r.user_id === user.id)?.status ?? null;

    // 出席者最多取前 10 个，按登记顺序
    const attendingIds = attending.slice(0, 10).map((r) => r.user_id);
    let attendees: { id: string; nickname: string; avatar_url: string | null }[] = [];
    if (attendingIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nickname, avatar_url")
        .in("id", attendingIds);
      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.id, p])
      );
      // 保持 attendingIds 的顺序
      attendees = attendingIds
        .map((uid) => profileMap.get(uid))
        .filter((p): p is { id: string; nickname: string; avatar_url: string | null } => Boolean(p));
    }

    return jsonResponse({
      data: {
        attending: attending.length,
        maybe: maybe.length,
        declined: declined.length,
        attendees,
        my_status: myStatus,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "服务器错误") },
      { status: 500 }
    );
  }
}

/** POST /api/activities/[id]/rsvp — 设置 / 更新 RSVP 状态（upsert） */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data: activity } = await supabase
      .from("activities")
      .select("id, group_id")
      .eq("id", id)
      .maybeSingle();

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
      return jsonResponse({ error: "无权操作" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as RsvpBody;
    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return jsonResponse(
        { error: "status 参数不合法" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("activity_rsvp")
      .upsert(
        {
          activity_id: id,
          user_id: user.id,
          status: body.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "activity_id,user_id" }
      );

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "操作失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: { status: body.status } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "服务器错误") },
      { status: 500 }
    );
  }
}

/** DELETE /api/activities/[id]/rsvp — 取消自己的 RSVP */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { error } = await supabase
      .from("activity_rsvp")
      .delete()
      .eq("activity_id", id)
      .eq("user_id", user.id);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "操作失败") },
        { status: 500 }
      );
    }
    return jsonResponse({ success: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "服务器错误") },
      { status: 500 }
    );
  }
}
