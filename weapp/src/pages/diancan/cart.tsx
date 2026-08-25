import { View, Text, Input, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import {
  loadCart,
  updateCartQty,
  cartTotal,
  createOrder,
  clearCartForMerchant,
  fetchDiancanMe,
} from "../../utils/diancan";
import "./index.scss";

export default function DiancanCart() {
  const [refresh, setRefresh] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const items = loadCart();
  // 单店态：以第一家店的商家为准
  const merchantUserId = items[0]?.merchantUserId ?? "";
  const merchantNickname = items[0]?.merchantNickname ?? "";
  const total = cartTotal(items);

  function onQty(dishId: string, delta: number) {
    updateCartQty(dishId, delta);
    setRefresh((n) => n + 1);
  }

  async function onSubmit() {
    if (items.length === 0) return;
    if (!merchantUserId) {
      Taro.showToast({ title: "找不到要下单的店", icon: "none" });
      return;
    }
    setSubmitting(true);
    Taro.showLoading({ title: "下单中...", mask: true });
    try {
      await createOrder({
        merchantUserId,
        items: items.map((it) => ({ dishId: it.dishId, qty: it.qty })),
        inviteNote: note.trim(),
      });
      clearCartForMerchant(merchantUserId);
      Taro.setStorageSync("dc_last_placed_shop", merchantNickname);
      Taro.hideLoading();
      Taro.showToast({ title: "下单成功，等商家接单", icon: "success" });
      // 通知首页刷新购车徽标
      Taro.eventCenter.trigger("diancan-cart-updated");
      setTimeout(() => Taro.redirectTo({ url: "/pages/diancan/orders" }), 600);
    } catch (err) {
      Taro.hideLoading();
      const msg = errMsg(err).message || "下单失败";
      Taro.showToast({ title: msg, icon: "none" });
    } finally {
      setSubmitting(false);
      // 方便二次进页面时能看到最新购物车
      setRefresh((n) => n + 1);
    }
  }

  return (
    <View className="dc-page">
      {items.length === 0 ? (
        <View className="dc-empty">
          <View className="dc-empty-icon">🛒</View>
          <Text className="dc-empty-title">购物车是空的</Text>
          <View
            className="dc-btn"
            onClick={() => Taro.switchTab({ url: "/pages/diancan/index" })}
          >
            去点餐
          </View>
        </View>
      ) : (
        <>
          <View className="dc-shop-tag">🍽️ {merchantNickname}</View>
          <View className="dc-cart-list">
            {items.map((it) => (
              <View key={it.dishId} className="dc-cart-row">
                <Text className="dc-cart-name">{it.emoji} {it.name}</Text>
                <Text className="dc-cart-unit">¥{it.price.toFixed(2)}</Text>
                <View className="dc-stepper">
                  <Text className="dc-step-btn" onClick={() => onQty(it.dishId, -1)}>－</Text>
                  <Text className="dc-step-val">{it.qty}</Text>
                  <Text className="dc-step-btn" onClick={() => onQty(it.dishId, 1)}>＋</Text>
                </View>
              </View>
            ))}
          </View>
          <View className="dc-note-row">
            <Text className="dc-note-label">备注</Text>
            <Input
              className="dc-note-input"
              placeholder="口味、做法等要求（选填）"
              value={note}
              onInput={(e) => setNote(e.detail.value)}
            />
          </View>
          <View className="dc-paybar">
            <View className="dc-paybar-total">合计 ¥{total}</View>
            <Button className="dc-paybar-btn" loading={submitting} disabled={submitting} onClick={onSubmit}>
              提交订单
            </Button>
          </View>
        </>
      )}
    </View>
  );
}

/** 从 request 异常里取 message（兼容 ApiError.message / err.error.message） */
function errMsg(e: unknown): { message?: string } {
  return (e && typeof e === "object" ? (e as { message?: string }) : {}) as {
    message?: string;
  };
}