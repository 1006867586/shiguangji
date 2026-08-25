import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** POST /api/diancan/dishes/batch-delete — 商家批量删除菜品（全有全无） */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as { ids?: string[] };
    const ids = body.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string")) {
      return jsonResponse({ error: "ids 必须是非空字符串数组" }, { status: 400 });
    }

    const { data: owned, error: ownErr } = await supabase
      .from("dishes")
      .select("id")
      .eq("merchant_user_id", user.id)
      .in("id", ids);

    if (ownErr || !owned || owned.length !== new Set(ids).size) {
      return jsonResponse({ error: "部分菜品不存在或不属于你" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("dishes")
      .delete()
      .eq("merchant_user_id", user.id)
      .in("id", ids)
      .select("id");

    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "批量删除失败") }, { status: 500 });
    }
    return jsonResponse({ data: { deleted: data?.length ?? 0 } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}