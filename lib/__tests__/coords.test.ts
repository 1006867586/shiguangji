import { describe, it, expect } from "vitest";
import { gcj02ToWgs84, wgs84ToGcj02 } from "@/lib/poi/coords";

// ============================================================
// lib/poi/coords.ts 坐标系转换测试
// ============================================================

describe("gcj02ToWgs84", () => {
  it("与 wgs84ToGcj02 互为往返（中国境内误差 <1m）", () => {
    const samples: Array<[number, number]> = [
      [114.3054, 30.5931], // 武汉
      [121.4737, 31.2304], // 上海
      [116.3975, 39.9088], // 北京
      [113.2644, 23.1291], // 广州
    ];
    for (const [lng, lat] of samples) {
      const wgs = gcj02ToWgs84(lng, lat);
      const back = wgs84ToGcj02(wgs.lng, wgs.lat);
      // 1m ≈ 1e-5 度
      expect(Math.abs(back.lng - lng)).toBeLessThan(1e-5);
      expect(Math.abs(back.lat - lat)).toBeLessThan(1e-5);
    }
  });

  it("海外坐标不做偏移（原样返回）", () => {
    const p = gcj02ToWgs84(-74.006, 40.7128); // 纽约
    expect(p.lng).toBeCloseTo(-74.006, 6);
    expect(p.lat).toBeCloseTo(40.7128, 6);
  });

  it("中国境内 GCJ-02 → WGS84 产生明显偏移（>100m）", () => {
    const gcj = { lng: 114.3054, lat: 30.5931 };
    const wgs = gcj02ToWgs84(gcj.lng, gcj.lat);
    // 中国境内偏移数百米 ≈ 0.002°+，海外不偏移
    expect(Math.abs(wgs.lng - gcj.lng)).toBeGreaterThan(0.002);
    expect(Math.abs(wgs.lat - gcj.lat)).toBeGreaterThan(0.002);
    const gcjBack = wgs84ToGcj02(wgs.lng, wgs.lat);
    expect(gcjBack.lng).toBeCloseTo(gcj.lng, 5);
    expect(gcjBack.lat).toBeCloseTo(gcj.lat, 5);
  });
});
