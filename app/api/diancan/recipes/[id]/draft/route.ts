import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** PUT /api/diancan/recipes/[id]/draft — 覆盖当前草稿版本的内容字段 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { data: recipe, error: ownErr } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", id)
      .eq("merchant_user_id", user.id)
      .maybeSingle();
    if (ownErr || !recipe) {
      return jsonResponse({ error: "菜谱不存在或无权修改" }, { status: 404 });
    }

    const body = (await request.json()) as {
      ingredients?: string[];
      steps?: { nodes?: unknown[] };
      totalTimeMin?: number | null;
      notes?: string;
      memo?: string;
      name?: string;
    };
    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) patch.name = String(body.name).slice(0, 64);
    if (body.memo !== undefined) patch.memo = String(body.memo).slice(0, 500);
    if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 1000);
    if (body.totalTimeMin !== undefined) {
      if (body.totalTimeMin !== null && (!Number.isInteger(body.totalTimeMin) || body.totalTimeMin < 0 || body.totalTimeMin > 1440)) {
        return jsonResponse({ error: "耗时需为 0~1440 的整数或 null" }, { status: 400 });
      }
      patch.total_time_min = body.totalTimeMin;
    }
    if (Array.isArray(body.ingredients)) {
      const cleaned = body.ingredients.map((s) => String(s).trim()).filter(Boolean);
      if (cleaned.some((s) => s.length > 200) || cleaned.length > 50) {
        return jsonResponse({ error: "每项食材 ≤200 字，最多 50 项" }, { status: 400 });
      }
      patch.ingredients_json = cleaned;
    }
    if (body.steps && Array.isArray(body.steps.nodes)) {
      const nodes = body.steps.nodes as { type?: string }[];
      const valid = new Set(["action", "branch", "parallel", "merge", "loop"]);
      const cleaned = nodes.filter((n) => n && valid.has(n.type || ""));
      if (cleaned.length > 50) {
        return jsonResponse({ error: "步骤节点最多 50 个" }, { status: 400 });
      }
      patch.steps_json = { nodes: cleaned };
    }

    if (Object.keys(patch).length === 0) {
      return jsonResponse({ error: "缺少更新字段" }, { status: 400 });
    }

    const { data: version, error } = await supabase
      .from("recipe_versions")
      .update(patch)
      .eq("recipe_id", id)
      .eq("version", recipe.current_version)
      .select("*")
      .single();
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "保存草稿失败") }, { status: 500 });
    }
    return jsonResponse({ data: { version } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}