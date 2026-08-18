import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { request, ApiError } from "@/utils/request";
import { saveSession, type WeappSession } from "@/utils/auth";
import "./index.scss";

/**
 * 确认登录页 — PC 扫码登录链路的小程序端确认页。
 *
 * 进入方式：微信扫 PC 端展示的小程序码（getwxacodeunlimit，scene=sessionId）。
 * scene 参数由微信自动写入 onLoad options（Taro 中为 router.params.scene）。
 * 点击「确认登录」→ wx.login 拿 code → POST /api/auth/weapp/confirm-login
 * → 返回 token 本地保存（小程序顺带自动登录）→ PC 端轮询命中自动登录。
 */
export default function LoginConfirmPage() {
  const [uuid, setUuid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const params = Taro.getCurrentInstance().router?.params ?? {};
    const scene = String(params.scene ?? "").trim().toLowerCase();
    if (!scene) {
      setHint("无效的登录二维码，请回到 PC 端重新生成");
    } else {
      setUuid(scene);
    }
  }, []);

  const confirm = async () => {
    if (loading || !uuid) return;
    setLoading(true);
    setHint(null);
    try {
      const { code } = await Taro.login();
      if (!code) throw new Error("未获取到微信登录凭证");
      const session = await request<WeappSession>("/api/auth/weapp/confirm-login", {
        method: "POST",
        data: { code, uuid },
        auth: false,
        silent: true,
      });
      saveSession(session);
      Taro.showToast({ title: "认证完成，PC 端即将登录", icon: "success", duration: 2000 });
      setTimeout(() => {
        Taro.navigateBack({
          fail: () => Taro.switchTab({ url: "/pages/index/index" }),
        });
      }, 800);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.code === "login_session_expired"
            ? "二维码已失效，请回到 PC 端刷新后重试"
            : err.message
          : err instanceof Error
            ? err.message
            : "认证失败，请重试";
      setHint(msg);
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) });
  };

  return (
    <View className="confirm-page">
      <View className="brand-section">
        <View className="logo">
          <Text className="logo-emoji">🍜</Text>
        </View>
        <Text className="brand-name">飨刻</Text>
        <Text className="brand-slogan">确认登录 PC 端</Text>
      </View>

      <View className="action-section">
        <Text className="desc">你在电脑上请求了微信登录，请确认是本人在操作</Text>
        {hint && <Text className="hint">{hint}</Text>}
        <Button
          className="btn-confirm"
          loading={loading}
          disabled={loading || !uuid}
          onClick={() => void confirm()}
        >
          确认登录
        </Button>
        <Button className="btn-cancel" disabled={loading} onClick={goBack}>
          取消
        </Button>
      </View>
    </View>
  );
}
