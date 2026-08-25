import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function loadRecipe(supabase: Awaited<ReturnType<typeof createServerClient>>, id: string, userId: string) {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .eq("merchant_user_id", userId)
    .maybeSingle();
  return { recipe: data ?? null, error };
}

/** GET /api/diancan/recipes/[id] — 菜谱详情 + 当前草稿版本 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { recipe, error } = await loadRecipe(supabase, id, user.id);
    if (error || !recipe) {
      return jsonResponse({ error: "菜谱不存在或无权查看" }, { status: 404 });
    }

    const { data: currentVersion } = await supabase
      .from("recipe_versions")
      .select("*")
      .eq("recipe_id", id)
      .eq("version", recipe.current_version)
      .maybeSingle();

    return jsonResponse({ data: { recipe, currentVersion: currentVersion ?? null } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/** PUT /api/diancan/recipes/[id] — 更新菜谱标题 / 链接菜品 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { recipe, error: ownErr } = await loadRecipe(supabase, id, user.id);
    if (ownErr || !recipe) {
      return jsonResponse({ error: "菜谱不存在或无权修改" }, { status: 404 });
    }

    const body = (await request.json()) as { title?: string; linkedDishId?: string | null };
    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string") {
      const t = body.title.trim();
      if (!t) return jsonResponse({ error: "标题不能为空" }, { status: 400 });
      patch.title = t.slice(0, 64);
    }
    if (body.linkedDishId !== undefined) {
      if (body.linkedDishId) {
        const { data: linked } = await supabase
          .from("dishes")
          .select("id")
          .eq("id", body.linkedDishId)
          .eq("merchant_user_id", user.id)
          .maybeSingle();
        if (!linked) {
          return jsonResponse({ error: "要链接的菜品不存在或不属于你" }, { status: 400 });
        }
        // 解除旧链接的菜谱指针
        if (recipe.linked_dish_id && recipe.linked_dish_id !== linked.id) {
          await supabase
            .from("dishes")
            .update({ linked_recipe_id: null })
            .eq("linked_recipe_id", recipe.id);
        }
        patch.linked_dish_id = linked.id;
        await supabase.from("dishes").update({ linked_recipe_id: recipe.id }).eq("id", linked.id);
      } else {
        patch.linked_dish_id = null;
        await supabase.from("dishes").update({ linked_recipe_id: null }).eq("linked_recipe_id", recipe.id);
      }
    }
    if (Object.keys(patch).length === 0) {
      return jsonResponse({ error: "缺少更新字段" }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from("recipes")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "更新失败") }, { status: 500 });
    }
    return jsonResponse({ data: { recipe: updated } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/** DELETE /api/diancan/recipes/[id] — 删除菜谱（连同版本；清空菜品链接指针） */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { recipe, error: ownErr } = await loadRecipe(supabase, id, user.id);
    if (ownErr || !recipe) {
      return jsonResponse({ error: "菜谱不存在" }, { status: 404 });
    }

    // 清空链接菜品的指针
    if (recipe.linked_dish_id) {
      await supabase.from("dishes").update({ linked_recipe_id: null }).eq("id", recipe.linked_dish_id);
    }
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "删除失败") }, { status: 500 });
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}