import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { isLoggedIn, logout } from "@/utils/auth";
import "./index.scss";

export default function ProfilePage() {
  const [logged, setLogged] = useState(isLoggedIn());

  const handleLogout = () => {
    logout();
    setLogged(false);
    Taro.showToast({ title: "已退出", icon: "none" });
  };

  const goLogin = () => Taro.navigateTo({ url: "/pages/login/index" });

  return (
    <View className="page">
      <View className="card">
        {logged ? (
          <>
            <Text className="title">我的</Text>
            <Text className="text-muted">个人主页、收藏夹、设置将在 M3 上线。</Text>
            <Button className="btn-logout" onClick={handleLogout}>
              退出登录
            </Button>
          </>
        ) : (
          <>
            <Text className="title">未登录</Text>
            <Button type="primary" onClick={goLogin}>
              微信一键登录
            </Button>
          </>
        )}
      </View>
    </View>
  );
}
