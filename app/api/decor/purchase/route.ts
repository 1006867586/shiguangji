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
      const rawMessage = (error as { message?: string }).message ?? null;
      const details = (error as { details?: unknown }).details ?? null;
      const hint = (error as { hint?: string }).hint ?? null;
      // 把 RPC error 全字段打到服务端日志，方便排查。
      console.error("[purchase_decor_item] rpc error", {
        code,
        message: rawMessage,
        details,
        hint,
        body_itemId: body.itemId,
        user_id: user.id,
      });

      // 业务错误码：直接返回 RPC 抛出的字符串（DECOR_NOT_FOUND 等）。
      // 注意：此处不走 safeErrorMessage，因为我们要：
      //   1) 始终携带 code 字段（生产也透传，业务码不是敏感信息）
      //   2) 把 rawMessage 作为 debug_message 返回（生产也透传，
      //      RPC 错误通常只是 'duplicate key value violates unique constraint'
      //      这类用户可读的诊断信息，不会泄露表结构/token）
      const businessCode =
        code && code in PURCHASE_ERROR_TEXT ? code : undefined;
      const friendlyMessage = businessCode
        ? PURCHASE_ERROR_TEXT[businessCode]
        : rawMessage ?? "购买失败";
      return jsonResponse(
        {
          error: friendlyMessage,
          code: businessCode ?? code ?? "UNKNOWN",
          debug_message: rawMessage,
          details,
          hint,
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
