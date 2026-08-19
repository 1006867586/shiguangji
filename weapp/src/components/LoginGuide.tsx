import { View, Text, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import "./LoginGuide.scss";

interface Props {
  /** 标题，默认「欢迎使用「飨刻」」 */
  title?: string;
  /** 副标题说明 */
  subtitle?: string;
}

/** 统一登录引导：所有页面未登录占位共用同一视觉 */
export default function LoginGuide({
  title = "欢迎使用「飨刻」",
  subtitle = "登录后同步你的收藏",
}: Props) {
  return (
    <View className="login-guide">
      <View className="login-guide-logo">🍜</View>
      <Text className="login-guide-title">{title}</Text>
      <Text className="login-guide-subtitle">{subtitle}</Text>
      <Button
        className="login-guide-btn"
        onClick={() => Taro.navigateTo({ url: "/pages/login/index" })}
      >
        微信一键登录
      </Button>
      <View
        className="login-guide-try"
        onClick={() => Taro.switchTab({ url: "/pages/roulette/index" })}
      >
        <Text>暂不登录，先体验美食转盘 →</Text>
      </View>
    </View>
  );
}
