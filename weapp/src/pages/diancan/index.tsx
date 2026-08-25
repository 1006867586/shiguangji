import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { setSelectedTab } from "@/custom-tab-bar/tabStore";
import {
  fetchDiancanMe,
  fetchMenu,
  fetchShopConfig,
  addToCart,
  loadCart,
  cartTotal,
  DiancanMe,
  Dish,
  DishCategory,
  ShopConfig,
  DC_LAST_MERCHANT_KEY,
} from "../../utils/diancan";
import "./index.scss";

export default function DiancanIndex() {
  const [me, setMe] = useState<DiancanMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<DishCategory[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [shop, setShop] = useState<ShopConfig | null>(null);
  const [cartCount, setCartCount] = useState(0);

  const cart = useMemo(() => loadCart(), [cartCount]);
  const total = cartTotal(cart);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  useDidShow(() => {
    setSelectedTab(2);
    // 从购物车返回后刷新徽标与菜单
    setCartCount(loadCart().length);
  });

  async function load() {
    try {
      const m = await fetchDiancanMe();
      setMe(m);
      const bound = m.role === "customer" && m.merchant?.userId ? m.merchant.userId : null;
      if (bound) {
        const [menu, cfg] = await Promise.all([
          fetchMenu(bound),
          fetchShopConfig(bound).catch(() => null),
        ]);
        setCategories(menu.categories);
        setDishes(menu.dishes.filter((d) => d.available !== false));
        setShop(cfg);
        Taro.setStorageSync(DC_LAST_MERCHANT_KEY, bound);
      }
      setCartCount(loadCart().length);
    } catch (err) {
      // 401 时 request 已跳登录页
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View className="dc-empty">
        <Text>加载中…</Text>
      </View>
    );
  }

  // 未配对顾客 → 引导去配对
  if (me?.role === null || (me?.role === "customer" && !me.merchant)) {
    return (
      <View className="dc-empty">
        <View className="dc-empty-icon">🍽️</View>
        <Text className="dc-empty-title">还没绑定餐厅</Text>
        <Text className="dc-empty-sub">输入老板的配对码，开始点餐</Text>
        <View className="dc-btn" onClick={() => Taro.navigateTo({ url: "/pages/diancan/pair" })}>
          去配对
        </View>
        <View className="dc-btn-secondary" onClick={() => Taro.navigateTo({ url: "/pages/diancan/shop" })}>
          我是老板，我要开店
        </View>
      </View>
    );
  }

  // 商家角色：进入商家中心（配对码/配菜/接单）
  if (me?.role === "merchant") {
    return (
      <View className="dc-empty">
        <View className="dc-empty-icon">👨‍🍳</View>
        <Text className="dc-empty-title">我是商家</Text>
        <Text className="dc-empty-sub">进入商家中心管理配对码、菜单与订单</Text>
        <View className="dc-btn" onClick={() => Taro.navigateTo({ url: "/pages/diancan/shop" })}>
          商家中心
        </View>
        <View className="dc-btn-secondary" onClick={() => Taro.navigateTo({ url: "/pages/diancan/orders" })}>
          查看订单
        </View>
      </View>
    );
  }

  const byCategory = (catId: string | null) =>
    dishes.filter((d) => d.category_id === catId);

  return (
    <View className="dc-page">
      {/* 店铺头 */}
      <View className="dc-shop-header">
        <View className="dc-shop-info">
          <Text className="dc-shop-name">{shop?.shop_name || me.merchant?.shopName || "餐厅菜单"}</Text>
          {shop?.tagline ? <Text className="dc-shop-tagline">{shop.tagline}</Text> : null}
        </View>
      </View>
      {shop?.notice ? <View className="dc-shop-notice">{shop.notice}</View> : null}

      <ScrollView scrollY className="dc-menu">
        <View className="dc-section">
          <Text className="dc-section-title">推荐</Text>
          {byCategory(null).map((d) => (
            <DishRow key={d.id} dish={d} shopName={shop?.shop_name || "本店"} onAdded={bumpCart} />
          ))}
        </View>
        {categories.map((cat) => {
          const items = byCategory(cat.id);
          if (items.length === 0) return null;
          return (
            <View key={cat.id} className="dc-section">
              <Text className="dc-section-title">{cat.name}</Text>
              {items.map((d) => (
                <DishRow key={d.id} dish={d} shopName={shop?.shop_name || "本店"} onAdded={bumpCart} />
              ))}
            </View>
          );
        })}
        <View style={{ height: "140rpx" }} />
      </ScrollView>

      {/* 结算条 */}
      {cart.length > 0 && (
        <View className="dc-cartbar" onClick={() => Taro.navigateTo({ url: "/pages/diancan/cart" })}>
          <View className="dc-cartbar-left">
            <View className="dc-cartbar-badge">{cartCount}</View>
          </View>
          <View className="dc-cartbar-total">¥{total}</View>
          <View className="dc-cartbar-btn">去下单</View>
        </View>
      )}
    </View>
  );

  function bumpCart() {
    setCartCount(loadCart().length);
    Taro.eventCenter.trigger("diancan-cart-updated");
  }
}

function DishRow({
  dish,
  shopName,
  onAdded,
}: {
  dish: Dish;
  shopName: string;
  onAdded: () => void;
}) {
  return (
    <View className="dc-dish">
      {dish.thumbnail_url ? (
        <Image className="dc-dish-img" src={dish.thumbnail_url} mode="aspectFill" />
      ) : (
        <View className="dc-dish-emoji">{dish.emoji || "🍽️"}</View>
      )}
      <View className="dc-dish-body">
        <Text className="dc-dish-name">{dish.emoji} {dish.name}</Text>
        {dish.description ? <Text className="dc-dish-desc">{dish.description}</Text> : null}
        <Text className="dc-dish-price">¥{Number(dish.price).toFixed(2)}</Text>
      </View>
      <View
        className="dc-dish-add"
        onClick={() => {
          addToCart({ userId: dish.merchant_user_id, shopName }, dish, 1);
          onAdded();
        }}
      >
        ＋
      </View>
    </View>
  );
}