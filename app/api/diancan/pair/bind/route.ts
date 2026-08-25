import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** POST /api/diancan/pair/bind — 顾客用 6 位码绑定商家 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as { code?: string };
    const code = body.code?.trim();
    if (!code || !/^\d{6}$/.test(code)) {
      return jsonResponse({ error: "配对码为 6 位数字" }, { status: 400 });
    }

    const { data: merchant, error: merchantErr } = await supabase
      .from("merchant_lookup")
      .select("user_id, shop_name")
      .eq("pairing_code", code)
      .maybeSingle();

    if (merchantErr || !merchant) {
      return jsonResponse({ error: "配对码无效" }, { status: 404 });
    }
    if (merchant.user_id === user.id) {
      return jsonResponse({ error: "不能绑定自己" }, { status: 403 });
    }

    // 顾客可换绑定：先清掉旧 binding
    await supabase.from("pair_bindings").delete().eq("customer_user_id", user.id);

    const { error } = await supabase.from("pair_bindings").insert({
      merchant_user_id: merchant.user_id,
      customer_user_id: user.id,
    });
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "绑定失败") }, { status: 500 });
    }

    // 清掉配对码，防止他人复用（需再次邀请时重新生成）
    await supabase
      .from("merchant_lookup")
      .update({ pairing_code: null })
      .eq("user_id", merchant.user_id);

    return jsonResponse({
      data: {
        merchantUserId: merchant.user_id,
        merchantNickname: merchant.shop_name || "",
        merchantAvatarUrl: null,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}