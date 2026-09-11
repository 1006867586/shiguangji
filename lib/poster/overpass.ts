// ============================================================
// Overpass API：拉取目标区域「有名字的道路线」，供海报叠加道路名
// - 输入：中心经纬度（GCJ-02，与高德底图一致）与半径（米）
// - OSM 原始数据为 WGS84，返回前统一转 GCJ-02，与高德底图对齐
// - 请求失败/超时返回空数组（海报降级为无道路名，不阻塞主流程）
// - 进程内内存缓存：同一区域重复生成不重复请求
// ============================================================

import { gcj02ToWgs84, wgs84ToGcj02 } from "@/lib/poi/coords";

export interface RoadLine {
  name: string;
  highway: string;
  /** GCJ-02 坐标点串 */
  points: Array<{ lng: number; lat: number }>;
}

const DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ROADS = 400;

const cache = new Map<string, RoadLine[]>();

function cacheKey(lat: number, lng: number, radiusMeters: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)},${radiusMeters}`;
}

/** Overpass 服务端点，可用 OVERPASS_URL 环境变量覆盖 */
export function getOverpassEndpoint(): string {
  return process.env.OVERPASS_URL?.trim() || DEFAULT_ENDPOINT;
}

interface OverpassWay {
  type?: string;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

function parseRoads(json: { elements?: OverpassWay[] }): RoadLine[] {
  const roads: RoadLine[] = [];
  for (const el of json.elements ?? []) {
    if (el.type !== "way" || !el.tags?.name || !el.geometry?.length) continue;
    const highway = el.tags.highway;
    if (!highway) continue;
    const points = el.geometry.map((g) => {
      const gcj = wgs84ToGcj02(g.lon, g.lat);
      return { lng: gcj.lng, lat: gcj.lat };
    });
    if (points.length < 2) continue;
    roads.push({ name: el.tags.name, highway, points });
    if (roads.length >= MAX_ROADS) break;
  }
  return roads;
}

/**
 * 拉取以 (lat, lng) 为中心（GCJ-02，与高德底图一致）、radiusMeters 为半径的命名道路。
 * Overpass 的 around 按 WGS84 计算，查询前先把中心转成 WGS84。
 * 任何异常均返回空数组，由调用方决定降级行为。
 */
export async function fetchNamedRoads(
  lat: number,
  lng: number,
  radiusMeters: number,
  opts: { force?: boolean } = {}
): Promise<RoadLine[]> {
  const key = cacheKey(lat, lng, radiusMeters);
  if (!opts.force) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  try {
    const wgs = gcj02ToWgs84(lng, lat);
    const ql = [
      "[out:json][timeout:20];",
      `way["highway"]["name"](around:${Math.round(radiusMeters)},${wgs.lat.toFixed(6)},${wgs.lng.toFixed(6)});`,
      "out geom;",
    ].join("");
    const res = await fetch(getOverpassEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Overpass 官方端点对无 UA 的请求返回 406
        "User-Agent": "xiangke-poster/1.0",
      },
      body: `data=${encodeURIComponent(ql)}`,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { elements?: OverpassWay[] };
    const roads = parseRoads(json);
    cache.set(key, roads);
    return roads;
  } catch {
    return [];
  }
}
