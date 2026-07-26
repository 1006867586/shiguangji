import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage, isUuid } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/favorite-places/[id]
 * 删除当前用户的一条店铺收藏。RLS 保证只能删自己的。
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "无效的 id" }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { error } = await supabase
      .from("favorite_places")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "删除失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: { success: true } });
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
