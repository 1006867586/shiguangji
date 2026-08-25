import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

const THEME_HEX: Record<string, string> = {
  red: "#ff6b6b",
  orange: "#ffa94d",
  blue: "#4dabf7",
};

/** 组装前端可直接展示的店铺配置 */
function buildConfig(merchant: Record<string, unknown>, nickname: string) {
  return {
    merchantUserId: merchant.user_id,
    shopName: merchant.shop_name || "",
    displayShopName: merchant.shop_name || `${nickname || "微信用户"}的厨房`,
    tagline: merchant.tagline || "",
    notice: merchant.notice || "",
    themeColor: merchant.theme_color || "orange",
    themeColorHex: THEME_HEX[(merchant.theme_color as string) || "orange"] || "#ffa94d",
    logoUrl: merchant.logo_url || null,
    pairingCode: merchant.pairing_code || null,
    updatedAt: merchant.updated_at,
  };
}

/** GET /api/diancan/shop?merchantUserId= — 读取店铺装修（商家/配对顾客） */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const supabase = await createServerClient();
    const merchantUserId = request.nextUrl.searchParams.get("merchantUserId");
    if (!merchantUserId) {
      return jsonResponse({ error: "缺少 merchantUserId" }, { status: 400 });
    }

    const { data: merchant, error } = await supabase
      .from("merchant_lookup")
      .select("*")
      .eq("user_id", merchantUserId)
      .maybeSingle();
    if (error || !merchant) {
      return jsonResponse({ error: "店铺不存在" }, { status: 404 });
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("nickname")
      .eq("id", merchantUserId)
      .maybeSingle();
    const { data: banners } = await supabase
      .from("shop_banners")
      .select("*")
      .eq("merchant_user_id", merchantUserId)
      .order("sort", { ascending: true });

    return jsonResponse({
      data: {
        config: buildConfig(merchant, prof?.nickname || ""),
        banners: banners ?? [],
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/** PUT /api/diancan/shop — 商家更新店铺配置（部分字段） */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const existing = await supabase
      .from("merchant_lookup")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!existing.data) {
      return jsonResponse({ error: "未开店" }, { status: 403 });
    }

    const body = (await request.json()) as {
      shopName?: string;
      tagline?: string;
      notice?: string;
      themeColor?: string;
      logoUrl?: string | null;
    };
    const patch: Record<string, unknown> = {};

    if (typeof body.shopName === "string") {
      const v = body.shopName.trim();
      if (v.length > 20) return jsonResponse({ error: "店铺名最长 20 字" }, { status: 400 });
      patch.shop_name = v;
    }
    if (typeof body.tagline === "string") patch.tagline = body.tagline.slice(0, 100);
    if (typeof body.notice === "string") patch.notice = body.notice.slice(0, 200);
    if (typeof body.themeColor === "string") {
      if (!THEME_HEX[body.themeColor]) {
        return jsonResponse({ error: "主题色仅支持 red/orange/blue" }, { status: 400 });
      }
      patch.theme_color = body.themeColor;
    }
    if (body.logoUrl !== undefined) patch.logo_url = body.logoUrl;

    if (Object.keys(patch).length === 0) {
      return jsonResponse({ error: "缺少更新字段" }, { status: 400 });
    }

    const { data: merchant, error } = await supabase
      .from("merchant_lookup")
      .update(patch)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "更新店铺失败") }, { status: 500 });
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("nickname")
      .eq("id", user.id)
      .maybeSingle();
    return jsonResponse({ data: { config: buildConfig(merchant, prof?.nickname || "") } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}