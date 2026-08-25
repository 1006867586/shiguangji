import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** POST /api/diancan/shop/banner — 商家添加轮播图（上限 5 张） */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const existing = await supabase
      .from("merchant_lookup")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!existing.data) {
      return jsonResponse({ error: "未开店" }, { status: 403 });
    }

    const { count } = await supabase
      .from("shop_banners")
      .select("id", { count: "exact", head: true })
      .eq("merchant_user_id", user.id);
    if ((count ?? 0) >= 5) {
      return jsonResponse({ error: "轮播图最多 5 张" }, { status: 409 });
    }

    const body = (await request.json()) as { imageUrl?: string };
    if (!body.imageUrl?.trim()) {
      return jsonResponse({ error: "缺少 imageUrl" }, { status: 400 });
    }

    const { data: banners, error } = await supabase
      .from("shop_banners")
      .select("sort")
      .eq("merchant_user_id", user.id)
      .order("sort", { ascending: false })
      .limit(1);
    const nextSort = banners && banners.length ? ((banners[0].sort as number) || 0) + 1 : 0;

    const { data: banner, error: insErr } = await supabase
      .from("shop_banners")
      .insert({
        merchant_user_id: user.id,
        image_url: body.imageUrl.trim(),
        sort: nextSort,
      })
      .select("*")
      .single();

    if (insErr || !banner) {
      return jsonResponse({ error: safeErrorMessage(insErr, "添加轮播图失败") }, { status: 500 });
    }
    return jsonResponse({ data: { banner } }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/** PUT /api/diancan/shop/banner/sort — 商家重排轮播图 */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as { bannerIds?: string[] };
    const ids = body.bannerIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      return jsonResponse({ error: "bannerIds 必填字符串数组" }, { status: 400 });
    }

    // 校验所有 banner 属于自己
    const { data: owned, error: ownErr } = await supabase
      .from("shop_banners")
      .select("id")
      .eq("merchant_user_id", user.id)
      .in("id", ids);
    if (ownErr || !owned || owned.length !== new Set(ids).size) {
      return jsonResponse({ error: "部分轮播图不存在或不属于你" }, { status: 404 });
    }

    for (let i = 0; i < ids.length; i++) {
      await supabase
        .from("shop_banners")
        .update({ sort: i })
        .eq("id", ids[i])
        .eq("merchant_user_id", user.id);
    }
    return jsonResponse({ data: { ok: true, bannerIds: ids } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}