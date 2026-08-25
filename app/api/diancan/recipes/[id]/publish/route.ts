import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/diancan/recipes/[id]/publish — 发布菜谱
 * 默认发布最新保存的命名版本（max(version)）；body 可传 { version: N } 指定。
 * 校验 linked_dish_id 存在且属于本商家。
 */
export async function POST(
  request: NextRequest,
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
    if (!recipe.linked_dish_id) {
      return jsonResponse({ error: "请先链接菜品再发布" }, { status: 400 });
    }

    const { data: dish } = await supabase
      .from("dishes")
      .select("id, name")
      .eq("id", recipe.linked_dish_id)
      .eq("merchant_user_id", user.id)
      .maybeSingle();
    if (!dish) {
      return jsonResponse({ error: "链接的菜品不存在或不属于你" }, { status: 400 });
    }

    const body = (await request.json()) as { version?: number } | null;
    let target: number;
    if (body && typeof body.version === "number" && Number.isInteger(body.version)) {
      target = body.version;
    } else {
      const { data: maxRow } = await supabase
        .from("recipe_versions")
        .select("version")
        .eq("recipe_id", id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      target = maxRow?.version ?? recipe.current_version;
    }

    const { data: version } = await supabase
      .from("recipe_versions")
      .select("*")
      .eq("recipe_id", id)
      .eq("version", target)
      .maybeSingle();
    if (!version) {
      return jsonResponse({ error: "要发布的版本不存在" }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from("recipes")
      .update({ published_version: target })
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "发布失败") }, { status: 500 });
    }

    return jsonResponse({ data: { recipe: updated, dish, publishedVersion: target } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}