import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** PUT /api/diancan/dishes/[id] — 更新菜品（部分字段） */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const body = (await request.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return jsonResponse({ error: "菜品名不能为空" }, { status: 400 });
      patch.name = name.slice(0, 64);
    }
    if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 256);
    if (typeof body.emoji === "string") patch.emoji = body.emoji.slice(0, 16) || "🍽️";
    if (typeof body.price === "number") {
      if (body.price < 0) return jsonResponse({ error: "价格不合法" }, { status: 400 });
      patch.price = body.price;
    }
    if (typeof body.categoryId === "string") patch.category_id = body.categoryId;
    if (typeof body.available === "boolean") patch.available = body.available;
    if (typeof body.thumbnailUrl === "string") patch.thumbnail_url = body.thumbnailUrl;
    if (body.linkedRecipeId !== undefined) {
      patch.linked_recipe_id = body.linkedRecipeId === null ? null : body.linkedRecipeId;
    }
    if (Object.keys(patch).length === 0) {
      return jsonResponse({ error: "缺少更新字段" }, { status: 400 });
    }

    const { data: dish, error } = await supabase
      .from("dishes")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      if (error.code === "42501") return jsonResponse({ error: "无权修改该菜品" }, { status: 403 });
      if (error.code === "PGRST116") return jsonResponse({ error: "菜品不存在" }, { status: 404 });
      return jsonResponse({ error: safeErrorMessage(error, "更新菜品失败") }, { status: 500 });
    }
    return jsonResponse({ data: { dish } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/** DELETE /api/diancan/dishes/[id] — 删除菜品 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { error } = await supabase.from("dishes").delete().eq("id", id);
    if (error) {
      if (error.code === "42501") return jsonResponse({ error: "无权删除该菜品" }, { status: 403 });
      return jsonResponse({ error: safeErrorMessage(error, "删除菜品失败") }, { status: 500 });
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}