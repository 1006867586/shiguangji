import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, OpenData } from "@tarojs/components";
import { weappLogin } from "@/utils/auth";
import { ApiError } from "@/utils/request";
import "./index.scss";

/**
 * 登录页 — M1 核心链路：
 * Taro.login() 拿微信 code → POST /api/auth/weapp/login
 * → 服务端 code2Session + Supabase 会话 → 本地存 token → 回首页。
 *
 * 注意：项目真实运行前需把 weapp/project.config.json 的 appid
 * 从 "touristappid" 换成小程序后台的真实 AppID，且服务端已配置
 * WEAPP_APPID / WEAPP_SECRET。
 */
export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const handleLogin = async () => {
    if (loading) return;
    setLoading(true);
    setHint(null);
    try {
      await weappLogin();
      Taro.showToast({ title: "登录成功", icon: "success", duration: 1200 });
      setTimeout(() => Taro.switchTab({ url: "/pages/index/index" }), 600);
    } catch (err) {
      if (err instanceof ApiError && err.code === "weapp_not_configured") {
        setHint("服务端未配置 WEAPP_APPID / WEAPP_SECRET，无法登录");
      } else if (err instanceof ApiError && err.code === "code2session_failed") {
        setHint("微信校验失败：请确认 appid 与密钥匹配，且 code 未被重复使用");
      } else {
        setHint(err instanceof Error ? err.message : "登录失败，请重试");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="login-page">
      <View className="brand">
        <Text className="brand-name">想聚</Text>
        <Text className="brand-slogan">组个饭局，就这么简单</Text>
      </View>

      <Button
        className="btn-wechat"
        type="primary"
        loading={loading}
        disabled={loading}
        onClick={() => void handleLogin()}
      >
        微信一键登录
      </Button>

      <View className="avatar-row">
        <OpenData type="userAvatarUrl" />
        <OpenData type="userNickName" />
      </View>

      {hint && <Text className="hint">{hint}</Text>}

      <Text className="privacy text-muted">
        登录即代表同意用户协议与隐私政策（提审前需补充真实链接）
      </Text>
    </View>
  );
}
