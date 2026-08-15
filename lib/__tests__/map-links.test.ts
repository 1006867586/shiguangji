import { describe, it, expect } from "vitest";
import {
  buildMapLinks,
  isApplePlatform,
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
