import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function parseMerchantId(search: URLSearchParams) {
  // 兼容 customer 场景：客户端直接传 merchantUserId；否则用当前用户自己的商家档案
  const direct = search.get("merchantUserId");
  return direct ?? null;
}

/** GET /api/diancan/dishes?merchantUserId=&categoryId= — 菜品列表（商家/配对顾客可读） */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const supabase = await createServerClient();
    const sp = request.nextUrl.searchParams;
    const merchantUserId = await parseMerchantId(sp);
    if (!merchantUserId) {
      return jsonResponse({ error: "缺少 merchantUserId" }, { status: 400 });
    }

    let query = supabase
      .from("dishes")
      .select("*")
      .eq("merchant_user_id", merchantUserId);
    const categoryId = sp.get("categoryId");
    if (categoryId) query = query.eq("category_id", categoryId);

    const { data: dishes, error } = await query.order("created_at", { ascending: true });
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "获取菜品失败") }, { status: 500 });
    }
    return jsonResponse({ data: { dishes } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/** POST /api/diancan/dishes — 商家新建菜品 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as {
      name?: string;
      categoryId?: string;
      description?: string;
      emoji?: string;
      price?: number;
      available?: boolean;
      thumbnailUrl?: string;
      linkedRecipeId?: string | null;
    };

    if (!body.name?.trim()) {
      return jsonResponse({ error: "菜品名不能为空" }, { status: 400 });
    }
    if (typeof body.price !== "number" || body.price < 0) {
      return jsonResponse({ error: "价格不合法" }, { status: 400 });
    }
    if (!body.categoryId) {
      return jsonResponse({ error: "必须选择分类" }, { status: 400 });
    }

    const insertObj: Record<string, unknown> = {
      merchant_user_id: user.id,
      category_id: body.categoryId,
      name: body.name.trim().slice(0, 64),
      description: body.description?.trim().slice(0, 256) || "",
      emoji: body.emoji?.slice(0, 16) || "🍽️",
      price: body.price,
      available: body.available !== false,
    };
    if (body.thumbnailUrl) insertObj.thumbnail_url = body.thumbnailUrl;
    if (body.linkedRecipeId) insertObj.linked_recipe_id = body.linkedRecipeId;

    const { data: dish, error } = await supabase.from("dishes").insert(insertObj).select("*").single();
    if (error) {
      if (error.code === "42501") return jsonResponse({ error: "未开店，无法创建菜品" }, { status: 403 });
      return jsonResponse({ error: safeErrorMessage(error, "创建菜品失败") }, { status: 500 });
    }
    return jsonResponse({ data: { dish } }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}