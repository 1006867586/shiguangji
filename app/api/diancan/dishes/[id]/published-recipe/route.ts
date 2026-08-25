import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { isPaired } from "@/lib/diancan";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/diancan/dishes/[id]/published-recipe — 顾客/商家查看某道菜已发布的菜谱
 * 权限：能看这道菜的人（商家本人 / 配对顾客）
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { data: dish } = await supabase
      .from("dishes")
      .select("id, merchant_user_id, linked_recipe_id")
      .eq("id", id)
      .maybeSingle();
    if (!dish || !dish.linked_recipe_id) {
      return jsonResponse({ error: "尚未编写菜谱" }, { status: 404 });
    }

    // 权限：自己商家 或 已配对
    const isOwner = dish.merchant_user_id === user.id;
    const allowed = isOwner || (await isPaired(supabase, user.id, dish.merchant_user_id));
    if (!allowed) {
      return jsonResponse({ error: "无权查看" }, { status: 403 });
    }

    const { data: recipe } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", dish.linked_recipe_id)
      .eq("merchant_user_id", dish.merchant_user_id)
      .maybeSingle();
    if (!recipe || recipe.published_version == null) {
      return jsonResponse({ error: "尚未发布菜谱" }, { status: 404 });
    }

    const { data: version } = await supabase
      .from("recipe_versions")
      .select("*")
      .eq("recipe_id", recipe.id)
      .eq("version", recipe.published_version)
      .maybeSingle();
    if (!version) {
      return jsonResponse({ error: "已发布版本缺失" }, { status: 404 });
    }

    return jsonResponse({ data: { recipe, version, versionNo: recipe.published_version } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}