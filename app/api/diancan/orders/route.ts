import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, safeErrorMessage } from "@/lib/utils";
import { getMerchantOf, getBoundMerchant } from "@/lib/diancan";

export const dynamic = "force-dynamic";

/** GET /api/diancan/orders — 订单列表（商家/顾客各自视角） */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const merchant = await getMerchantOf(supabase, user.id);
    if (merchant) {
      const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .eq("merchant_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return jsonResponse({ data: { orders: orders ?? [] } });
    }

    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    return jsonResponse({ data: { orders: orders ?? [] } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}

/** POST /api/diancan/orders — 顾客下单（价格/菜名服务端快照，不信客户端） */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    // 已有商家档案则不能作为顾客下单
    const amMerchant = await getMerchantOf(supabase, user.id);
    if (amMerchant) {
      return jsonResponse({ error: "商家账号不能下单" }, { status: 400 });
    }

    const body = (await request.json()) as {
      items?: { dishId?: string; qty?: number }[];
      inviteNote?: string;
      merchantUserId?: string;
    };

    const merchantUser = body.merchantUserId || (await getBoundMerchant(supabase, user.id))?.user_id;
    if (!merchantUser) {
      return jsonResponse({ error: "尚未绑定商家" }, { status: 403 });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0 || items.some((it) => !it.dishId || typeof it.qty !== "number" || it.qty <= 0)) {
      return jsonResponse({ error: "订单菜品不合法" }, { status: 400 });
    }

    const dishIds = items.map((it) => it.dishId as string);
    const { data: dishes } = await supabase
      .from("dishes")
      .select("id, merchant_user_id, name, price, emoji, available")
      .in("id", dishIds);

    if (!dishes || dishes.length !== new Set(dishIds).size) {
      return jsonResponse({ error: "部分菜品不存在" }, { status: 400 });
    }
    const dishMap = new Map(dishes.map((d) => [d.id, d]));
    for (const d of dishes) {
      if (d.merchant_user_id !== merchantUser) {
        return jsonResponse({ error: "菜品不属于绑定商家" }, { status: 400 });
      }
      if (d.available === false) {
        return jsonResponse({ error: `「${d.name}」已下架` }, { status: 400 });
      }
    }

    // 快照订单行（防改名/改库存影响历史）
    let total = 0;
    const orderItems = items.map((it) => {
      const dish = dishMap.get(it.dishId as string)!;
      const qty = Math.floor(it.qty as number);
      total += Number(dish.price) * qty;
      return { dishId: dish.id, name: dish.name, price: Number(dish.price), emoji: dish.emoji, qty };
    });

    const { data: merchantProf } = await supabase
      .from("merchant_lookup")
      .select("shop_name")
      .eq("user_id", merchantUser)
      .maybeSingle();
    const { data: userProf } = await supabase
      .from("profiles")
      .select("nickname")
      .eq("id", user.id)
      .maybeSingle();

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        customer_user_id: user.id,
        merchant_user_id: merchantUser,
        customer_nickname: userProf?.nickname || "",
        merchant_nickname: merchantProf?.shop_name || "",
        items_json: orderItems,
        total_price: Math.round(total * 100) / 100,
        status: "pending",
        invite_note: body.inviteNote?.trim().slice(0, 256) || null,
      })
      .select("*")
      .single();

    if (error) {
      return jsonResponse({ error: safeErrorMessage(error, "下单失败") }, { status: 500 });
    }

    // 订阅消息推送（MOCK best-effort，不阻塞下单；实时接单提示由 Supabase Realtime 承担）
    await supabase
      .from("notification_subscriptions")
      .select("template_id, status")
      .eq("user_id", merchantUser)
      .eq("status", "accepted")
      .limit(1)
      .maybeSingle()
      .then(({ data: sub }) => {
        if (!sub) return;
        return supabase.from("notifications_sent").insert({
          user_id: merchantUser,
          template_id: sub.template_id,
          order_id: order.id,
          payload_json: { shopName: merchantProf?.shop_name || "", totalPrice: order.total_price },
          mode: "MOCK",
          status: "mocked",
        });
      });

    return jsonResponse({ data: { order } }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse({ error: safeErrorMessage(err, "服务器错误") }, { status: 500 });
  }
}