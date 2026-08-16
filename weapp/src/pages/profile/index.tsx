import { useCallback, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Button, OpenData } from "@tarojs/components";
import { isLoggedIn, logout } from "@/utils/auth";
import { setSelectedTab } from "@/custom-tab-bar/tabStore";
import { fetchUnreadCount, fetchGroups } from "@/utils/api";
import "./index.scss";

/**
 * 个人中心 — 暖珊瑚渐变 Hero + 统计数据 + 菜单卡片。
 */
export default function ProfilePage() {
  const [logged, setLogged] = useState(isLoggedIn());
  const [unread, setUnread] = useState(0);
  const [groupCount, setGroupCount] = useState(0);

  const loadStats = useCallback(async () => {
    if (!isLoggedIn()) return;
    try {
      const [unreadRes, groups] = await Promise.all([
        fetchUnreadCount().catch(() => null),
        fetchGroups().catch(() => null),
      ]);
      if (unreadRes) setUnread(unreadRes.count ?? 0);
      if (groups) setGroupCount(groups.length);
    } catch {
      // 静默失败
    }
  }, []);

  useDidShow(() => {
    setSelectedTab(4);
    setLogged(isLoggedIn());
    void loadStats();
  });

  const handleLogout = () => {
    logout();
    setLogged(false);
    Taro.showToast({ title: "已退出", icon: "none" });
  };

  const goLogin = () => Taro.navigateTo({ url: "/pages/login/index" });
  const goGroups = () => Taro.switchTab({ url: "/pages/groups/index" });
  const goNotifications = () =>
    Taro.navigateTo({ url: "/pages/notifications/index" });
  const goFavorites = () =>
    Taro.navigateTo({ url: "/pages/favorites/index" });

  if (!logged) {
    return (
      <View className="profile-page placeholder">
        <View className="placeholder-logo">🍜</View>
        <Text className="placeholder-title">欢迎使用「飨刻」</Text>
        <Text className="text-muted">登录后开启你的聚餐社交</Text>
        <Button className="btn-login" onClick={goLogin}>
          微信一键登录
        </Button>
      </View>
    );
  }

  return (
    <View className="profile-page has-tabbar">
      {/* 渐变 Hero 区 */}
      <View className="hero">
        <View className="hero-avatar">
          <OpenData type="userAvatarUrl" />
        </View>
        <View className="hero-name">
          <OpenData type="userNickName" />
        </View>
        <View className="hero-stats">
          <View className="stat-item">
            <Text className="stat-num">{groupCount}</Text>
            <Text className="stat-label">圈子</Text>
          </View>
          <View className="stat-divider" />
          <View className="stat-item" onClick={goNotifications}>
            <Text className="stat-num">{unread > 0 ? unread : 0}</Text>
            <Text className="stat-label">通知</Text>
          </View>
          <View className="stat-divider" />
          <View className="stat-item" onClick={goFavorites}>
            <Text className="stat-num">★</Text>
            <Text className="stat-label">收藏</Text>
          </View>
        </View>
      </View>

      {/* 菜单卡片 */}
      <View className="menu-section">
        <View className="menu-card">
          <View className="menu-item" onClick={goGroups}>
            <Text className="menu-icon">👥</Text>
            <Text className="menu-label">我的圈子</Text>
            {unread > 0 && (
              <Text className="menu-badge">{unread > 99 ? "99+" : unread}</Text>
            )}
            <Text className="menu-arrow">›</Text>
          </View>
          <View className="menu-item" onClick={goNotifications}>
            <Text className="menu-icon">🔔</Text>
            <Text className="menu-label">通知中心</Text>
            {unread > 0 && (
              <Text className="menu-badge">{unread > 99 ? "99+" : unread}</Text>
            )}
            <Text className="menu-arrow">›</Text>
          </View>
          <View className="menu-item" onClick={goFavorites}>
            <Text className="menu-icon">⭐</Text>
            <Text className="menu-label">我的收藏</Text>
            <Text className="menu-arrow">›</Text>
          </View>
        </View>

        <View className="menu-card">
          <View
            className="menu-item"
            onClick={() => Taro.navigateTo({ url: "/pages/demo/index" })}
          >
            <Text className="menu-icon">📖</Text>
            <Text className="menu-label">产品介绍</Text>
            <Text className="menu-arrow">›</Text>
          </View>
          <View className="menu-item logout" onClick={handleLogout}>
            <Text className="menu-icon">🚪</Text>
            <Text className="menu-label">退出登录</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
