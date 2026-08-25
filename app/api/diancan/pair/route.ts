import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** DELETE /api/diancan/pair — 解绑（商家或顾客均可；清除涉及当前用户的绑定） */
export async function DELETE(_req: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    // 尝试按商家身份解绑
    const { data: merchant } = await supabase
      .from("merchant_lookup")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (merchant) {
      await supabase.from("pair_bindings").delete().eq("merchant_user_id", user.id);
    } else {
      await supabase.from("pair_bindings").delete().eq("customer_user_id", user.id);
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}