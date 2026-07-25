import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; photoId: string }> };

/** DELETE /api/activities/[id]/photos/[photoId] — 删除照片（仅上传者） */
export async function DELETE(_request: NextRequest, { params }: Params) {
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
      return jsonResponse({ error: "仅上传者可删除" }, { status: 403 });
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
