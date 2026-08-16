import { useCallback, useState } from "react";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import {
  fetchFavoritePlaces,
  deleteFavoritePlace,
  PLATFORM_LABELS,
  type FavoritePlace,
} from "@/utils/api";
import { formatRelativeTime } from "@/utils/time";
import "./index.scss";

/**
 * 收藏夹列表页。
 * 卡片展示店铺信息，点卡片发起聚餐（跳发布页带链接参数），
 * 编辑跳编辑页，删除为乐观删除 + 失败恢复。
 */
export default function FavoritesPage() {
  const [list, setList] = useState<FavoritePlace[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await fetchFavoritePlaces());
    } catch {
      setList([]);
      Taro.showToast({ title: "加载失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void load();
  });

  usePullDownRefresh(async () => {
    try {
      setList(await fetchFavoritePlaces());
    } finally {
      Taro.stopPullDownRefresh();
    }
  });

  const goImport = () =>
    Taro.navigateTo({ url: "/pages/favorites-import/index" });

  const goEdit = (p: FavoritePlace) => {
    Taro.navigateTo({ url: `/pages/favorite-edit/index?id=${p.id}` });
  };

  const handleDelete = (p: FavoritePlace) => {
    Taro.showModal({
      title: "删除收藏",
      content: `确定删除「${p.title}」吗？`,
      confirmText: "删除",
      confirmColor: "#ef4444",
      success: async (res) => {
        if (!res.confirm) return;
        const backup = list;
        setList((prev) => prev?.filter((x) => x.id !== p.id) ?? null);
        try {
          await deleteFavoritePlace(p.id);
          Taro.showToast({ title: "已删除", icon: "success" });
        } catch {
          setList(backup);
          // request 层已 toast
        }
      },
    });
  };

  // 发起聚餐：标题/地址带去发布页（发布页 link 解析草稿）
  const startDinner = (p: FavoritePlace) => {
    const query = [
      `title=${encodeURIComponent(p.title)}`,
      p.address ? `address=${encodeURIComponent(p.address)}` : "",
    ]
      .filter(Boolean)
      .join("&");
    // publish 是 tabBar 页：navigateTo 无法打开 tab 页，switchTab 不能带参，
    // 用 reLaunch（可带参数打开 tab 页）
    Taro.reLaunch({ url: `/pages/publish/index?${query}` });
  };

  const callStore = (p: FavoritePlace) => {
    if (!p.phone) return;
    Taro.makePhoneCall({ phoneNumber: p.phone }).catch(() => {});
  };

  return (
    <View className="fav-page">
      <View className="import-bar">
        <Button size="mini" type="primary" onClick={goImport}>
          📷 截图导入收藏
        </Button>
      </View>

      {loading && list === null && (
        <View className="state">
          <Text className="text-muted">加载中…</Text>
        </View>
      )}

      {list && list.length === 0 && (
        <View className="state">
          <Text className="title-sm">收藏夹还是空的</Text>
          <Text className="text-muted">
            截一张美团/点评收藏页，智能帮你整理进来
          </Text>
        </View>
      )}

      {list?.map((p) => (
        <View key={p.id} className="fav-card">
          <View className="fav-main" onClick={() => startDinner(p)}>
            <View className="fav-title-row">
              <Text className="fav-title">{p.title}</Text>
              {p.rating != null && (
                <Text className="fav-rating">★ {p.rating}</Text>
              )}
            </View>
            {p.summary && <Text className="fav-summary">{p.summary}</Text>}
            {p.address && (
              <View className="fav-line">
                <Text className="fav-icon">📍</Text>
                <Text className="fav-text">{p.address}</Text>
              </View>
            )}
            <View className="fav-line">
              <Text className="fav-icon">🏷</Text>
              <Text className="fav-text">
                {[
                  PLATFORM_LABELS[p.platform],
                  p.category,
                  p.price,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            {p.signature_dishes && p.signature_dishes.length > 0 && (
              <View className="fav-tags">
                {p.signature_dishes.slice(0, 4).map((d, i) => (
                  <Text key={i} className="fav-tag">
                    {d}
                  </Text>
                ))}
              </View>
            )}
            <Text className="fav-time">{formatRelativeTime(p.created_at)}</Text>
          </View>

          <View className="fav-actions">
            {p.phone && (
              <Button size="mini" onClick={() => callStore(p)}>
                电话
              </Button>
            )}
            <Button size="mini" type="primary" onClick={() => startDinner(p)}>
              发起聚餐
            </Button>
            <Button size="mini" onClick={() => goEdit(p)}>
              编辑
            </Button>
            <Button size="mini" className="btn-danger" onClick={() => handleDelete(p)}>
              删除
            </Button>
          </View>
        </View>
      ))}
    </View>
  );
}
