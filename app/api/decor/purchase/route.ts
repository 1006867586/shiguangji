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
      // 业务错误码：直接返回 RPC 抛出的字符串（DECOR_NOT_FOUND 等），
      // 并映射成用户可读文案。生产环境保留 code 不脱敏，
      // 因为前端用它决定 toast 内容（lib/utils.ts safeErrorMessage 会脱敏 message）。
      const businessCode =
        code && code in PURCHASE_ERROR_TEXT ? code : undefined;
      const message =
        (businessCode && PURCHASE_ERROR_TEXT[businessCode]) ||
        safeErrorMessage(error, "购买失败");
      return jsonResponse(
        { error: message, code: businessCode },
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
