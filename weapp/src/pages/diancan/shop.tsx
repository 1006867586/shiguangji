import { View, Text, Input, Button } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";
import {
  fetchDiancanMe,
  setRole,
  generatePairCode,
  fetchMyShop,
  updateShopConfig,
  type DiancanMe,
  type MyShopConfig,
} from "../../utils/diancan";
import "./index.scss";

/**
 * 商家中心 / 开店。
 *
 * - 未开店：一键「我要开店」→ 后端建档案 + 种默认菜单（setRole("merchant")）
 * - 已开店：展示/生成配对码、改店名、入口（配菜 / 接单）、可切回顾客
 */
export default function DiancanShop() {
  const [me, setMe] = useState<DiancanMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<MyShopConfig | null>(null);
  const [shopName, setShopName] = useState("");
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    try {
      const m = await fetchDiancanMe();
      setMe(m);
      if (m.role === "merchant") {
        const shop = await fetchMyShop(m.merchant.userId);
        setConfig(shop.config);
        setShopName(shop.config.shopName);
      }
    } catch {
      // 401 已在 request 层处理
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useDidShow(() => {
    load();
  });

  /** 首次开店：切角色 → 后端自动建档案 + 种默认菜单 */
  async function openShop() {
    setOpening(true);
    try {
      await setRole("merchant");
      await load();
      Taro.showToast({ title: "开店成功，可生成配对码", icon: "none" });
    } catch {
      // 错误 toast 已由 request 层弹出
    } finally {
      setOpening(false);
    }
  }

  async function genCode() {
    setGenerating(true);
    try {
      const { code } = await generatePairCode();
      await load();
      // 剪贴板依赖小程序后台「剪贴板」隐私声明；未声明时会 reject（errno 112），降级为弹窗展示
      try {
        await Taro.setClipboardData({ data: code });
        Taro.showToast({ title: `配对码 ${code} 已复制`, icon: "none" });
      } catch {
        showCodeModal(code);
      }
    } catch {
      // 错误 toast 已弹出
    } finally {
      setGenerating(false);
    }
  }

  /** 剪贴板不可用时的配对码弹窗展示 */
  function showCodeModal(code: string) {
    Taro.showModal({
      title: "配对码",
      content: `${code}\n\n顾客在小程序「点餐 → 绑定餐厅」输入此 6 位码即可点单`,
      confirmText: "知道了",
      showCancel: false,
    });
  }

  async function saveShop() {
    if (!shopName.trim()) {
      Taro.showToast({ title: "请输入店名", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      const { config: c } = await updateShopConfig({ shopName: shopName.trim() });
      setConfig(c);
      Taro.showToast({ title: "已保存", icon: "success" });
    } catch {
      // 错误 toast 已弹出
    } finally {
      setSaving(false);
    }
  }

  async function switchToCustomer() {
    try {
      await setRole("customer");
      Taro.showToast({ title: "已切回顾客身份", icon: "success" });
      Taro.switchTab({ url: "/pages/diancan/index" });
    } catch {
      // 错误 toast 已弹出
    }
  }

  if (loading) {
    return (
      <View className="dc-empty">
        <Text>加载中…</Text>
      </View>
    );
  }

  // ---- 未开店：引导开店 ----
  if (me?.role !== "merchant") {
    const isPairedCustomer = me?.role === "customer" && !!me.merchant;
    return (
      <View className="dc-empty">
        <View className="dc-empty-icon">{isPairedCustomer ? "🍽️" : "👨‍🍳"}</View>
        <Text className="dc-empty-title">{isPairedCustomer ? "你当前是顾客身份" : "我是老板，我要开店"}</Text>
        <Text className="dc-empty-sub">
          {isPairedCustomer
            ? "已绑定餐厅点餐中。开店后会生成配对码，供顾客绑定。"
            : "开店后自动生成默认菜单与 6 位配对码，顾客输入配对码即可点餐。"}
        </Text>
        {isPairedCustomer ? (
          <View className="dc-btn" onClick={() => Taro.switchTab({ url: "/pages/diancan/index" })}>
            去点餐
          </View>
        ) : (
          <Button className="dc-pair-btn" loading={opening} disabled={opening} onClick={openShop}>
            我要开店
          </Button>
        )}
      </View>
    );
  }

  // ---- 商家中心 ----
  const code = config?.pairingCode ?? me.merchant?.pairingCode ?? null;

  return (
    <View className="dc-page">
      <View className="dc-shop-header">
        <View className="dc-shop-info">
          <Text className="dc-shop-name">{config?.displayShopName || "我的店"}</Text>
          <Text className="dc-shop-tagline">商家中心 · 分享配对码给顾客点餐</Text>
        </View>
      </View>

      {/* 配对码卡片 */}
      <View className="dc-shop-card">
        <Text className="dc-shop-card-label">我的配对码</Text>
        {code ? (
          <View className="dc-code-row">
            <Text className="dc-code">{code}</Text>
            <View className="dc-code-copy" onClick={genCode}>
              复制/刷新
            </View>
          </View>
        ) : (
          <Text className="dc-shop-card-empty">尚未生成配对码</Text>
        )}
        {!code ? (
          <Button className="dc-pair-btn" loading={generating} disabled={generating} onClick={genCode}>
            生成配对码
          </Button>
        ) : null}
        <Text className="dc-shop-card-tip">顾客在小程序「点餐 → 绑定餐厅」输入此码即可点单</Text>
      </View>

      {/* 店名 */}
      <View className="dc-shop-card">
        <Text className="dc-shop-card-label">店名</Text>
        <View className="dc-shop-form">
          <Input
            className="dc-shop-input"
            value={shopName}
            maxlength={20}
            placeholder="输入店铺名"
            onInput={(e) => setShopName(e.detail.value)}
          />
          <Button className="dc-shop-save" loading={saving} disabled={saving} onClick={saveShop}>
            保存
          </Button>
        </View>
      </View>

      {/* 功能入口 */}
      <View className="dc-manage-cards">
        <View className="dc-manage-card" onClick={() => Taro.navigateTo({ url: "/pages/diancan/manage" })}>
          <Text className="dc-manage-card-icon">📋</Text>
          <View>
            <Text className="dc-manage-card-title">配菜</Text>
            <Text className="dc-manage-card-sub">管理分类与菜品</Text>
          </View>
        </View>
        <View className="dc-manage-card" onClick={() => Taro.navigateTo({ url: "/pages/diancan/orders" })}>
          <Text className="dc-manage-card-icon">🛎️</Text>
          <View>
            <Text className="dc-manage-card-title">接单</Text>
            <Text className="dc-manage-card-sub">查看顾客订单</Text>
          </View>
        </View>
      </View>

      <View className="dc-switch-customer" onClick={switchToCustomer}>
        切回顾客身份
      </View>
    </View>
  );
}
