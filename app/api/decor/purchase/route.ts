import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import type { PurchaseDecorResult } from "@/types";

export const dynamic = "force-dynamic";

/** 将 RPC 抛出的业务错误码映射为友好提示 */
const PURCHASE_ERROR_TEXT: Record<string, string> = {
  DECOR_NOT_FOUND: "装扮不存在",
  DECOR_NOT_PURCHASABLE: "该装扮不可购买",
  DECOR_ALREADY_OWNED: "你已经拥有该装扮了",
  INSUFFICIENT_POINTS: "积分不足",
};

/** POST /api/decor/purchase — 用积分购买装扮 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const body = (await request.json()) as { itemId?: string };
    if (!body.itemId) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("purchase_decor_item", {
      p_item_id: body.itemId,
    });

    if (error) {
      const code = (error as { code?: string }).code;
      return jsonResponse(
        {
          error:
            PURCHASE_ERROR_TEXT[code ?? ""] ??
            safeErrorMessage(error, "购买失败"),
        },
        { status: 400 }
      );
    }

    const row = (data ?? [])[0] as PurchaseDecorResult | undefined;
    return jsonResponse({
      data: row ?? { points: 0, item_id: body.itemId },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "服务器错误") },
      { status: 500 }
    );
  }
}
