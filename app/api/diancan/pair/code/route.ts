import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import { getMerchantOf, generatePairingCode } from "@/lib/diancan";

export const dynamic = "force-dynamic";

/** POST /api/diancan/pair/code — 商家生成 6 位配对码（需为商家） */
export async function POST(_req: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const merchant = await getMerchantOf(supabase, user.id);
    if (!merchant) {
      return jsonResponse({ error: "当前账号未开店，无法生成配对码" }, { status: 403 });
    }

    // 最多重试 8 次保证唯一
    let code = generatePairingCode();
    let inserted = false;
    for (let i = 0; i < 8; i++) {
      const { error } = await supabase
        .from("merchant_lookup")
        .update({ pairing_code: code })
        .eq("id", merchant.id);
      if (!error) {
        inserted = true;
        break;
      }
      code = generatePairingCode();
    }

    if (!inserted) {
      return jsonResponse({ error: "配对码生成失败，请重试" }, { status: 500 });
    }

    return jsonResponse({ data: { code, createdAt: Date.now() } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}