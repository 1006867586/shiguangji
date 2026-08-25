import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import { getMerchantOf, getDiancanMe, seedDefaultMenu } from "@/lib/diancan";

export const dynamic = "force-dynamic";

/** POST /api/diancan/me/role — 选角色：customer / merchant（merchant 首次自动种默认菜单） */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as { role?: string };
    const role = body.role;
    if (role !== "customer" && role !== "merchant") {
      return jsonResponse({ error: "参数错误：role 必须为 customer 或 merchant" }, { status: 400 });
    }

    if (role === "merchant") {
      const existing = await getMerchantOf(supabase, user.id);
      if (!existing) {
        // 首次开店：建档案 + 种默认菜单
        const { data: created, error } = await supabase
          .from("merchant_lookup")
          .insert({ user_id: user.id, shop_name: "" })
          .select("id")
          .single();
        if (error || !created) {
          return jsonResponse(
            { error: safeErrorMessage(error, "开店失败") },
            { status: 500 }
          );
        }
        await seedDefaultMenu(supabase, user.id);
      }
    }

    const me = await getDiancanMe(supabase, user.id);
    return jsonResponse({ data: me });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}