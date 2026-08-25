import { View, Text, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import {
  fetchDiancanMe,
  fetchMerchantOrders,
  fetchCustomerOrders,
  updateOrderStatus,
  Order,
  OrderStatus,
  DiancanMe,
} from "../../utils/diancan";
import "./index.scss";

const STATUS_TEXT: Record<OrderStatus, string> = {
  pending: "待接单",
  accepted: "已接单",
  rejected: "已拒绝",
  completed: "已完成",
};

export default function DiancanOrders() {
  const [me, setMe] = useState<DiancanMe | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const m = await fetchDiancanMe();
      setMe(m);
      const isMerchant = m?.role === "merchant";
      const res = isMerchant
        ? await fetchMerchantOrders()
        : await fetchCustomerOrders();
      setOrders((res as { orders: Order[] }).orders ?? []);
    } catch {
      // 401 已在 request 层处理
    }
  };

  useEffect(() => {
    load();
    // 临时用轮询兜底新订单（正式接入 Supabase Realtime 后可去掉）
    timer.current = setInterval(load, 8000);
    const onShow = () => load();
    Taro.eventCenter.on("diancan-orders-refresh", onShow);
    return () => {
      if (timer.current) clearInterval(timer.current);
      Taro.eventCenter.off("diancan-orders-refresh", onShow);
    };
  }, []);

  async function setStatus(id: string, status: OrderStatus) {
    await updateOrderStatus(id, status);
    load();
  }

  const isMerchant = me?.role === "merchant";

  return (
    <View className="dc-page">
      <ScrollView scrollY style={{ height: "100vh" }}>
        {orders.length === 0 ? (
          <View className="dc-order-empty">暂无订单</View>
        ) : (
          orders.map((o) => (
            <View key={o.id} className="dc-order-card">
              <View className="dc-order-head">
                <Text className="dc-order-shop">
                  {isMerchant ? o.customer_nickname || "顾客" : o.merchant_nickname || "餐厅"}
                </Text>
                <Text className={`dc-order-status st-${o.status}`}>
                  {STATUS_TEXT[o.status]}
                </Text>
              </View>
              <View className="dc-order-items">
                {o.items_json.map((it, i) => (
                  <Text key={i} className="dc-order-line">
                    {it.emoji} {it.name} ×{it.qty}
                    {"\n"}
                  </Text>
                ))}
              </View>
              {o.invite_note ? (
                <Text className="dc-order-note">备注：{o.invite_note}</Text>
              ) : null}
              <View className="dc-order-total">合计 ¥{Number(o.total_price).toFixed(2)}</View>
              {isMerchant && o.status === "pending" ? (
                <View className="dc-actions">
                  <View
                    className="dc-action-btn dc-action-accept"
                    onClick={() => setStatus(o.id, "accepted")}
                  >
                    接单
                  </View>
                  <View
                    className="dc-action-btn dc-action-reject"
                    onClick={() => setStatus(o.id, "rejected")}
                  >
                    拒绝
                  </View>
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}