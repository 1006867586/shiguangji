import Taro from "@tarojs/taro";
import { View, Text, Image, Button } from "@tarojs/components";
import "./index.scss";

/**
 * 飨刻 · 产品介绍页（上线审核专用）
 *
 * 内容策略：
 * - 静态展示 app 的核心功能与定位，便于审核员快速了解产品
 * - 所有文案、Logo、截图均预留替换位，后续通过 .env 注入 URL 即可
 *
 * 可替换字段（统一在下方常量集中）：
 * - APP_NAME / SLOGAN / DESCRIPTION
 * - FEATURES 列表（增删任意项即可）
 * - LOGO_URL / SCREENSHOT_URL（占位为空，上传后填入）
 * - CONTACT_EMAIL / PRIVACY_URL / AGREEMENT_URL
 * - VERSION
 */

// ---- 文案内容（审核通过后可继续微调） ----

const APP_NAME = "飨刻";

const SLOGAN = "属于你们小团体的聚餐工具";

const DESCRIPTION =
  "为小团体打造的聚餐工具。饭局打卡、照片记录、店铺收藏、美食转盘选餐厅——" +
  "解决今天吃什么，让每一顿饭都值得记住。";

const FEATURES: Array<{ emoji: string; title: string; desc: string }> = [
  {
    emoji: "👥",
    title: "饭搭子小组",
    desc: "邀请码加入，成员共享饭局记录",
  },
  {
    emoji: "📝",
    title: "饭局打卡",
    desc: "记录每一顿饭，粘贴商家链接自动解析店铺信息",
  },
  {
    emoji: "📸",
    title: "照片记录",
    desc: "成员追加照片，形成集体相册",
  },
  {
    emoji: "📌",
    title: "店铺收藏",
    desc: "收藏心仪店铺，一键加入转盘候选池",
  },
  {
    emoji: "🎯",
    title: "美食轮盘",
    desc: "随机抽取餐厅，解决「今天吃什么」难题",
  },
];

// ---- 占位资源（上线前替换为真实 URL） ----

/** Logo 图片地址；为空时显示 emoji 占位 */
const LOGO_URL = "";

/** 产品截图地址；为空时显示占位框 */
const SCREENSHOT_URL = "";

// ---- 联系方式与备案信息 ----

const CONTACT_EMAIL = "1006867586@qq.com";

/** 隐私政策页面地址（建议配置 https 域名） */
const PRIVACY_URL = "https://m.zykh.top/privacy";

/** 用户协议页面地址 */
const AGREEMENT_URL = "https://m.zykh.top/agreement";

const VERSION = "v0.3.0"; // M3 上线版本

// ---- 组件 ----

export default function DemoPage() {
  const hasLogo = LOGO_URL.length > 0;
  const hasScreenshot = SCREENSHOT_URL.length > 0;
  const hasPrivacy = PRIVACY_URL.length > 0;
  const hasAgreement = AGREEMENT_URL.length > 0;

  const openLink = (url: string, title: string) => {
    if (!url) {
      Taro.showToast({ title: `${title}链接待配置`, icon: "none" });
      return;
    }
    // 跳到小程序内置 web-view 页加载 HTTPS 链接（需在公众平台「业务域名」配 https://m.zykh.top）
    Taro.navigateTo({
      url: `/pages/webview/index?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
    });
  };

  return (
    <View className="demo-page">
      {/* Hero：Logo + APP 名 + slogan */}
      <View className="hero">
        <View className="logo placeholder">
          {hasLogo ? (
            <Image
              src={LOGO_URL}
              mode="aspectFill"
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <Text>🍽</Text>
          )}
        </View>
        <Text className="name">{APP_NAME}</Text>
        <Text className="slogan">{SLOGAN}</Text>

        {/* 进入应用按钮：switchTab 跳到打卡 tab，tabBar 正确高亮 */}
        <Button
          className="enter-btn"
          onClick={() => Taro.switchTab({ url: "/pages/index/index" })}
        >
          立即体验 →
        </Button>
      </View>

      {/* 产品简介 */}
      <View className="section">
        <View className="section-title">关于我们</View>
        <Text className="section-desc">{DESCRIPTION}</Text>
      </View>

      {/* 核心功能 */}
      <View className="section">
        <View className="section-title">核心功能</View>
        <View className="feature-list">
          {FEATURES.map((f) => (
            <View key={f.title} className="feature-item">
              <View className="emoji">
                <Text>{f.emoji}</Text>
              </View>
              <View className="body">
                <Text className="title">{f.title}</Text>
                <Text className="desc">{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* 产品截图占位 */}
        <View className="screenshot">
          {hasScreenshot ? (
            <Image
              src={SCREENSHOT_URL}
              mode="widthFix"
              style={{ width: "100%" }}
            />
          ) : (
            <View className="placeholder">
              <Text>📷</Text>
              <Text className="hint">截图占位 · 上线前替换为真实截图 URL</Text>
            </View>
          )}
        </View>
      </View>

      {/* 联系方式与备案 */}
      <View className="section">
        <View className="section-title">联系我们</View>
        <View style={{ display: "flex", flexDirection: "column", gap: "12rpx" }}>
          <Text className="section-desc">客服邮箱：{CONTACT_EMAIL}</Text>
          <Text className="section-desc">
            当前版本：{VERSION}
          </Text>

          <View style={{ display: "flex", gap: "16rpx", marginTop: "8rpx" }}>
            <Button
              size="mini"
              onClick={() => openLink(PRIVACY_URL, "隐私政策")}
            >
              隐私政策
            </Button>
            <Button
              size="mini"
              onClick={() => openLink(AGREEMENT_URL, "用户协议")}
            >
              用户协议
            </Button>
          </View>
        </View>
      </View>

      {/* 页脚 */}
      <View className="footer">
        <Text className="row">{APP_NAME} · 让每一顿饭都值得记住</Text>
        <Text className="row">© {new Date().getFullYear()} XiangKe</Text>
        {(hasPrivacy || hasAgreement) && (
          <Text className="row">
            点击查看
            {hasPrivacy ? <Text className="link"> 《隐私政策》 </Text> : null}
            {hasAgreement ? <Text className="link"> 《用户协议》 </Text> : null}
          </Text>
        )}
      </View>
    </View>
  );
}