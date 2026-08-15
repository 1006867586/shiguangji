// ============================================================
// 地图唤起链接生成（高德/百度/Apple 地图）
//
// 采用官方 Web URI API（https 链接）而非 native scheme：
// - 已装 App：安卓（intent）/ 鸿蒙（app linking）/ iOS（Universal
//   Link）浏览器自动唤起对应地图 App
// - 未装 App：降级打开高德/百度网页版，不白屏不报错
// - native scheme（androidamap:// 等）未装时直接失败且鸿蒙不兼容，故弃用
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
