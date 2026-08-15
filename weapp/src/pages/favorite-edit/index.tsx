import { useCallback, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Input, Textarea, Button, Picker } from "@tarojs/components";
import {
  fetchFavoritePlaces,
  updateFavoritePlace,
  PLATFORM_LABELS,
  type FavoritePlace,
  type FavoritePlatform,
} from "@/utils/api";
import "./index.scss";

const PLATFORM_OPTIONS: FavoritePlatform[] = [
  "meituan",
  "dianping",
  "xiaohongshu",
  "douyin",
  "unknown",
];

/**
 * 收藏编辑页：白名单字段表单（店名/地址/电话/招牌菜/评分/人均/分类/简介/平台）。
 * 保存成功后返回上一页（列表页 useDidShow 自动刷新）。
 */
export default function FavoriteEditPage() {
  const [place, setPlace] = useState<FavoritePlace | null>(null);
  const [saving, setSaving] = useState(false);

  // 表单草稿（字符串态，提交时规整）
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [dishes, setDishes] = useState("");
  const [rating, setRating] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState("");
  const [platformIdx, setPlatformIdx] = useState(4); // unknown

  const fillForm = (p: FavoritePlace) => {
    setPlace(p);
    setTitle(p.title);
    setAddress(p.address ?? "");
    setPhone(p.phone ?? "");
    setDishes((p.signature_dishes ?? []).join("、"));
    setRating(p.rating != null ? String(p.rating) : "");
    setPrice(p.price ?? "");
    setCategory(p.category ?? "");
    setSummary(p.summary ?? "");
    const idx = PLATFORM_OPTIONS.indexOf(p.platform);
    setPlatformIdx(idx >= 0 ? idx : 4);
  };

  useDidShow(() => {
    const id = Taro.getCurrentInstance().router?.params?.id ?? "";
    if (!id || place) return;
    void (async () => {
      try {
        const list = await fetchFavoritePlaces();
        const found = list.find((x) => x.id === id);
        if (found) fillForm(found);
        else Taro.showToast({ title: "收藏不存在", icon: "none" });
      } catch {
        // request 层已 toast
      }
    })();
  });

  const handleSave = useCallback(async () => {
    if (!place || saving) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Taro.showToast({ title: "店名不能为空", icon: "none" });
      return;
    }
    const ratingNum = rating.trim() ? Number(rating.trim()) : null;
    if (ratingNum != null && (!Number.isFinite(ratingNum) || ratingNum < 0 || ratingNum > 5)) {
      Taro.showToast({ title: "评分需在 0-5 之间", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      await updateFavoritePlace(place.id, {
        title: trimmedTitle,
        address: address.trim() || null,
        phone: phone.trim() || null,
        signature_dishes: dishes
          .split(/[、,，\s]+/)
          .map((d) => d.trim())
          .filter(Boolean),
        rating: ratingNum,
        price: price.trim() || null,
        category: category.trim() || null,
        summary: summary.trim(),
        platform: PLATFORM_OPTIONS[platformIdx],
      });
      Taro.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => Taro.navigateBack(), 500);
    } catch {
      // request 层已 toast
    } finally {
      setSaving(false);
    }
  }, [place, saving, title, address, phone, dishes, rating, price, category, summary, platformIdx]);

  if (!place) {
    return (
      <View className="fe-page state">
        <Text className="text-muted">加载中…</Text>
      </View>
    );
  }

  return (
    <View className="fe-page">
      <View className="fe-card">
        <View className="fe-field">
          <Text className="fe-label">店名 *</Text>
          <Input
            className="fe-input"
            value={title}
            onInput={(e) => setTitle(e.detail.value)}
            placeholder="店铺名称"
            maxlength={60}
          />
        </View>
        <View className="fe-field">
          <Text className="fe-label">地址</Text>
          <Input
            className="fe-input"
            value={address}
            onInput={(e) => setAddress(e.detail.value)}
            placeholder="门店地址"
          />
        </View>
        <View className="fe-field">
          <Text className="fe-label">电话</Text>
          <Input
            className="fe-input"
            type="text"
            value={phone}
            onInput={(e) => setPhone(e.detail.value)}
            placeholder="联系电话"
          />
        </View>
        <View className="fe-field">
          <Text className="fe-label">招牌菜（顿号分隔）</Text>
          <Input
            className="fe-input"
            value={dishes}
            onInput={(e) => setDishes(e.detail.value)}
            placeholder="如：番茄锅、捞面"
          />
        </View>
        <View className="fe-row">
          <View className="fe-field half">
            <Text className="fe-label">评分（0-5）</Text>
            <Input
              className="fe-input"
              type="digit"
              value={rating}
              onInput={(e) => setRating(e.detail.value)}
              placeholder="4.5"
            />
          </View>
          <View className="fe-field half">
            <Text className="fe-label">人均</Text>
            <Input
              className="fe-input"
              value={price}
              onInput={(e) => setPrice(e.detail.value)}
              placeholder="￥80"
            />
          </View>
        </View>
        <View className="fe-row">
          <View className="fe-field half">
            <Text className="fe-label">分类</Text>
            <Input
              className="fe-input"
              value={category}
              onInput={(e) => setCategory(e.detail.value)}
              placeholder="火锅"
            />
          </View>
          <View className="fe-field half">
            <Text className="fe-label">来源平台</Text>
            <Picker
              mode="selector"
              range={PLATFORM_OPTIONS.map((p) => PLATFORM_LABELS[p])}
              value={platformIdx}
              onChange={(e) => setPlatformIdx(Number(e.detail.value))}
            >
              <View className="fe-input picker-value">
                {PLATFORM_LABELS[PLATFORM_OPTIONS[platformIdx]]}
              </View>
            </Picker>
          </View>
        </View>
        <View className="fe-field">
          <Text className="fe-label">简介</Text>
          <Textarea
            className="fe-textarea"
            value={summary}
            onInput={(e) => setSummary(e.detail.value)}
            placeholder="一句话介绍这家店"
            maxlength={100}
            autoHeight
          />
        </View>
      </View>

      <Button type="primary" loading={saving} onClick={handleSave}>
        保存
      </Button>
    </View>
  );
}
