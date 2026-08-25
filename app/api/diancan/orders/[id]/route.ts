import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/diancan/orders/[id] — 订单详情（任一参与方） */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !order) {
      return jsonResponse({ error: "订单不存在" }, { status: 404 });
    }
    if (order.customer_user_id !== user.id && order.merchant_user_id !== user.id) {
      return jsonResponse({ error: "无权查看该订单" }, { status: 403 });
    }
    return jsonResponse({ data: { order } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}