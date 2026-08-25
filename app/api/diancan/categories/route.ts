import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/diancan/categories?merchantUserId= — 某商家的分类列表（商家/配对顾客可读） */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const supabase = await createServerClient();
    const merchantUserId = request.nextUrl.searchParams.get("merchantUserId");
    if (!merchantUserId) {
      return jsonResponse({ error: "缺少 merchantUserId" }, { status: 400 });
    }
    const { data: categories, error } = await supabase
      .from("dish_categories")
      .select("*")
      .eq("merchant_user_id", merchantUserId)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "获取分类失败") }, { status: 500 });
    }
    return jsonResponse({ data: { categories } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/** POST /api/diancan/categories — 商家新建分类 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as { name?: string; sort?: number };
    const name = body.name?.trim();
    if (!name) {
      return jsonResponse({ error: "分类名不能为空" }, { status: 400 });
    }

    const { data: category, error } = await supabase
      .from("dish_categories")
      .insert({
        merchant_user_id: user.id,
        name: name.slice(0, 64),
        sort: Number.isFinite(body.sort) ? Math.max(0, Math.floor(body.sort as number)) : 0,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "42501") {
        return jsonResponse({ error: "未开店，无法创建分类" }, { status: 403 });
      }
      return jsonResponse({ error: safeErrorMessage(error, "创建分类失败") }, { status: 500 });
    }
    return jsonResponse({ data: { category } }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}