import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/diancan/recipes/[id]/versions — 菜谱版本列表 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { data: recipe } = await supabase
      .from("recipes")
      .select("*, merchant_user_id")
      .eq("id", id)
      .eq("merchant_user_id", user.id)
      .maybeSingle();
    if (!recipe) {
      return jsonResponse({ error: "菜谱不存在或无权查看" }, { status: 404 });
    }

    const { data: versions } = await supabase
      .from("recipe_versions")
      .select("*")
      .eq("recipe_id", id)
      .order("version", { ascending: true });

    return jsonResponse({
      data: {
        versions: versions ?? [],
        currentVersion: recipe.current_version,
        publishedVersion: recipe.published_version,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/**
 * POST /api/diancan/recipes/[id]/versions — 保存当前草稿为一版命名快照
 * 从 current_version 复制内容、自增 version 号；不改 current_version（草稿始终可编辑）
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
      .select("current_version")
      .eq("id", id)
      .eq("merchant_user_id", user.id)
      .maybeSingle();
    if (!recipe) {
      return jsonResponse({ error: "菜谱不存在或无权操作" }, { status: 404 });
    }

    const body = (await request.json()) as { name?: string; memo?: string };
    const name = body.name?.trim();
    if (!name) {
      return jsonResponse({ error: "版本名不能为空" }, { status: 400 });
    }

    // 取当前草稿内容作为快照源
    const { data: draft } = await supabase
      .from("recipe_versions")
      .select("*")
      .eq("recipe_id", id)
      .eq("version", recipe.current_version)
      .maybeSingle();

    const { data: maxRow } = await supabase
      .from("recipe_versions")
      .select("version")
      .eq("recipe_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (maxRow?.version ?? recipe.current_version) + 1;

    const { data: version, error } = await supabase
      .from("recipe_versions")
      .insert({
        recipe_id: id,
        version: nextVersion,
        name: name.slice(0, 64),
        memo: (body.memo ?? draft?.memo ?? "").slice(0, 500),
        ingredients_json: draft?.ingredients_json ?? [],
        steps_json: draft?.steps_json ?? { nodes: [] },
        total_time_min: draft?.total_time_min ?? null,
        notes: (draft?.notes ?? "").slice(0, 1000),
      })
      .select("*")
      .single();
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "保存版本失败") }, { status: 500 });
    }

    return jsonResponse({ data: { version } }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}