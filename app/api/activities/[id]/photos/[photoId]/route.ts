import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { ActivityPhoto } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; photoId: string }> };

/** DELETE /api/activities/[id]/photos/[photoId] — 删除照片（活动发起者可删所有，其他人只能删自己上传的） */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id, photoId } = await params;

    if (!isUuid(id) || !isUuid(photoId)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 查询照片及对应活动的发起者
    const { data: photo, error } = await supabase
      .from("activity_photos")
      .select("id, uploaded_by, activity:activities(created_by)")
      .eq("id", photoId)
      .maybeSingle();

    if (error || !photo) {
      return jsonResponse({ error: "照片不存在" }, { status: 404 });
    }

    const activityUserId =
      Array.isArray(photo.activity) ? photo.activity[0]?.created_by : (photo.activity as { created_by: string } | null)?.created_by;

    const isActivityOwner = activityUserId === user.id;
    const isPhotoUploader = photo.uploaded_by === user.id;

    if (!isActivityOwner && !isPhotoUploader) {
      return jsonResponse({ error: "无权删除此照片" }, { status: 403 });
    }

    const { error: delErr } = await supabase
      .from("activity_photos")
      .delete()
      .eq("id", photoId);

    if (delErr) {
      return jsonResponse(
        { error: safeErrorMessage(delErr, "删除失败") },
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

/** PATCH /api/activities/[id]/photos/[photoId] — 修改照片描述（仅上传者） */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id, photoId } = await params;

    if (!isUuid(id) || !isUuid(photoId)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data: photo, error } = await supabase
      .from("activity_photos")
      .select("id, uploaded_by")
      .eq("id", photoId)
      .maybeSingle();

    if (error || !photo) {
      return jsonResponse({ error: "照片不存在" }, { status: 404 });
    }
    if (photo.uploaded_by !== user.id) {
      return jsonResponse({ error: "仅上传者可修改" }, { status: 403 });
    }

    // 解析 body，仅接受 caption 字段；空字符串归一为 null
    let body: { caption?: unknown } = {};
    try {
      body = (await request.json()) as { caption?: unknown };
    } catch {
      return jsonResponse({ error: "请求体格式错误" }, { status: 400 });
    }

    if (body.caption === undefined) {
      return jsonResponse({ error: "缺少 caption 字段" }, { status: 400 });
    }
    if (body.caption !== null && typeof body.caption !== "string") {
      return jsonResponse({ error: "caption 必须为字符串" }, { status: 400 });
    }

    const trimmed =
      typeof body.caption === "string" ? body.caption.trim() : "";
    const nextCaption: string | null = trimmed.length > 0 ? trimmed : null;

    const { data: updated, error: updateErr } = await supabase
      .from("activity_photos")
      .update({ caption: nextCaption })
      .eq("id", photoId)
      .select(
        "id, activity_id, uploaded_by, url, caption, kind, created_at"
      )
      .single();

    if (updateErr || !updated) {
      return jsonResponse(
        { error: safeErrorMessage(updateErr, "更新失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: updated as ActivityPhoto });
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
