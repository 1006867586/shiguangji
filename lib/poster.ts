// ============================================================
// 打卡地图海报生成（M3 一期 · 静态底图版）
// - 底图：高德静态图 API（合规服务端调用，AMAP_KEY 不落前端）
// - 文字：sharp 合成 SVG（Noto Sans SC 思源黑体，随包分发，
//   以 data URI 内嵌，解决 Vercel 无系统中文字体问题）
// - 版式：借鉴 map-creator 海报工作流（数据→取框→底图→版式）
// ============================================================

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export type PosterType = "footprints" | "circle";

export interface PosterPoint {
  lng: number;
  lat: number;
  name: string;
  address?: string | null;
}

export interface PosterOptions {
  type: PosterType;
  /** 主标题（如「我的打卡地图」/「XX 圈子打卡地图」） */
  title: string;
  /** 副标题（如「武汉 · 2026.08」） */
  subtitle: string;
  points: PosterPoint[];
}

const AMAP_KEY = process.env.AMAP_KEY ?? "";
const FONT_REL_PATH = "assets/fonts/NotoSansSC-Regular.ttf";

// 海报画布：底图 1024*1024（高德 scale=2 → 2048*2048）+ 底部标题区 320
const MAP_SIZE = 2048;
const HEADER_HEIGHT = 320;
const POSTER_HEIGHT = MAP_SIZE + HEADER_HEIGHT;

// 字体 base64 缓存（17MB 字体只读一次，避免每次请求重复读盘）
let fontBase64Cache: string | null = null;
function loadFontBase64(): string {
  if (fontBase64Cache) return fontBase64Cache;
  const filePath = path.resolve(process.cwd(), FONT_REL_PATH);
  fontBase64Cache = fs.readFileSync(filePath).toString("base64");
  return fontBase64Cache;
}

/** 由打卡点集合估算地图中心与缩放级别（单点→15，跨度越大越缩小） */
export function computeCenterAndZoom(
  lngs: number[],
  lats: number[]
): { center: [number, number]; zoom: number } {
  if (lngs.length === 0) return { center: [114.3054, 30.5931], zoom: 12 };
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const center: [number, number] = [
    (minLng + maxLng) / 2,
    (minLat + maxLat) / 2,
  ];
  if (lngs.length === 1) return { center, zoom: 15 };
  const spanKm = Math.max(maxLng - minLng, maxLat - minLat) * 111;
  let zoom = 15;
  if (spanKm > 1) zoom = 14;
  if (spanKm > 3) zoom = 13;
  if (spanKm > 8) zoom = 12;
  if (spanKm > 20) zoom = 11;
  return { center, zoom };
}

/** 编号标签：1-9 数字，超过则 A/B/C… */
function markerLabel(index: number): string {
  return index < 9 ? String(index + 1) : "ABC"[index - 9];
}

/** 构建高德静态图 markers 参数（编号红点，最多 12 个） */
function buildMarkers(points: PosterPoint[], max = 12): string {
  return points
    .slice(0, max)
    .map(
      (p, i) =>
        `mid,0xE24B4A,label:${markerLabel(i)}:${p.lng.toFixed(6)},${p.lat.toFixed(
          6
        )}`
    )
    .join("|");
}

/** 调用高德静态图 API 获取底图（scale=2 高清输出 2048*2048） */
async function fetchStaticMap(
  center: [number, number],
  zoom: number,
  markers: string
): Promise<Buffer> {
  if (!AMAP_KEY) throw new Error("未配置高德 Web 服务 Key（AMAP_KEY）");
  const params = new URLSearchParams({
    location: `${center[0]},${center[1]}`,
    zoom: String(zoom),
    size: "1024*1024",
    scale: "2",
    markers,
    key: AMAP_KEY,
  });
  const url = `https://restapi.amap.com/v3/staticmap?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`高德静态图接口失败: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 底部标题区 SVG（中文字体经 data URI 内嵌） */
function buildHeaderSvg(opts: {
  title: string;
  subtitle: string;
  total: number;
  type: PosterType;
}): Buffer {
  const font = loadFontBase64();
  const badge = opts.type === "circle" ? "圈子打卡地图" : "我的打卡地图";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_SIZE}" height="${HEADER_HEIGHT}">
  <defs>
    <style>
      @font-face { font-family: 'NotoSC'; src: url('data:font/ttf;base64,${font}') format('truetype'); }
    </style>
  </defs>
  <rect width="${MAP_SIZE}" height="${HEADER_HEIGHT}" fill="#F7F4EE"/>
  <rect x="0" y="0" width="6" height="${HEADER_HEIGHT}" fill="#E24B4A"/>
  <text x="48" y="84" font-family="NotoSC" font-size="56" font-weight="700" fill="#2C2C2A">${escapeXml(
    opts.title
  )}</text>
  <text x="48" y="168" font-family="NotoSC" font-size="28" fill="#5F5E5A">${escapeXml(
    opts.subtitle
  )}</text>
  <text x="48" y="228" font-family="NotoSC" font-size="22" fill="#888780">共 ${
    opts.total
  } 个打卡点 · 飨刻</text>
  <text x="${MAP_SIZE - 48}" y="292" font-family="NotoSC" font-size="18" fill="#888780" text-anchor="end">${escapeXml(
    badge
  )}</text>
</svg>`
  );
}

/**
 * 生成打卡地图海报 PNG（竖版 2048 x (2048+320)）。
 * 数据层由调用方（API route）准备，本函数只负责「取框 → 底图 → 版式」。
 */
export async function generatePoster(opts: PosterOptions): Promise<Buffer> {
  const lngs = opts.points.map((p) => p.lng);
  const lats = opts.points.map((p) => p.lat);
  const { center, zoom } = computeCenterAndZoom(lngs, lats);

  const staticMapBuf = await fetchStaticMap(
    center,
    zoom,
    buildMarkers(opts.points)
  );
  const baseBuf = await sharp(staticMapBuf)
    .resize(MAP_SIZE, MAP_SIZE, { fit: "cover" })
    .png()
    .toBuffer();

  const headerBuf = buildHeaderSvg({
    title: opts.title,
    subtitle: opts.subtitle,
    total: opts.points.length,
    type: opts.type,
  });

  return await sharp({
    create: {
      width: MAP_SIZE,
      height: POSTER_HEIGHT,
      channels: 4,
      background: { r: 247, g: 244, b: 238 },
    },
  })
    .composite([
      { input: baseBuf, top: 0, left: 0 },
      { input: headerBuf, top: MAP_SIZE, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
