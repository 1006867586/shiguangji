import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; photoId: string }> };

/** DELETE /api/activities/[id]/photos/[photoId] — 删除照片（仅上传者） */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { photoId } = await params;

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
      return jsonResponse({ error: delErr.message }, { status: 500 });
    }
    return jsonResponse({ success: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
