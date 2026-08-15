import { useCallback, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { isLoggedIn, logout } from "@/utils/auth";
import { fetchUnreadCount } from "@/utils/api";
import "./index.scss";

/**
 * 个人中心：圈子管理 / 通知（含未读角标）/ 退出登录。
 * 个人主页与收藏夹在 M3 上线。
 */
export default function ProfilePage() {
  const [logged, setLogged] = useState(isLoggedIn());
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(async () => {
    if (!isLoggedIn()) return;
    try {
      const res = await fetchUnreadCount();
      setUnread(res?.count ?? 0);
    } catch {
      // 静默失败
    }
  }, []);

  useDidShow(() => {
    setLogged(isLoggedIn());
    void loadUnread();
  });

  const handleLogout = () => {
    logout();
    setLogged(false);
    Taro.showToast({ title: "已退出", icon: "none" });
  };

  const goLogin = () => Taro.navigateTo({ url: "/pages/login/index" });
  const goGroups = () => Taro.navigateTo({ url: "/pages/groups/index" });
  const goNotifications = () =>
    Taro.navigateTo({ url: "/pages/notifications/index" });

  if (!logged) {
    return (
      <View className="profile-page placeholder">
        <Text className="title">欢迎使用「想聚」</Text>
        <Button type="primary" onClick={goLogin}>
          微信一键登录
        </Button>
      </View>
    );
  }

  return (
    <View className="profile-page">
      <View className="menu-card">
        <View className="menu-item" onClick={goGroups}>
          <Text className="menu-icon">👥</Text>
          <Text className="menu-label">我的圈子</Text>
          <Text className="arrow">›</Text>
        </View>
        <View className="menu-item" onClick={goNotifications}>
          <Text className="menu-icon">🔔</Text>
          <Text className="menu-label">通知</Text>
          {unread > 0 && (
            <Text className="badge">{unread > 99 ? "99+" : unread}</Text>
          )}
          <Text className="arrow">›</Text>
        </View>
      </View>

      <View className="menu-card">
        <View
          className="menu-item"
          onClick={() => Taro.navigateTo({ url: "/pages/favorites/index" })}
        >
          <Text className="menu-icon">⭐</Text>
          <Text className="menu-label">收藏夹</Text>
          <Text className="arrow">›</Text>
        </View>
      </View>

      <View className="menu-card">
        <Button className="btn-logout" onClick={handleLogout}>
          退出登录
        </Button>
      </View>
    </View>
  );
}
