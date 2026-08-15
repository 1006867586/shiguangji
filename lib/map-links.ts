// ============================================================
// 地图唤起链接生成与 App 直接唤起（高德/百度/Apple 地图）
//
// 双通道策略：
// 1. 原生 scheme / intent（第一优先级，直接唤起 App）：
//    - Android：intent:// URL（含 package + browser_fallback_url），
//      Chrome/华为/小米/UC 等主流浏览器直接唤起，未装时自动落到 fallback
//    - iOS：iosamap:// / baidumap:// scheme，页面失焦即成功；
//      1.8s 后页面仍可见则跳转网页版兜底
//    - HarmonyOS 2-4（Android 内核）：走 Android intent 路径
// 2. Web URI API（https，兜底/桌面/微信）：
//    鸿蒙 NEXT 浏览器与微信内置浏览器屏蔽外部 scheme，直接进网页版
// ============================================================

/** URI API 来源标识（高德 src / 百度 src 统计用） */
export const MAP_SOURCE_ID = "xiangke";

export interface MapLinkInput {
  /** 店铺名（有名称时高德/百度按名称搜索命中更准） */
  name?: string | null;
  address?: string | null;
  /** 城市名，限定检索范围，减少异地同名店误匹配 */
  city?: string | null;
}

export interface MapLinks {
  /** 高德地图 URI API（安卓/鸿蒙/iOS 均可唤起或打开网页版） */
  amap: string;
  /** 百度地图 URI API（安卓/鸿蒙/iOS 均可唤起或打开网页版） */
  baidu: string;
  /**
   * Apple 地图（仅 iOS/iPadOS 有意义；非苹果设备打开是错误页，
   * UI 层应配合 isApplePlatform() 按需展示）
   */
  apple: string;
}

/** 客户端运行平台（决定唤起策略） */
export type MapPlatform = "ios" | "android" | "harmony" | "other";

export type MapProvider = "amap" | "baidu" | "apple";

/** openMapApp 的执行结果，调用方据此决定提示文案 */
export type OpenMapResult =
  /** 已尝试唤起 App（未装时由浏览器/超时兜底到网页版） */
  | "app"
  /** 微信内：scheme 被屏蔽，已直接打开网页版 */
  | "wechat"
  /** 桌面/其他：已直接打开网页版 */
  | "web";

/**
 * 生成三平台地图唤起链接。
 * 名称地址均缺时返回 null，调用方不渲染入口。
 */
export function buildMapLinks(input: MapLinkInput): MapLinks | null {
  const name = input.name?.trim() || "";
  const address = input.address?.trim() || "";
  const city = input.city?.trim() || "";

  if (!name && !address) return null;

  // 高德/百度：有店铺名按名搜（命中店铺 POI），否则按地址搜
  const keyword = name || address;
  const appleQuery = name ? (address ? `${name} ${address}` : name) : address;

  const amap = new URL("https://uri.amap.com/search");
  amap.searchParams.set("keyword", keyword);
  if (city) amap.searchParams.set("city", city);
  amap.searchParams.set("src", MAP_SOURCE_ID);

  const baidu = new URL("https://api.map.baidu.com/place/search");
  baidu.searchParams.set("query", keyword);
  // 百度 region 必填，未知城市退化为全国检索
  baidu.searchParams.set("region", city || "全国");
  baidu.searchParams.set("output", "html");
  baidu.searchParams.set("src", MAP_SOURCE_ID);

  const apple = new URL("https://maps.apple.com/");
  apple.searchParams.set("q", appleQuery);

  return {
    amap: amap.toString(),
    baidu: baidu.toString(),
    apple: apple.toString(),
  };
}

/**
 * 是否苹果移动平台（iPhone/iPad/iPod 或 iPadOS 桌面 UA + 触屏）。
 * 用于决定是否展示 Apple 地图入口；真 Mac 不展示。
 */
export function isApplePlatform(
  userAgent: string,
  maxTouchPoints = 0
): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  // iPadOS 13+ 默认桌面 UA，靠「Macintosh + 多点触控」识别
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/**
 * 识别客户端平台（决定唤起策略）。
 * - harmony：鸿蒙 NEXT 原生浏览器（UA 含 OpenHarmony / HarmonyOS 且无 Android）
 * - android：安卓与鸿蒙 2-4（Android 内核，UA 含 Android）
 * - ios：iPhone/iPad/iPod 或 iPadOS 桌面 UA + 触屏
 */
export function detectMapPlatform(
  userAgent: string,
  maxTouchPoints = 0
): MapPlatform {
  // 鸿蒙 2-4 的 UA 同时含 HarmonyOS 与 Android，属 Android 内核走 android
  if (/OpenHarmony/i.test(userAgent)) return "harmony";
  if (/HarmonyOS/i.test(userAgent) && !/Android/i.test(userAgent)) {
    return "harmony";
  }
  if (isApplePlatform(userAgent, maxTouchPoints)) return "ios";
  if (/Android|Adr/i.test(userAgent)) return "android";
  return "other";
}

// ------------------------------------------------------------
// 原生 scheme 构造（官方协议）
// ------------------------------------------------------------

function encodeParam(value: string): string {
  return encodeURIComponent(value);
}

/** 高德 Android：关键词搜索并进入导航（官方 keywordNavi，V5.0.0+） */
export function buildAmapAndroidScheme(input: MapLinkInput): string | null {
  const keyword = input.name?.trim() || input.address?.trim() || "";
  if (!keyword) return null;
  return `androidamap://keywordNavi?sourceApplication=${encodeParam(
    MAP_SOURCE_ID
  )}&keyword=${encodeParam(keyword)}`;
}

/** 高德 iOS：按名称搜索 POI（官方 iosamap://poi，V5.1.0+） */
export function buildAmapIosScheme(input: MapLinkInput): string | null {
  const keyword = input.name?.trim() || input.address?.trim() || "";
  if (!keyword) return null;
  return `iosamap://poi?sourceApplication=${encodeParam(
    MAP_SOURCE_ID
  )}&name=${encodeParam(keyword)}`;
}

/** 百度双端：地点检索（官方 baidumap://map/place/search） */
export function buildBaiduScheme(input: MapLinkInput): string | null {
  const keyword = input.name?.trim() || input.address?.trim() || "";
  const city = input.city?.trim() || "全国";
  if (!keyword) return null;
  return `baidumap://map/place/search?query=${encodeParam(
    keyword
  )}&region=${encodeParam(city)}&src=${encodeParam(MAP_SOURCE_ID)}`;
}

/**
 * 将 scheme URL 转为 Android intent:// URL。
 * Chrome 系浏览器：已装 App 直接唤起；未装时自动打开 browser_fallback_url，
 * 全程无报错弹窗。
 */
export function toAndroidIntent(
  schemeUrl: string,
  packageName: string,
  fallbackUrl: string
): string {
  const withoutScheme = schemeUrl.replace(/^[a-zA-Z0-9+.-]+:\/\//, "");
  return `intent://${withoutScheme}#Intent;scheme=${schemeUrl.slice(
    0,
    schemeUrl.indexOf("://")
  )};package=${packageName};S.browser_fallback_url=${encodeParam(
    fallbackUrl
  )};end`;
}

// ------------------------------------------------------------
// 唤起编排（仅客户端调用）
// ------------------------------------------------------------

/** App 安装包名（Android intent 用） */
const ANDROID_PACKAGES: Record<Exclude<MapProvider, "apple">, string> = {
  amap: "com.autonavi.minimap",
  baidu: "com.baidu.BaiduMap",
};

/**
 * 尝试打开 target（scheme / intent URL）；超时后页面仍可见说明 App 未唤起，
 * 跳转 fallback（网页版）兜底。App 成功唤起时页面失焦（visibilitychange /
 * pagehide），取消兜底。
 */
function openUrlWithFallback(target: string, fallback: string, timeoutMs = 1800): void {
  let settled = false;
  let timer = 0;

  const cleanup = () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onHide);
  };
  const onHide = () => {
    settled = true;
    cleanup();
  };
  const onVisibility = () => {
    if (document.hidden) onHide();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onHide);

  timer = window.setTimeout(() => {
    if (settled || document.hidden) return;
    cleanup();
    // 页面仍可见 = App 未唤起 → 网页版兜底
    window.location.href = fallback;
  }, timeoutMs);

  window.location.href = target;
}

/**
 * 打开地图：优先直接唤起 App，未装/被屏蔽时降级网页版。
 * 仅可在客户端调用（依赖 navigator/document）。
 *
 * @returns 执行结果（"wechat" 时调用方应提示用户用系统浏览器打开）
 */
export function openMapApp(
  provider: MapProvider,
  input: MapLinkInput
): OpenMapResult | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }

  const links = buildMapLinks(input);
  if (!links) return null;

  const ua = navigator.userAgent;
  const platform = detectMapPlatform(ua, navigator.maxTouchPoints ?? 0);

  // Apple 地图：https 链接在 iOS 上由系统 Universal Link 直接唤起
  if (provider === "apple") {
    window.open(links.apple, "_blank", "noopener");
    return "app";
  }

  const webUrl = provider === "amap" ? links.amap : links.baidu;

  // 微信/企业微信内置浏览器屏蔽一切外部 scheme：直接进网页版，
  // 由调用方提示「用浏览器打开本页后可唤起 App」
  if (/MicroMessenger|WeChat/i.test(ua)) {
    window.open(webUrl, "_blank", "noopener");
    return "wechat";
  }

  if (platform === "ios") {
    const scheme =
      provider === "amap" ? buildAmapIosScheme(input) : buildBaiduScheme(input);
    if (scheme) {
      openUrlWithFallback(scheme, webUrl);
      return "app";
    }
  }

  if (platform === "android") {
    const scheme =
      provider === "amap" ? buildAmapAndroidScheme(input) : buildBaiduScheme(input);
    if (scheme) {
      const intent = toAndroidIntent(
        scheme,
        ANDROID_PACKAGES[provider],
        webUrl
      );
      openUrlWithFallback(intent, webUrl);
      return "app";
    }
  }

  // 鸿蒙 NEXT / 桌面 / scheme 无法构造：网页版（自带「打开App」引导）
  window.open(webUrl, "_blank", "noopener");
  return "web";
}
