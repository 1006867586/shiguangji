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

// WGS84 → GCJ-02（标准近似算法，误差通常 <5m）
const EARTH_RADIUS = 6378245.0;
const EE = 0.00669342162296594323;

function transformLat(lng: number, lat: number): number {
  let ret =
    -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat +
    0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret +=
    ((20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin((lat / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((160.0 * Math.sin((lat / 12.0) * Math.PI) + 320 * Math.sin((lat * Math.PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(lng: number, lat: number): number {
  let ret =
    300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat +
    0.1 * Math.sqrt(Math.abs(lng));
  ret +=
    ((20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin((lng / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((150.0 * Math.sin((lng / 12.0) * Math.PI) + 300.0 * Math.sin((lng / 30.0) * Math.PI)) * 2.0) / 3.0;
  return ret;
}

/** 是否在中国大陆范围外（范围外无需偏移） */
function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

/** WGS84 → GCJ-02（浏览器 navigator.geolocation 为 WGS84，高德地图渲染 GCJ-02） */
export function wgs84ToGcj02(lng: number, lat: number): Gcj02Point {
  if (outOfChina(lng, lat)) return { lng, lat };
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat =
    (dLat * 180.0) / (((EARTH_RADIUS * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng =
    (dLng * 180.0) / ((EARTH_RADIUS / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lng: lng + dLng, lat: lat + dLat };
}
