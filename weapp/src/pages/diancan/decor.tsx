import { View, Text, Input, Button, Textarea, Image } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import {
  fetchDiancanMe,
  fetchMyShop,
  updateShopConfig,
  createBanner,
  deleteBanner,
  reorderBanners,
  type MyShopConfig,
  type ShopBanner,
} from "../../utils/diancan";
import { uploadToR2 } from "../../utils/upload";
import "./index.scss";

const THEME_OPTIONS = [
  { key: "orange", label: "活力橙", hex: "#ffa94d" },
  { key: "red", label: "热情红", hex: "#ff6b6b" },
  { key: "blue", label: "清爽蓝", hex: "#4dabf7" },
];

/** 轮播图行间距（rpx）→ px，用于拖拽排序时换算目标位置 */
const ROW_PITCH_PX = (() => {
  try {
    return (168 * Taro.getSystemInfoSync().windowWidth) / 750;
  } catch {
    return 80;
  }
})();

/**
 * 店铺装修：店名/标语/公告/主题色 + 轮播图管理。
 */
export default function DiancanDecor() {
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [config, setConfig] = useState<MyShopConfig | null>(null);
  const [banners, setBanners] = useState<ShopBanner[]>([]);
  const [loading, setLoading] = useState(true);

  const [shopName, setShopName] = useState("");
  const [tagline, setTagline] = useState("");
  const [notice, setNotice] = useState("");
  const [themeColor, setThemeColor] = useState("orange");

  const [saving, setSaving] = useState(false);

  // 轮播图拖拽排序
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const bannersRef = useRef<ShopBanner[]>([]);
  const dragOrderRef = useRef<ShopBanner[] | null>(null);
  const dragStateRef = useRef<{ index: number; startY: number; moved: boolean } | null>(null);

  useEffect(() => {
    bannersRef.current = banners;
  }, [banners]);

  const load = async () => {
    try {
      const m = await fetchDiancanMe();
      if (m.role !== "merchant") {
        setMerchantId(null);
        return;
      }
      setMerchantId(m.merchant.userId);
      const shop = await fetchMyShop(m.merchant.userId);
      setConfig(shop.config);
      setBanners(shop.banners);
      setShopName(shop.config.shopName);
      setTagline(shop.config.tagline);
      setNotice(shop.config.notice);
      setThemeColor(shop.config.themeColor || "orange");
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

  async function save() {
    if (!shopName.trim()) {
      Taro.showToast({ title: "请输入店名", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      await updateShopConfig({
        shopName: shopName.trim(),
        tagline: tagline.trim(),
        notice: notice.trim(),
        themeColor,
      });
      await load();
      Taro.showToast({ title: "已保存", icon: "success" });
    } catch {
      // 错误 toast 已弹出
    } finally {
      setSaving(false);
    }
  }

  async function addBanner() {
    if (banners.length >= 5) {
      Taro.showToast({ title: "轮播图最多 5 张", icon: "none" });
      return;
    }
    let res;
    try {
      res = await Taro.chooseMedia({ count: 1, mediaType: ["image"] });
    } catch {
      return; // 用户取消
    }
    const file = res.tempFiles?.[0];
    if (!file?.tempFilePath) return;
    Taro.showLoading({ title: "上传中...", mask: true });
    try {
      const url = await uploadToR2(file.tempFilePath);
      await createBanner(url);
      await load();
      Taro.hideLoading();
      Taro.showToast({ title: "已添加", icon: "success" });
    } catch (err) {
      Taro.hideLoading();
      const msg =
        (err && typeof err === "object" && (err as { message?: string }).message) || "上传失败";
      Taro.showToast({ title: String(msg).slice(0, 30), icon: "none" });
    }
  }

  async function removeBanner(b: ShopBanner) {
    const res = await Taro.showModal({
      title: "删除轮播图",
      content: "确定删除这张图片吗？",
      confirmColor: "#ff6b35",
    });
    if (!res.confirm) return;
    try {
      await deleteBanner(b.id);
      await load();
    } catch {
      // 错误 toast 已弹出
    }
  }

  /** 拖拽排序：按住右侧手柄上下移动即可换位，松手自动保存 */
  function onDragStart(e: { touches?: Array<{ clientY: number }> }, idx: number) {
    const y = e.touches?.[0]?.clientY ?? 0;
    dragStateRef.current = { index: idx, startY: y, moved: false };
    dragOrderRef.current = [...bannersRef.current];
    setDragIndex(idx);
  }

  function onDragMove(e: { touches?: Array<{ clientY: number }> }) {
    const st = dragStateRef.current;
    const order = dragOrderRef.current;
    if (!st || !order) return;
    const y = e.touches?.[0]?.clientY ?? st.startY;
    const target = Math.max(
      0,
      Math.min(order.length - 1, st.index + Math.round((y - st.startY) / ROW_PITCH_PX))
    );
    if (target !== st.index) {
      const [item] = order.splice(st.index, 1);
      order.splice(target, 0, item);
      setBanners([...order]);
      dragStateRef.current = { index: target, startY: y, moved: true };
    }
  }

  async function onDragEnd() {
    const st = dragStateRef.current;
    const order = dragOrderRef.current;
    dragStateRef.current = null;
    dragOrderRef.current = null;
    setDragIndex(null);
    if (!st?.moved || !order) return;
    try {
      await reorderBanners(order.map((b) => b.id));
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

  if (!merchantId) {
    return (
      <View className="dc-empty">
        <View className="dc-empty-icon">👨‍🍳</View>
        <Text className="dc-empty-title">只有商家可以装修店铺</Text>
        <Text className="dc-empty-sub">请先在商家中心完成开店</Text>
        <View className="dc-btn" onClick={() => Taro.navigateTo({ url: "/pages/diancan/shop" })}>
          去开店
        </View>
      </View>
    );
  }

  return (
    <View className="dc-page">
      <View className="dc-shop-header">
        <View className="dc-shop-info">
          <Text className="dc-shop-name">店铺装修</Text>
          <Text className="dc-shop-tagline">顾客点餐页将按此展示</Text>
        </View>
      </View>

      {/* 店铺信息 */}
      <View className="dc-shop-card">
        <Text className="dc-shop-card-label">店名</Text>
        <Input
          className="dc-field-input dc-decor-input"
          value={shopName}
          maxlength={20}
          placeholder="输入店铺名"
          onInput={(e) => setShopName(e.detail.value)}
        />
        <Text className="dc-shop-card-label">标语</Text>
        <Input
          className="dc-field-input dc-decor-input"
          value={tagline}
          maxlength={100}
          placeholder="一句话介绍（可选）"
          onInput={(e) => setTagline(e.detail.value)}
        />
        <Text className="dc-shop-card-label">公告（每行一条，最多 5 条轮播）</Text>
        <Textarea
          className="dc-decor-textarea"
          value={notice}
          maxlength={200}
          placeholder="每行一条公告，如：&#10;今日特供酸菜鱼&#10;晚市 8 折优惠"
          onInput={(e) => setNotice(e.detail.value)}
        />
      </View>

      {/* 主题色 */}
      <View className="dc-shop-card">
        <Text className="dc-shop-card-label">主题色</Text>
        <View className="dc-theme-row">
          {THEME_OPTIONS.map((t) => (
            <View
              key={t.key}
              className={`dc-theme-item ${themeColor === t.key ? "dc-theme-item-on" : ""}`}
              onClick={() => setThemeColor(t.key)}
            >
              <View className="dc-theme-dot" style={{ background: t.hex }} />
              <Text className="dc-theme-label">{t.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 轮播图 */}
      <View className="dc-shop-card">
        <View className="dc-decor-row">
          <Text className="dc-shop-card-label">轮播图（{banners.length}/5）</Text>
          <View className="dc-code-copy" onClick={addBanner}>
            ＋ 上传图片
          </View>
        </View>
        {banners.length === 0 ? (
          <Text className="dc-shop-card-tip">暂无轮播图，点击右上角上传（最多 5 张）</Text>
        ) : (
          <View className="dc-banner-list">
            {banners.map((b, i) => (
              <View
                key={b.id}
                className={`dc-banner-row ${dragIndex === i ? "dc-banner-row-drag" : ""}`}
              >
                <Image className="dc-banner-thumb" src={b.image_url} mode="aspectFill" />
                <View className="dc-banner-meta">
                  <Text className="dc-banner-idx">第 {i + 1} 张</Text>
                  {dragIndex === i && (
                    <Text className="dc-banner-drag-tip">拖动中，松手保存顺序</Text>
                  )}
                </View>
                <View
                  className={`dc-banner-grip ${dragIndex === i ? "dc-banner-grip-on" : ""}`}
                  catchMove
                  onTouchStart={(e) => onDragStart(e, i)}
                  onTouchMove={onDragMove}
                  onTouchEnd={onDragEnd}
                >
                  ≡
                </View>
                <View className="dc-banner-del" onClick={() => removeBanner(b)}>
                  ×
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="dc-decor-save">
        <Button className="dc-pair-btn" loading={saving} disabled={saving} onClick={save}>
          保存装修
        </Button>
      </View>
    </View>
  );
}
