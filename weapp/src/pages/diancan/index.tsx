import { View, Text, Image, ScrollView, Swiper, SwiperItem } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { setSelectedTab } from "@/custom-tab-bar/tabStore";
import {
  fetchDiancanMe,
  fetchMenu,
  fetchMyShop,
  addToCart,
  loadCart,
  cartTotal,
  type DiancanMe,
  type Dish,
  type DishCategory,
  type MyShopConfig,
  type ShopBanner,
  DC_LAST_MERCHANT_KEY,
} from "../../utils/diancan";
import "./index.scss";

/**
 * 点餐页（顾客浏览店）：参考原 diancan 项目 browse 段。
 * - 店铺装修头：banner 轮播 + logo + 店名/标语 + 公告，滚动后折叠吸顶
 * - 左右两栏：左侧分类（含全部）、右侧菜品，切换分类自动定位
 * - 下拉刷新 + 菜品骨架屏 + 🎲 随机点菜
 */
export default function DiancanIndex() {
  const [me, setMe] = useState<DiancanMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<DishCategory[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [shop, setShop] = useState<MyShopConfig | null>(null);
  const [banners, setBanners] = useState<ShopBanner[]>([]);
  const [activeCatId, setActiveCatId] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [bannerCollapsed, setBannerCollapsed] = useState(false);
  const [dishesScrollTop, setDishesScrollTop] = useState(0);
  const [catScrollIntoView, setCatScrollIntoView] = useState("");

  const cart = useMemo(() => loadCart(), [cartCount]);
  const total = cartTotal(cart);
  const visibleDishes = useMemo(
    () => (activeCatId ? dishes.filter((d) => d.category_id === activeCatId) : dishes),
    [dishes, activeCatId]
  );
  // 公告：每条一行（\n 分隔），多条时垂直轮播
  const notices = useMemo(
    () => (shop?.notice ? shop.notice.split("\n").map((s) => s.trim()).filter(Boolean) : []),
    [shop?.notice]
  );

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  useDidShow(() => {
    setSelectedTab(2);
    // 从购物车返回后刷新徽标
    setCartCount(loadCart().length);
  });

  async function load() {
    try {
      const m = await fetchDiancanMe();
      setMe(m);
      // 顾客/商家都能进入浏览：商家预览自己的店（merchant.userId 即自己）
      const bound = m.merchant?.userId ? m.merchant.userId : null;
      if (bound) {
        const [menu, shopData] = await Promise.all([
          fetchMenu(bound),
          fetchMyShop(bound).catch(() => null),
        ]);
        setCategories(menu.categories);
        setDishes(menu.dishes.filter((d) => d.available !== false));
        if (shopData) {
          setShop(shopData.config);
          setBanners(shopData.banners);
        }
        Taro.setStorageSync(DC_LAST_MERCHANT_KEY, bound);
      }
      setCartCount(loadCart().length);
    } catch (err) {
      // 401 时 request 已跳登录页
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  function selectCategory(id: string) {
    setActiveCatId(id);
    setDishesScrollTop(0);
    setCatScrollIntoView(id ? `cat-${id}` : "cat-all");
  }

  function onDishScroll(e: { detail: { scrollTop: number } }) {
    const top = e.detail.scrollTop || 0;
    setBannerCollapsed(top > 30);
  }

  function showNotice(text: string) {
    if (!text) return;
    Taro.showModal({
      title: "公告",
      content: text,
      showCancel: false,
      confirmText: "知道了",
      confirmColor: "#ff6b35",
    });
  }

  /** 🎲 随机点一道菜加入购物车 */
  function randomDish() {
    if (!dishes.length) {
      Taro.showToast({ title: "暂无菜品", icon: "none" });
      return;
    }
    const d = dishes[Math.floor(Math.random() * dishes.length)];
    addToCart({ userId: d.merchant_user_id, shopName: shop?.shopName || "本店" }, d, 1);
    bumpCart();
    Taro.showToast({ title: `随机抽中「${d.name}」`, icon: "none" });
  }

  function bumpCart() {
    setCartCount(loadCart().length);
    Taro.eventCenter.trigger("diancan-cart-updated");
  }

  if (loading) {
    return <DishSkeleton />;
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

  // 商家角色：直接预览自己的店铺（等同顾客视角），右上角可回商家中心
  const isMerchant = me?.role === "merchant";

  const themeHex = shop?.themeColorHex || "#ff6b35";
  const shopName = shop?.displayShopName || me?.merchant?.shopName || "餐厅菜单";

  return (
    <View className="dc-page dc-page--browse">
      {/* 店铺装修头：banner → logo/店名/标语/公告 */}
      <View className="dc-shop-hero" style={{ background: themeHex }}>
        {banners.length > 0 && !bannerCollapsed && (
          <Swiper
            className="dc-shop-banners"
            indicatorDots
            autoplay
            circular
            interval={3500}
            indicatorColor="rgba(255,255,255,0.5)"
            indicatorActiveColor="#ffffff"
          >
            {banners.map((b) => (
              <SwiperItem key={b.id}>
                <Image className="dc-shop-banner-img" src={b.image_url} mode="aspectFill" />
              </SwiperItem>
            ))}
          </Swiper>
        )}
        <View className={`dc-shop-brand ${bannerCollapsed ? "dc-shop-brand--sticky" : ""}`}>
          {shop?.logoUrl ? (
            <Image className="dc-shop-logo" src={shop.logoUrl} mode="aspectFill" />
          ) : (
            <View className="dc-shop-logo dc-shop-logo--empty">🍳</View>
          )}
          <View className="dc-shop-brand-text">
            <Text className="dc-shop-name dc-shop-name--hero">{shopName}</Text>
            {shop?.tagline ? <Text className="dc-shop-tagline dc-shop-tagline--hero">{shop.tagline}</Text> : null}
            {notices.length > 0 && (
              <View className="dc-shop-notice">
                {notices.length === 1 ? (
                  <View className="dc-shop-notice-item" onClick={() => showNotice(notices[0])}>
                    <Text className="dc-shop-notice-icon">📢</Text>
                    <Text className="dc-shop-notice-text">{notices[0]}</Text>
                    {notices[0].length > 30 ? <Text className="dc-shop-notice-more">详情</Text> : null}
                  </View>
                ) : (
                  <Swiper
                    className="dc-shop-notice-swiper"
                    vertical
                    autoplay
                    circular
                    interval={3000}
                  >
                    {notices.map((n, i) => (
                      <SwiperItem key={i}>
                        <View className="dc-shop-notice-item" onClick={() => showNotice(n)}>
                          <Text className="dc-shop-notice-icon">📢</Text>
                          <Text className="dc-shop-notice-text">{n}</Text>
                          {n.length > 30 ? <Text className="dc-shop-notice-more">详情</Text> : null}
                        </View>
                      </SwiperItem>
                    ))}
                  </Swiper>
                )}
              </View>
            )}
          </View>
          {isMerchant && (
            <View className="dc-shop-center-btn" onClick={() => Taro.navigateTo({ url: "/pages/diancan/shop" })}>
              商家中心
            </View>
          )}
        </View>
      </View>

      {/* 左右两栏：分类 + 菜品 */}
      <View className="dc-browse-body">
        <ScrollView
          scrollY
          className="dc-cat-col"
          scrollIntoView={catScrollIntoView}
          scrollWithAnimation
        >
          <View
            id="cat-all"
            className={`dc-cat-cell ${activeCatId === "" ? "dc-cat-cell--on" : ""}`}
            onClick={() => selectCategory("")}
          >
            全部
          </View>
          {categories.map((c) => (
            <View
              key={c.id}
              id={`cat-${c.id}`}
              className={`dc-cat-cell ${activeCatId === c.id ? "dc-cat-cell--on" : ""}`}
              onClick={() => selectCategory(c.id)}
            >
              {c.name}
            </View>
          ))}
        </ScrollView>

        <ScrollView
          scrollY
          className="dc-dish-col"
          scrollTop={dishesScrollTop}
          onScroll={onDishScroll}
          refresherEnabled
          refresherTriggered={refreshing}
          onRefresherRefresh={refresh}
        >
          {visibleDishes.length === 0 ? (
            <View className="dc-dish-empty">
              <View className="dc-dish-empty-icon">🍽️</View>
              <Text className="dc-dish-empty-text">暂无菜品</Text>
            </View>
          ) : (
            visibleDishes.map((d) => (
              <DishRow key={d.id} dish={d} shopName={shop?.shopName || "本店"} onAdded={bumpCart} />
            ))
          )}
          {/* 底部留白，避免固定栏遮挡 */}
          <View style={{ height: "280rpx" }} />
        </ScrollView>
      </View>

      {/* 🎲 随机点菜 + 结算条（仅顾客视角） */}
      {!isMerchant && (
        <>
          <View className="dc-shop-fab" onClick={randomDish}>🎲</View>
          {cart.length > 0 && (
            <View className="dc-cartbar" onClick={() => Taro.navigateTo({ url: "/pages/diancan/cart" })}>
              <View className="dc-cartbar-left">
                <View className="dc-cartbar-badge">{cartCount}</View>
              </View>
              <View className="dc-cartbar-total">¥{total}</View>
              <View className="dc-cartbar-btn">去下单</View>
            </View>
          )}
        </>
      )}
    </View>
  );
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

/** 菜品加载骨架屏 */
function DishSkeleton() {
  return (
    <View className="dc-page dc-page--skeleton">
      <View className="dc-shop-hero dc-skeleton-hero">
        <View className="dc-shop-brand">
          <View className="dc-skeleton-block dc-skeleton-logo" />
          <View className="dc-shop-brand-text">
            <View className="dc-skeleton-block dc-skeleton-line dc-skeleton-line--w60" />
            <View className="dc-skeleton-block dc-skeleton-line dc-skeleton-line--w40" />
          </View>
        </View>
      </View>
      <View className="dc-browse-body">
        <View className="dc-cat-col">
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} className="dc-skeleton-block dc-skeleton-cat" />
          ))}
        </View>
        <View className="dc-dish-col">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} className="dc-dish-skeleton">
              <View className="dc-skeleton-block dc-skeleton-img" />
              <View className="dc-dish-skeleton-info">
                <View className="dc-skeleton-block dc-skeleton-line dc-skeleton-line--w80" />
                <View className="dc-skeleton-block dc-skeleton-line dc-skeleton-line--w60" />
                <View className="dc-skeleton-block dc-skeleton-line dc-skeleton-line--w40" />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
