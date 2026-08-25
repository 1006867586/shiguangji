import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** PUT /api/diancan/categories/[id] — 更新分类名/排序 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const body = (await request.json()) as { name?: string; sort?: number };
    const patch: Record<string, number | string> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return jsonResponse({ error: "分类名不能为空" }, { status: 400 });
      patch.name = name.slice(0, 64);
    }
    if (typeof body.sort === "number") patch.sort = Math.max(0, Math.floor(body.sort));
    if (Object.keys(patch).length === 0) {
      return jsonResponse({ error: "缺少更新字段" }, { status: 400 });
    }

    const { data: category, error } = await supabase
      .from("dish_categories")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      if (error.code === "42501") return jsonResponse({ error: "无权修改该分类" }, { status: 403 });
      if (error.code === "PGRST116") return jsonResponse({ error: "分类不存在" }, { status: 404 });
      return jsonResponse({ error: safeErrorMessage(error, "更新分类失败") }, { status: 500 });
    }
    return jsonResponse({ data: { category } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/** DELETE /api/diancan/categories/[id] — 删除分类（分类下有菜则 409） */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { data: category } = await supabase
      .from("dish_categories")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!category) {
      return jsonResponse({ error: "分类不存在" }, { status: 404 });
    }

    const { data: dishes } = await supabase
      .from("dishes")
      .select("id")
      .eq("category_id", id)
      .limit(1);
    if (dishes && dishes.length > 0) {
      return jsonResponse(
        { error: "该分类下还有菜品，请先删除或移动菜品" },
        { status: 409 }
      );
    }

    const { error } = await supabase.from("dish_categories").delete().eq("id", id);
    if (error) {
      if (error.code === "42501") return jsonResponse({ error: "无权删除该分类" }, { status: 403 });
      return jsonResponse({ error: safeErrorMessage(error, "删除分类失败") }, { status: 500 });
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}