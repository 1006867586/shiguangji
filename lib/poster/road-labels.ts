// ============================================================
// 道路名自动筛选与锚点定位（移植自 map-creator）
// - Web Mercator 投影：GCJ-02 经纬度 → 海报画布像素（与高德静态图一致）
// - 候选筛选：可见长度 + 道路等级权重 + 名称合法性过滤
// - 锚点：取最佳段的中点，角度归一化到 [-90°, 90°]
// ============================================================

import type { RoadLine } from "./overpass";

export interface ProjectedRoad {
  name: string;
  highway: string;
  /** 画布像素坐标 */
  points: Array<{ x: number; y: number }>;
  lengthPx: number;
}

export interface RoadLabelCandidate {
  name: string;
  /** 标签锚点（画布像素） */
  point: { x: number; y: number };
  /** 标签旋转角度（度），已归一化到 [-90, 90] */
  angle: number;
  score: number;
}

// ---------------- Web Mercator 投影 ----------------

const TILE_SIZE = 256;

function lngToWorldX(lng: number, worldSize: number): number {
  return ((lng + 180) / 360) * worldSize;
}

function latToWorldY(lat: number, worldSize: number): number {
  const rad = (lat * Math.PI) / 180;
  const merc = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return ((1 - merc / Math.PI) / 2) * worldSize;
}

export interface PosterProjector {
  /** 画布像素边长 */
  size: number;
  /** 当前缩放级别下每像素对应米数（纬度 cos 修正） */
  metersPerPixel: number;
  /** GCJ-02 经纬度 → 画布像素 */
  toPixel(lng: number, lat: number): { x: number; y: number };
  /** 米 → 画布像素 */
  metersToPixels(meters: number): number;
}

/** 构建海报投影器：中心(GCJ-02) + zoom + 画布尺寸，与高德静态图同投影 */
export function createPosterProjector(
  centerLng: number,
  centerLat: number,
  zoom: number,
  size: number
): PosterProjector {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const scale = size / worldSize;
  const centerX = lngToWorldX(centerLng, worldSize);
  const centerY = latToWorldY(centerLat, worldSize);
  const metersPerPixel =
    (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / 2 ** zoom;
  return {
    size,
    metersPerPixel,
    toPixel(lng, lat) {
      return {
        x: (lngToWorldX(lng, worldSize) - centerX) * scale + size / 2,
        y: (latToWorldY(lat, worldSize) - centerY) * scale + size / 2,
      };
    },
    metersToPixels(meters) {
      return meters / metersPerPixel;
    },
  };
}

// ---------------- 名称合法性 ----------------

const BLOCKED_TERMS = [
  "快速路",
  "高架",
  "隧道",
  "立交",
  "内环",
  "绕城",
  "高速",
  "铁路",
  "城际",
  "地铁",
  "专线",
  "无名",
];
const NAME_SUFFIXES = ["路", "街", "巷", "大道", "街道", "桥", "门"];

/** 道路名是否适合出现在导览海报上（排除快速路/隧道/“XX线”等） */
export function isRoadLabelAllowed(name: string): boolean {
  if (BLOCKED_TERMS.some((term) => name.includes(term))) return false;
  if (name.endsWith("线")) return false;
  return NAME_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

const HIGHWAY_WEIGHTS: Record<string, number> = {
  motorway: 5.0,
  trunk: 4.8,
  primary: 4.4,
  secondary: 3.7,
  tertiary: 3.0,
  unclassified: 2.1,
  residential: 1.8,
  living_street: 1.6,
  pedestrian: 1.5,
  service: 1.2,
};

/** 道路等级权重（越高越重要） */
export function roadLabelWeight(highway: string): number {
  return HIGHWAY_WEIGHTS[highway] ?? 0;
}

// ---------------- 候选筛选 ----------------

export interface RankRoadOptions {
  /** 大范围地图（点跨度大）：抬高长度/等级门槛，道路名更少 */
  largeMap?: boolean;
  limit?: number;
}

function polylineLength(points: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** 道路线投影到画布像素，附带总长 */
export function projectRoads(
  roads: RoadLine[],
  projector: PosterProjector
): ProjectedRoad[] {
  const out: ProjectedRoad[] = [];
  for (const road of roads) {
    const points = road.points.map((p) => projector.toPixel(p.lng, p.lat));
    const lengthPx = polylineLength(points);
    if (points.length >= 2 && lengthPx > 0) {
      out.push({ name: road.name, highway: road.highway, points, lengthPx });
    }
  }
  return out;
}

/**
 * 道路名候选筛选：按「总可见长度 × 等级权重」打分，
 * 同名道路合并计分（一条长街常被 OSM 拆成多条 way）。
 */
export function rankRoadLabelCandidates(
  roads: ProjectedRoad[],
  projector: PosterProjector,
  opts: RankRoadOptions = {}
): RoadLabelCandidate[] {
  const largeMap = opts.largeMap ?? false;
  const limit = opts.limit ?? 6;
  // 绝对像素门槛（road.lengthPx 已是画布像素）：太短的路名连标签都放不下
  const minLengthPx = largeMap ? 120 : 60;
  const minWeight = largeMap ? 2.7 : 1.4;

  const buckets = new Map<
    string,
    { lines: Array<Array<{ x: number; y: number }>>; length: number; weight: number }
  >();

  for (const road of roads) {
    if (!isRoadLabelAllowed(road.name)) continue;
    const weight = roadLabelWeight(road.highway);
    if (weight < minWeight) continue;
    if (road.lengthPx < minLengthPx) continue;
    const bucket =
      buckets.get(road.name) ?? { lines: [], length: 0, weight: 0 };
    bucket.lines.push(road.points);
    bucket.length += road.lengthPx;
    bucket.weight = Math.max(bucket.weight, weight);
    buckets.set(road.name, bucket);
  }

  const candidates: RoadLabelCandidate[] = [];
  for (const [name, bucket] of buckets) {
    const line = bucket.lines.reduce((a, b) =>
      polylineLength(a) >= polylineLength(b) ? a : b
    );
    const score = bucket.length * (1 + bucket.weight * 0.28);
    const anchor = roadLabelAnchor(line, projector);
    candidates.push({ name, point: anchor.point, angle: anchor.angle, score });
  }

  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return candidates.slice(0, Math.max(limit * 2, limit));
}

// ---------------- 锚点与角度 ----------------

interface Segment {
  a: { x: number; y: number };
  b: { x: number; y: number };
  len: number;
  start: number; // 段起点沿线的累积长度
}

/**
 * 选最佳段：段长优先，其次偏向整线中部（远离两端），
 * 过分靠近端点（margin < 0.14）直接重罚。返回段中点和屏幕角度。
 */
export function roadLabelAnchor(
  line: Array<{ x: number; y: number }>,
  projector: PosterProjector
): { point: { x: number; y: number }; angle: number } {
  const segments: Segment[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 0) {
      segments.push({ a, b, len, start: total });
      total += len;
    }
  }
  if (segments.length === 0) {
    const fallback = line[0] ?? { x: 0, y: 0 };
    return { point: fallback, angle: 0 };
  }

  const minSegmentPx = Math.min(
    Math.max(total * 0.04, projector.metersToPixels(40)),
    projector.metersToPixels(120)
  );
  const usable = segments.filter((s) => s.len >= minSegmentPx);
  const pool = usable.length ? usable : segments;

  let best = pool[0];
  let bestScore = -Infinity;
  for (const s of pool) {
    const midDist = s.start + s.len / 2;
    const norm = midDist / Math.max(total, 1);
    const margin = Math.min(norm, 1 - norm);
    const penalty = margin < 0.14 ? total : 0;
    const score = s.len + margin * total * 0.35 - penalty;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  const point = {
    x: best.a.x + (best.b.x - best.a.x) / 2,
    y: best.a.y + (best.b.y - best.a.y) / 2,
  };
  let angle = (Math.atan2(best.b.y - best.a.y, best.b.x - best.a.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return { point, angle };
}
