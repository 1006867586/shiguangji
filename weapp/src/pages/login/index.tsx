import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { weappLogin } from "@/utils/auth";
import { ApiError } from "@/utils/request";
import "./index.scss";

/**
 * 登录页 — 暖珊瑚渐变全屏 Hero 布局：
 * 顶部 Logo + AppName + Tagline
 * 底部微信一键登录按钮 + 协议文本
 */

// 隐私政策 / 用户协议 跳转地址（与 demo 页一致，可改为 .env 注入）
const PRIVACY_URL = "https://m.zykh.top/privacy";
const AGREEMENT_URL = "https://m.zykh.top/agreement";

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

  const openWebview = (url: string, title: string) => {
    Taro.navigateTo({
      url: `/pages/webview/index?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
    });
  };

  return (
    <View className="login-page">
      {/* 顶部品牌区 */}
      <View className="brand-section">
        <View className="logo">
          {/* 碗 + 蒸汽 图标 */}
          <View className="logo-icon">
            <Text className="logo-emoji">🍜</Text>
          </View>
        </View>
        <Text className="brand-name">想聚</Text>
        <Text className="brand-slogan">聚餐不纠结，点餐更轻松</Text>
      </View>

      {/* 底部操作区 */}
      <View className="action-section">
        {hint && <Text className="hint">{hint}</Text>}

        <Button
          className="btn-wechat"
          loading={loading}
          disabled={loading}
          onClick={() => void handleLogin()}
        >
          微信一键登录
        </Button>

        <View className="privacy">
          登录即同意
          <Text
            className="privacy-link"
            onClick={() => openWebview(AGREEMENT_URL, "用户协议")}
          >
            《用户协议》
          </Text>
          和
          <Text
            className="privacy-link"
            onClick={() => openWebview(PRIVACY_URL, "隐私政策")}
          >
            《隐私政策》
          </Text>
        </View>
      </View>
    </View>
  );
}
