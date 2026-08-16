import { useCallback, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Button, Image, Input, OpenData } from "@tarojs/components";
import { isLoggedIn, logout } from "@/utils/auth";
import { setSelectedTab } from "@/custom-tab-bar/tabStore";
import {
  fetchUnreadCount,
  fetchGroups,
  fetchMyProfile,
  updateMyProfile,
  type ProfileLite,
} from "@/utils/api";
import { uploadToR2 } from "@/utils/upload";
import "./index.scss";

/**
 * 个人中心 — 渐变 Hero + 统计数据 + 菜单卡片。
 * 昵称/头像：已编辑过后端资料则显示后端值，否则回退微信 OpenData。
 */
export default function ProfilePage() {
  const [logged, setLogged] = useState(isLoggedIn());
  const [unread, setUnread] = useState(0);
  const [groupCount, setGroupCount] = useState(0);
  // 后端资料（null=未加载；created_at 为空表示从未编辑过）
  const [profile, setProfile] = useState<ProfileLite | null>(null);

  // 编辑面板
  const [editing, setEditing] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const hasProfile = !!profile && !!profile.created_at;

  const loadStats = useCallback(async () => {
    if (!isLoggedIn()) return;
    try {
      const [unreadRes, groups, prof] = await Promise.all([
        fetchUnreadCount().catch(() => null),
        fetchGroups().catch(() => null),
        fetchMyProfile().catch(() => null),
      ]);
      if (unreadRes) setUnread(unreadRes.count ?? 0);
      if (groups) setGroupCount(groups.length);
      if (prof) setProfile(prof);
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

  // ---- 编辑资料 ----
  const openEdit = () => {
    setEditNickname(hasProfile ? (profile?.nickname ?? "") : "");
    setEditAvatarUrl(hasProfile ? (profile?.avatar_url ?? "") : "");
    setEditing(true);
  };

  const chooseAvatar = async () => {
    if (uploading) return;
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
      });
      const path = res.tempFilePaths[0];
      if (!path) return;
      setUploading(true);
      Taro.showLoading({ title: "上传中…", mask: true });
      const url = await uploadToR2(path);
      setEditAvatarUrl(url);
      Taro.hideLoading();
    } catch {
      Taro.hideLoading();
      // 用户取消或上传失败
    } finally {
      setUploading(false);
    }
  };

  const saveEdit = async () => {
    if (saving) return;
    const nickname = editNickname.trim();
    if (!nickname) {
      Taro.showToast({ title: "昵称不能为空", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      const updated = await updateMyProfile({
        nickname,
        avatarUrl: editAvatarUrl || null,
      });
      setProfile(updated);
      setEditing(false);
      Taro.showToast({ title: "已保存", icon: "success" });
    } catch {
      // request 层已 toast
    } finally {
      setSaving(false);
    }
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
          {hasProfile && profile?.avatar_url ? (
            <Image className="hero-avatar-img" src={profile.avatar_url} mode="aspectFill" />
          ) : (
            <OpenData type="userAvatarUrl" />
          )}
        </View>
        <View className="hero-name">
          {hasProfile ? profile?.nickname || "用户" : <OpenData type="userNickName" />}
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

      {/* 编辑资料面板 */}
      {editing && (
        <View className="edit-panel">
          <View className="edit-head">
            <Text className="edit-title">编辑资料</Text>
            <Text className="edit-close" onClick={() => setEditing(false)}>关闭</Text>
          </View>

          <View className="edit-avatar-row">
            <Image
              className="edit-avatar"
              src={
                editAvatarUrl ||
                (hasProfile && profile?.avatar_url) ||
                "https://img.example.com/avatar-default.png"
              }
              mode="aspectFill"
            />
            <Button
              size="mini"
              className="edit-avatar-btn"
              loading={uploading}
              disabled={uploading}
              onClick={() => void chooseAvatar()}
            >
              更换头像
            </Button>
          </View>

          <View className="edit-field">
            <Text className="edit-label">昵称</Text>
            <Input
              className="edit-input"
              value={editNickname}
              placeholder="输入昵称"
              maxlength={20}
              onInput={(e) => setEditNickname(e.detail.value)}
            />
          </View>

          <View className="edit-actions">
            <Button size="mini" onClick={() => setEditing(false)}>取消</Button>
            <Button
              size="mini"
              type="primary"
              loading={saving}
              disabled={saving}
              onClick={() => void saveEdit()}
            >
              保存
            </Button>
          </View>
        </View>
      )}

      {/* 菜单卡片 */}
      <View className="menu-section">
        <View className="menu-card">
          <View className="menu-item" onClick={openEdit}>
            <Text className="menu-icon">✏️</Text>
            <Text className="menu-label">编辑资料</Text>
            <Text className="menu-arrow">›</Text>
          </View>
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
