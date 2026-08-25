import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** POST /api/diancan/recipes/[id]/unpublish — 取消发布 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { data: recipe } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", id)
      .eq("merchant_user_id", user.id)
      .maybeSingle();
    if (!recipe) {
      return jsonResponse({ error: "菜谱不存在或无权操作" }, { status: 404 });
    }

    const { data: updated, error } = await supabase
      .from("recipes")
      .update({ published_version: null })
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "取消发布失败") }, { status: 500 });
    }
    return jsonResponse({ data: { recipe: updated } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}