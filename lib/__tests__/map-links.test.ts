import { describe, it, expect, vi } from "vitest";
import {
  buildMapLinks,
  isApplePlatform,
  detectMapPlatform,
  buildAmapAndroidScheme,
  buildAmapIosScheme,
  buildBaiduScheme,
  toAndroidIntent,
  openMapApp,
  MAP_SOURCE_ID,
} from "@/lib/map-links";

/** 与实现同风格的 query 编码（URLSearchParams：空格→+，括号→%28%29） */
function q(value: string): string {
  return new URLSearchParams({ v: value }).toString().slice(2);
}

// ============================================================
// lib/map-links.ts 地图唤起链接生成测试
// 采用官方 Web URI API（https），三平台兼容：
// - 已装 App：浏览器自动唤起高德/百度/Apple 地图 App
// - 未装 App：降级打开网页版（高德/百度）或 App Store 页
// ============================================================

describe("buildMapLinks", () => {
  it("有名称和地址：高德/百度用店铺名搜索，Apple 用名称+地址", () => {
    const links = buildMapLinks({
      name: "雾都小馆",
      address: "江岸区云林街14号1楼2号",
    });

    // 高德 URI API：keyword 为店铺名
    expect(links.amap).toBe(
      `https://uri.amap.com/search?keyword=${q("雾都小馆")}&src=${MAP_SOURCE_ID}`
    );

    // 百度 URI API：query 为店铺名，region 未提供时全国
    expect(links.baidu).toBe(
      `https://api.map.baidu.com/place/search?query=${q(
        "雾都小馆"
      )}&region=${q("全国")}&output=html&src=${MAP_SOURCE_ID}`
    );

    // Apple Maps：q 为名称+地址（自动地理编码）
    expect(links.apple).toBe(`https://maps.apple.com/?q=${q("雾都小馆 江岸区云林街14号1楼2号")}`);
  });

  it("提供 city 时限定高德 city 与百度 region", () => {
    const links = buildMapLinks({
      name: "海底捞火锅(望京店)",
      address: "阜通东大街6号",
      city: "北京市",
    });

    expect(links.amap).toContain(`city=${q("北京市")}`);
    expect(links.baidu).toContain(`region=${q("北京市")}`);
  });

  it("只有地址无名称：全部退化为地址搜索", () => {
    const links = buildMapLinks({ name: null, address: "恩施街10号" });

    expect(links.amap).toContain(`keyword=${q("恩施街10号")}`);
    expect(links.baidu).toContain(`query=${q("恩施街10号")}`);
    expect(links.apple).toContain(`q=${q("恩施街10号")}`);
  });

  it("名称地址均缺：返回 null（调用方不渲染入口）", () => {
    expect(buildMapLinks({ name: null, address: null })).toBeNull();
    expect(buildMapLinks({ name: "", address: "" })).toBeNull();
    expect(buildMapLinks({ name: "  ", address: "  " })).toBeNull();
  });

  it("地址带特殊字符需正确 URL 编码", () => {
    const links = buildMapLinks({
      name: "老王家&儿子烧烤(总店)",
      address: "中山路#88号?",
    });
    expect(links.amap).toContain(`keyword=${q("老王家&儿子烧烤(总店)")}`);
    // 裸 # 会被当作 fragment 截断 query，必须编码为 %23；? 同理
    expect(links.apple).toContain("%2388");
    expect(links.apple).not.toMatch(/#\d/);
    expect(decodeURIComponent(links.apple)).toContain("老王家&儿子烧烤(总店)");
  });
});

describe("isApplePlatform", () => {
  it("iPhone / iPad / iPod UA 返回 true", () => {
    expect(
      isApplePlatform(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
      )
    ).toBe(true);
    expect(
      isApplePlatform("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)")
    ).toBe(true);
    expect(isApplePlatform("Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0)")).toBe(
      true
    );
  });

  it("iPadOS 13+ 桌面 UA（Macintosh + 触屏）返回 true", () => {
    expect(
      isApplePlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        2
      )
    ).toBe(true);
  });

  it("真 Mac（无触屏）返回 false", () => {
    expect(
      isApplePlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        0
      )
    ).toBe(false);
  });

  it("安卓 / 鸿蒙 / Windows 返回 false", () => {
    expect(
      isApplePlatform(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"
      )
    ).toBe(false);
    expect(
      isApplePlatform(
        "Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36"
      )
    ).toBe(false);
    expect(isApplePlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      false
    );
  });
});

describe("detectMapPlatform", () => {
  it("安卓 UA → android", () => {
    expect(
      detectMapPlatform(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile"
      )
    ).toBe("android");
  });

  it("鸿蒙 2-4（Android 内核 + HarmonyOS 标识）→ android", () => {
    expect(
      detectMapPlatform(
        "Mozilla/5.0 (Linux; Android 12; ELS-AN00; HarmonyOS) AppleWebKit/537.36 HuaweiBrowser/13 Mobile"
      )
    ).toBe("android");
  });

  it("鸿蒙 NEXT（OpenHarmony，无 Android）→ harmony", () => {
    expect(
      detectMapPlatform(
        "Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 ArkWeb Mobile"
      )
    ).toBe("harmony");
  });

  it("iPhone / iPadOS 桌面 UA → ios", () => {
    expect(
      detectMapPlatform(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
      )
    ).toBe("ios");
    expect(
      detectMapPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        5
      )
    ).toBe("ios");
  });

  it("桌面 Windows / 真 Mac → other", () => {
    expect(
      detectMapPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    ).toBe("other");
    expect(
      detectMapPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        0
      )
    ).toBe("other");
  });
});

describe("原生 scheme 构造", () => {
  it("高德 Android：keywordNavi + keyword 编码", () => {
    const scheme = buildAmapAndroidScheme({
      name: "雾都小馆",
      address: "江岸区云林街14号",
    });
    expect(scheme).toBe(
      `androidamap://keywordNavi?sourceApplication=${MAP_SOURCE_ID}&keyword=${encodeURIComponent(
        "雾都小馆"
      )}`
    );
  });

  it("高德 iOS：poi + name 编码", () => {
    const scheme = buildAmapIosScheme({ name: "海底捞(望京店)", address: null });
    expect(scheme).toBe(
      `iosamap://poi?sourceApplication=${MAP_SOURCE_ID}&name=${encodeURIComponent(
        "海底捞(望京店)"
      )}`
    );
  });

  it("百度双端：place/search + query/region 编码", () => {
    const scheme = buildBaiduScheme({
      name: "雾都小馆",
      address: null,
      city: "武汉",
    });
    expect(scheme).toBe(
      `baidumap://map/place/search?query=${encodeURIComponent(
        "雾都小馆"
      )}&region=${encodeURIComponent("武汉")}&src=${MAP_SOURCE_ID}`
    );
  });

  it("只有地址无名称：keyword 退化为地址", () => {
    expect(buildAmapAndroidScheme({ name: "", address: "中山路88号" })).toContain(
      `keyword=${encodeURIComponent("中山路88号")}`
    );
  });

  it("名称地址均缺：返回 null", () => {
    expect(buildAmapAndroidScheme({ name: null, address: null })).toBeNull();
    expect(buildAmapIosScheme({ name: null, address: "" })).toBeNull();
    expect(buildBaiduScheme({ name: "", address: null })).toBeNull();
  });
});

describe("toAndroidIntent", () => {
  it("scheme → intent://（含 package 与 browser_fallback_url）", () => {
    const scheme = `androidamap://keywordNavi?keyword=${encodeURIComponent(
      "雾都小馆"
    )}`;
    const intent = toAndroidIntent(
      scheme,
      "com.autonavi.minimap",
      "https://uri.amap.com/search?keyword=x"
    );
    expect(intent).toMatch(/^intent:\/\//);
    expect(intent).toContain("#Intent;scheme=androidamap;");
    expect(intent).toContain("package=com.autonavi.minimap;");
    expect(intent).toContain(
      `S.browser_fallback_url=${encodeURIComponent(
        "https://uri.amap.com/search?keyword=x"
      )}`
    );
    expect(intent.endsWith(";end")).toBe(true);
    // 原 scheme 的 query 部分保留在 intent 路径中
    expect(intent).toContain(
      `keywordNavi?keyword=${encodeURIComponent("雾都小馆")}`
    );
  });

  it("百度 scheme 同样可转换", () => {
    const intent = toAndroidIntent(
      "baidumap://map/place/search?query=a",
      "com.baidu.BaiduMap",
      "https://map.baidu.com"
    );
    expect(intent).toContain("scheme=baidumap;");
    expect(intent).toContain("package=com.baidu.BaiduMap;");
  });
});

describe("openMapApp（唤起编排）", () => {
  const ORIGINAL_UA = window.navigator.userAgent;
  const setUa = (ua: string) => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: ua,
      configurable: true,
    });
  };
  const restoreUa = () => setUa(ORIGINAL_UA);

  it("无 window（SSR）→ 返回 null", () => {
    const w = globalThis.window;
    // @ts-expect-error 模拟服务端无 window
    delete globalThis.window;
    try {
      expect(openMapApp("amap", { name: "x", address: "y" })).toBeNull();
    } finally {
      globalThis.window = w;
    }
  });

  it("微信内置浏览器 → 屏蔽 scheme，直接打开网页版并返回 wechat", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    setUa(
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 MicroMessenger/8.0.49"
    );
    try {
      const result = openMapApp("amap", { name: "雾都小馆", address: "x" });
      expect(result).toBe("wechat");
      expect(open).toHaveBeenCalledWith(
        expect.stringContaining("https://uri.amap.com/search"),
        "_blank",
        "noopener"
      );
    } finally {
      open.mockRestore();
      restoreUa();
    }
  });

  it("桌面 UA → 网页版，返回 web", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    setUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    try {
      const result = openMapApp("baidu", { name: "雾都小馆", address: "x" });
      expect(result).toBe("web");
      expect(open).toHaveBeenCalledWith(
        expect.stringContaining("https://api.map.baidu.com/place/search"),
        "_blank",
        "noopener"
      );
    } finally {
      open.mockRestore();
      restoreUa();
    }
  });
});
