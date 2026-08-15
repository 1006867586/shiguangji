// ============================================================
// 坐标系转换（纯函数）
// 百度 BD-09 → 国测局 GCJ-02（高德/腾讯/微信小程序同系）。
// 供 POI 补齐落库前统一坐标系，前端 wx.openLocation 直接可用。
// ============================================================

export interface Gcj02Point {
  lng: number;
  lat: number;
}

const X_PI = Math.PI * 3000 / 180;

/** BD-09 → GCJ-02（官方近似公式，误差 ~1m，满足导航展示精度） */
export function bd09ToGcj02(lng: number, lat: number): Gcj02Point {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return {
    lng: z * Math.cos(theta),
    lat: z * Math.sin(theta),
  };
}
