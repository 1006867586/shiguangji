import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUrl } from "@/lib/utils";
import type { AddPhotoBody } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/activities/[id]/photos — 追加活动照片（仅记录 URL） */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    // 校验活动存在且用户为团体成员
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

    const body = (await request.json()) as AddPhotoBody;
    if (!body.url || !isUrl(body.url)) {
      return jsonResponse({ error: "图片 URL 不合法" }, { status: 400 });
    }

    const { data: photo, error } = await supabase
      .from("activity_photos")
      .insert({
        activity_id: id,
        uploaded_by: user.id,
        url: body.url,
        caption: body.caption?.trim() || null,
      })
      .select("id, activity_id, uploaded_by, url, caption, created_at")
      .single();

    if (error || !photo) {
      return jsonResponse(
        { error: error?.message ?? "添加照片失败" },
        { status: 500 }
      );
    }

    return jsonResponse({ data: photo }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}

/** GET /api/activities/[id]/photos — 获取活动全部照片 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

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

    const { data: photos, error } = await supabase
      .from("activity_photos")
      .select(
        "id, activity_id, uploaded_by, url, caption, created_at, uploader:profiles!activity_photos_uploaded_by_fkey(id, nickname, avatar_url)"
      )
      .eq("activity_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      return jsonResponse({ error: error.message }, { status: 500 });
    }
    return jsonResponse({ data: photos });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
