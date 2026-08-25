import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** DELETE /api/diancan/shop/banner/[id] — 商家删除轮播图 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { error } = await supabase
      .from("shop_banners")
      .delete()
      .eq("id", id)
      .eq("merchant_user_id", user.id);
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "删除轮播图失败") }, { status: 500 });
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}