import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["accepted", "rejected"],
  accepted: ["completed"],
};

/** PUT /api/diancan/orders/[id]/status — 商家接/拒/完成订单（实时靠 Postgres Realtime 自动推送） */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    const body = (await request.json()) as { status?: string };
    const status = body.status;
    if (!["accepted", "rejected", "completed"].includes(status || "")) {
      return jsonResponse({ error: "非法状态" }, { status: 400 });
    }

    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr || !order) {
      return jsonResponse({ error: "订单不存在" }, { status: 404 });
    }
    // 只有商家能改状态
    if (order.merchant_user_id !== user.id) {
      return jsonResponse({ error: "无权操作该订单" }, { status: 403 });
    }
    // 状态机校验
    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(status as string)) {
      return jsonResponse({ error: "订单状态流转不允许" }, { status: 409 });
    }

    const { data: updated, error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "更新失败") }, { status: 500 });
    }
    return jsonResponse({ data: { order: updated } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}