import { useCallback, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Button, Image, Input, OpenData } from "@tarojs/components";
import { isLoggedIn, logout } from "@/utils/auth";
import { setSelectedTab } from "@/custom-tab-bar/tabStore";
import {
  fetchMyProfile,
  updateMyProfile,
  type ProfileLite,
} from "@/utils/api";
import { uploadToR2 } from "@/utils/upload";
import { POINTING_APP } from "@/config/external";
import LoginGuide from "@/components/LoginGuide";
import "./index.scss";

/**
 * 个人中心 — 渐变 Hero + 菜单卡片。
 *
 * 去社交化后只保留：资料编辑 / 我的收藏 / 产品介绍 / 退出登录。
 * 移除：饭搭子、通知、未读数、动态相关入口。
 */
export default function ProfilePage() {
  const [logged, setLogged] = useState(isLoggedIn());
  const [profile, setProfile] = useState<ProfileLite | null>(null);

  // 编辑面板
  const [editing, setEditing] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const hasProfile = !!profile && !!profile.created_at;

  const loadProfile = useCallback(async () => {
    if (!isLoggedIn()) return;
    try {
      const prof = await fetchMyProfile().catch(() => null);
      if (prof) setProfile(prof);
    } catch {
      // 静默失败
    }
  }, []);

  useDidShow(() => {
    setSelectedTab(2);
    setLogged(isLoggedIn());
    void loadProfile();
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

  /** 微信原生头像选择器：e.detail.avatarUrl 为临时文件路径 */
  const onChooseAvatar = async (e: { detail: { avatarUrl: string } }) => {
    const path = e.detail.avatarUrl;
    if (!path || uploading) return;
    setUploading(true);
    Taro.showLoading({ title: "上传中…", mask: true });
    try {
      const url = await uploadToR2(path);
      // 仅更新编辑面板中的头像预览，待用户点"保存"后才统一提交落库
      setEditAvatarUrl(url);
    } catch (e) {
      // 诊断插桩：之前静默吞掉错误，无法定位"上传中但头像不显示"的根因
      console.error("[profile] uploadToR2 失败，avatarUrl:", path, e);
      Taro.showToast({ title: `头像上传失败：${e instanceof Error ? e.message : e}`, icon: "none", duration: 3000 });
    } finally {
      Taro.hideLoading();
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
  const goFavorites = () =>
    Taro.switchTab({ url: "/pages/index/index" });

  /** 跳转到专有点餐小程序 */
  const goPointing = () => {
    if (!POINTING_APP.appId) {
      Taro.showToast({ title: "去点餐功能暂未开启", icon: "none" });
      return;
    }
    Taro.navigateToMiniProgram({
      appId: POINTING_APP.appId,
      path: POINTING_APP.path,
      success: () => {
        /* 已跳转 */
      },
      fail: () => {
        Taro.showToast({ title: "跳转失败，请重试", icon: "none" });
      },
    });
  };

  if (!logged) {
    return <LoginGuide subtitle="登录后同步你的收藏" />;
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
      </View>

      {/* 编辑资料面板 */}
      {editing && (
        <View className="edit-panel">
          <View className="edit-head">
            <Text className="edit-title">编辑资料</Text>
            <Text className="edit-close" onClick={() => setEditing(false)}>关闭</Text>
          </View>

          <View className="edit-avatar-row">
            <Button
              className="avatar-choose-btn"
              openType="chooseAvatar"
              onChooseAvatar={onChooseAvatar}
            >
              <Image
                className="edit-avatar"
                src={
                  editAvatarUrl ||
                  (hasProfile && profile?.avatar_url) ||
                  "https://img.example.com/avatar-default.png"
                }
                mode="aspectFill"
              />
              <Text className="avatar-choose-tip">更换头像</Text>
            </Button>
          </View>

          <View className="edit-field">
            <Text className="edit-label">昵称</Text>
            <Input
              className="edit-input"
              type="nickname"
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
          {/* 去点餐（跳转外部专有点餐小程序） */}
          <View className="menu-item" onClick={goPointing}>
            <Text className="menu-icon">🍽️</Text>
            <Text className="menu-label">去点餐</Text>
            <Text className="menu-arrow">›</Text>
          </View>
          <View className="menu-item" onClick={openEdit}>
            <Text className="menu-icon">✏️</Text>
            <Text className="menu-label">编辑资料</Text>
            <Text className="menu-arrow">›</Text>
          </View>
          <View className="menu-item" onClick={goFavorites}>
            <Text className="menu-icon">⭐</Text>
            <Text className="menu-label">我的收藏</Text>
            <Text className="menu-arrow">›</Text>
          </View>
        </View>

        <View className="menu-card">
          <View className="menu-item logout" onClick={handleLogout}>
            <Text className="menu-icon">🚪</Text>
            <Text className="menu-label">退出登录</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
