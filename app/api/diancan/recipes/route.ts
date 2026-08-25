import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/diancan/recipes — 商家自己的菜谱本列表（含 linkedDishName） */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const { data: recipes } = await supabase
      .from("recipes")
      .select("*")
      .eq("merchant_user_id", user.id)
      .order("created_at", { ascending: false });

    const rows = recipes ?? [];
    if (rows.length > 0) {
      const dishIds = rows.filter((r) => r.linked_dish_id).map((r) => r.linked_dish_id);
      const { data: dishes } =
        dishIds.length > 0 ? await supabase.from("dishes").select("id, name").in("id", dishIds) : { data: [] };
      const nameMap = new Map((dishes ?? []).map((d) => [d.id, d.name]));
      for (const r of rows) (r as Record<string, unknown>).linked_dish_name = nameMap.get(r.linked_dish_id) || null;
    }

    return jsonResponse({ data: { recipes: rows } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/** POST /api/diancan/recipes — 新建菜谱本（自动建 v1 空草稿；可选链接菜品） */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as { title?: string; linkedDishId?: string | null };
    const title = body.title?.trim();
    if (!title) {
      return jsonResponse({ error: "菜谱标题不能为空" }, { status: 400 });
    }

    const { data: recipe, error: recErr } = await supabase
      .from("recipes")
      .insert({ merchant_user_id: user.id, title: title.slice(0, 64) })
      .select("*")
      .single();
    if (recErr || !recipe) {
      if (recErr?.code === "42501") return jsonResponse({ error: "未开店" }, { status: 403 });
      return jsonResponse({ error: safeErrorMessage(recErr, "创建菜谱失败") }, { status: 500 });
    }

    // 自动建 v1 空草稿
    await supabase.from("recipe_versions").insert({
      recipe_id: recipe.id,
      version: 1,
      name: "v1",
      ingredients_json: [],
      steps_json: { nodes: [] },
    });

    // 可选链接菜品（双向同步菜品指针）
    if (body.linkedDishId) {
      const { data: linked } = await supabase
        .from("dishes")
        .select("id, merchant_user_id")
        .eq("id", body.linkedDishId)
        .eq("merchant_user_id", user.id)
        .maybeSingle();
      if (linked) {
        await supabase.from("recipes").update({ linked_dish_id: linked.id }).eq("id", recipe.id);
        recipe.linked_dish_id = linked.id;
        await supabase.from("dishes").update({ linked_recipe_id: recipe.id }).eq("id", linked.id);
      }
    }

    return jsonResponse({ data: { recipe } }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}