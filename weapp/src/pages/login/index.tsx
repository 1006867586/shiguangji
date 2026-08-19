import { useCallback, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { weappLogin } from "@/utils/auth";
import { ApiError } from "@/utils/request";
import "./index.scss";

/**
 * 登录页 — 暖珊瑚渐变全屏 Hero 布局：
 * 顶部 Logo + AppName + Tagline
 * 底部微信一键登录按钮 + 主动勾选式协议
 *
 * 合规要点（微信运营规范 15.1.3.1 / 15.1.3.2）：
 * - 默认未勾选协议
 * - 未勾选时登录按钮 disabled（不得默认强制同意）
 * - 勾选后点击登录按钮 → 二次确认弹窗（明确同意 / 不同意），明示同意
 * - 拒绝后留在登录页，可通过底部「暂不登录，先体验转盘」进入转盘（工具页免登录）
 */

// 隐私政策 / 用户协议 跳转地址（与 demo 页一致，可改为 .env 注入）
const PRIVACY_URL = "https://m.zykh.top/privacy";
const AGREEMENT_URL = "https://m.zykh.top/agreement";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  /** 主动勾选（默认 false，必须由用户主动点击） */
  const [agreed, setAgreed] = useState(false);

  const openWebview = useCallback((url: string, title: string) => {
    Taro.navigateTo({
      url: `/pages/webview/index?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
    });
  }, []);

  /**
   * 点击已勾选状态下的登录按钮：
   * 1. 弹出明确的「同意 / 不同意」二次确认弹窗（满足"提供明确同意和不同意选项"）
   * 2. 用户点"同意"才真正发起登录请求
   * 3. 用户点"不同意"→ 留在登录页，可继续浏览（不退出、不强制关闭）
   */
  const confirmThenLogin = useCallback(async () => {
    const res = await Taro.showModal({
      title: "同意协议后继续",
      content: "请确认你已阅读并同意《用户协议》和《隐私政策》，是否继续登录？",
      // 微信小程序限制：confirmText / cancelText ≤ 4 个中文字符
      confirmText: "同意",
      cancelText: "拒绝",
      confirmColor: "#ff6b35",
    });
    if (!res.confirm) {
      // 拒绝：明确告知不会登录，给出转回工具页的入口提示
      Taro.showToast({ title: "已拒绝，可先体验转盘", icon: "none", duration: 1800 });
      return;
    }
    // 同意 → 真正走登录
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
  }, [loading]);

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
        <Text className="brand-name">飨刻</Text>
        <Text className="brand-slogan">聚餐不将就，点餐更轻松</Text>
      </View>

      {/* 底部操作区 */}
      <View className="action-section">
        {hint && <Text className="hint">{hint}</Text>}

        {/* 主动勾选式协议：默认未勾选，点击由用户主动控制 */}
        <View
          className="privacy-row"
          onClick={() => setAgreed((v) => !v)}
          role="checkbox"
          aria-checked={agreed}
        >
          <View className={`checkbox${agreed ? " checked" : ""}`}>
            {agreed && <Text className="checkbox-tick">✓</Text>}
          </View>
          <Text className="privacy-text">
            我已阅读并同意
            <Text
              className="privacy-link"
              onClick={(e) => {
                e.stopPropagation();
                openWebview(AGREEMENT_URL, "用户协议");
              }}
            >
              《用户协议》
            </Text>
            和
            <Text
              className="privacy-link"
              onClick={(e) => {
                e.stopPropagation();
                openWebview(PRIVACY_URL, "隐私政策");
              }}
            >
              《隐私政策》
            </Text>
          </Text>
        </View>

        <Button
          className={`btn-wechat${agreed ? "" : " disabled"}`}
          loading={loading}
          disabled={loading || !agreed}
          onClick={() => void confirmThenLogin()}
        >
          微信一键登录
        </Button>

        {/* 未勾选时给出明确提示：告诉用户为什么按钮不可点 */}
        {!agreed && (
          <Text className="privacy-tip">
            请先阅读并同意《用户协议》与《隐私政策》
          </Text>
        )}

        {/* 拒绝路径：用户可拒绝协议并直接体验核心工具（转盘），不被强制退出 */}
        <View
          className="skip-link"
          onClick={() => Taro.switchTab({ url: "/pages/roulette/index" })}
        >
          <Text>暂不同意，先体验美食转盘 →</Text>
        </View>
      </View>
    </View>
  );
}
