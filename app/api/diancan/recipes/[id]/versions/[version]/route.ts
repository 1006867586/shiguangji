import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function loadOwnRecipe(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  id: string,
  userId: string
) {
  const { data } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .eq("merchant_user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** GET /api/diancan/recipes/[id]/versions/[version] — 单个版本详情 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id, version } = await params;
    const verNum = Number(version);
    if (!Number.isInteger(verNum) || verNum < 1) {
      return jsonResponse({ error: "版本号无效" }, { status: 400 });
    }

    const recipe = await loadOwnRecipe(supabase, id, user.id);
    if (!recipe) {
      return jsonResponse({ error: "菜谱不存在或无权查看" }, { status: 404 });
    }

    const { data: row } = await supabase
      .from("recipe_versions")
      .select("*")
      .eq("recipe_id", id)
      .eq("version", verNum)
      .maybeSingle();
    if (!row) {
      return jsonResponse({ error: "版本不存在" }, { status: 404 });
    }

    return jsonResponse({
      data: {
        version: row,
        isPublished: recipe.published_version === verNum,
        isCurrent: recipe.current_version === verNum,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/** PUT /api/diancan/recipes/[id]/versions/[version] — 修改版本名 / 备注 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id, version } = await params;
    const verNum = Number(version);
    if (!Number.isInteger(verNum) || verNum < 1) {
      return jsonResponse({ error: "版本号无效" }, { status: 400 });
    }

    const body = (await request.json()) as { name?: string; memo?: string };
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const n = body.name.trim();
      if (!n) return jsonResponse({ error: "版本名不能为空" }, { status: 400 });
      patch.name = n.slice(0, 64);
    }
    if (typeof body.memo === "string") {
      patch.memo = body.memo.slice(0, 500);
    }
    if (Object.keys(patch).length === 0) {
      return jsonResponse({ error: "缺少更新字段" }, { status: 400 });
    }

    const { data: row, error } = await supabase
      .from("recipe_versions")
      .update(patch)
      .eq("recipe_id", id)
      .eq("version", verNum)
      .select("*")
      .maybeSingle();
    if (error || !row) {
      if (error?.code === "42501") return jsonResponse({ error: "无权修改" }, { status: 403 });
      return jsonResponse({ error: "版本不存在或无权修改" }, { status: 404 });
    }
    return jsonResponse({ data: { version: row } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/** DELETE /api/diancan/recipes/[id]/versions/[version] — 删除快照（已发布版本不可删） */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id, version } = await params;
    const verNum = Number(version);
    if (!Number.isInteger(verNum) || verNum < 1) {
      return jsonResponse({ error: "版本号无效" }, { status: 400 });
    }

    const recipe = await loadOwnRecipe(supabase, id, user.id);
    if (!recipe) {
      return jsonResponse({ error: "菜谱不存在或无权操作" }, { status: 404 });
    }
    if (recipe.published_version === verNum) {
      return jsonResponse({ error: "已发布的版本不能删除" }, { status: 409 });
    }

    const { error } = await supabase
      .from("recipe_versions")
      .delete()
      .eq("recipe_id", id)
      .eq("version", verNum);
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "删除版本失败") }, { status: 500 });
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}