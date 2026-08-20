// ============================================================
// 一次性脚本：回填 places 表的富文本字段（rating/phone/business_hours/tags）
// 调用高德 POI v5 详情接口逐条更新。
//
// 使用：
//   1. 确认 .env.local 已配置 AMAP_KEY（与 lib/poi/providers.ts 共用）
//   2. npx tsx scripts/backfill-places-info.ts [--dry-run] [--limit=10]
//
// 注意：
//   - 高德 POI v5 详情默认 QPS 3，脚本每条间隔 250ms
//   - 仅回填 poi_id 非空 + source = 'amap' 的记录
//   - 已回填过的（rating 不为空）默认跳过；可用 --force 重跑
// ============================================================

import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

// 读取环境变量
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn("未找到 .env.local，依赖 process.env");
    return;
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const AMAP_KEY = process.env.AMAP_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!AMAP_KEY) {
  console.error("缺少 AMAP_KEY（高德服务端 Key），退出");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("缺少 Supabase 连接配置（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY），退出");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has("--dry-run");
const FORCE = ARGS.has("--force");
const LIMIT = Number(
  Array.from(ARGS)
    .find((a) => a.startsWith("--limit="))
    ?.slice("--limit=".length) ?? "9999"
);

interface AmapDetailResp {
  status: string;
  info: string;
  infocode: string;
  pois?: Array<{
    id: string;
    name?: string;
    address?: string;
    tel?: string;
    photos?: Array<{ url?: string; title?: string }>;
    business?: {
      rating?: string;
      cost?: string;
      tel?: string;
      opening_hours?: string;
      tag?: string;
    };
  }>;
}

interface AmapSearchResp {
  status: string;
  info: string;
  infocode: string;
  pois?: Array<{
    id: string;
    name?: string;
    location?: string;
    address?: string;
    tel?: string;
    photos?: Array<{ url?: string; title?: string }>;
    business?: {
      rating?: string;
      cost?: string;
      tel?: string;
      opening_hours?: string;
      tag?: string;
    };
  }>;
}

async function fetchAmapDetail(poiId: string): Promise<AmapDetailResp | null> {
  const url = new URL("https://restapi.amap.com/v5/place/detail");
  url.searchParams.set("key", AMAP_KEY!);
  url.searchParams.set("id", poiId);
  url.searchParams.set("show_fields", "business");
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  return (await res.json()) as AmapDetailResp;
}

/** 用名称+坐标搜高德 v5 POI；返回最接近的候选（如果直接返回 business 也行，省一次 detail 调用） */
async function searchAmapByNameAndLocation(
  name: string,
  lng: number,
  lat: number
): Promise<AmapSearchResp | null> {
  const url = new URL("https://restapi.amap.com/v5/place/text");
  url.searchParams.set("key", AMAP_KEY!);
  url.searchParams.set("keywords", name);
  url.searchParams.set("location", `${lng},${lat}`);
  url.searchParams.set("show_fields", "business");
  url.searchParams.set("page_size", "3");
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  return (await res.json()) as AmapSearchResp;
}

function parseRating(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 && n <= 5 ? Math.round(n * 10) / 10 : null;
}

function parseTags(tag: string | undefined): string[] | null {
  if (!tag) return null;
  const parts = tag
    .split(/[;,，；]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function parseCost(cost: string | undefined): string | null {
  if (!cost) return null;
  const trimmed = cost.trim();
  if (!trimmed) return null;
  // 高德返回如 "65" 或 "65.0"，统一加 "¥" 前缀
  return /^¥/.test(trimmed) ? trimmed : `¥${trimmed}`;
}

function haversine(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 从高德 POI photos 字段取第一张图 URL */
function extractCoverImageUrl(
  photos: Array<{ url?: string; title?: string }> | null | undefined
): string | null {
  if (!Array.isArray(photos)) return null;
  for (const p of photos) {
    if (p?.url) return p.url;
  }
  return null;
}

interface PlaceRow {
  id: string;
  name: string;
  lng: number;
  lat: number;
  poi_id: string | null;
  source: string;
  rating: number | null;
}

async function main() {
  console.log(`[backfill] 开始回填（DRY_RUN=${DRY_RUN}, FORCE=${FORCE}, LIMIT=${LIMIT}）`);

  // 1) 查询待回填记录：所有 source='amap' 的（先做 amap），后续可扩展 manual
  //    先把 manual 店也带上，但 manual 的要走"搜索"路径
  let query = supabase
    .from("places")
    .select("id, name, lng, lat, poi_id, source, rating")
    .in("source", ["amap", "manual", "baidu"])
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (!FORCE) {
    query = query.is("rating", null);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error("[backfill] 查询失败:", error.message);
    process.exit(1);
  }
  const placeRows = (rows ?? []) as PlaceRow[];
  console.log(`[backfill] 待处理记录: ${placeRows.length}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of placeRows) {
    process.stdout.write(`[${row.id}] ${row.name} (source=${row.source}) ... `);
    try {
      let biz: Record<string, string | undefined> = {};
      let tel: string | undefined;
      let coverImageUrl: string | null = null;
      let extraPatch: Record<string, unknown> = {};

      if (row.poi_id) {
        // 有 poi_id 走详情接口
        const detail = await fetchAmapDetail(row.poi_id);
        if (!detail || detail.status !== "1" || !detail.pois?.[0]) {
          console.log("SKIP (no detail)");
          skipped++;
          await sleep(60_000 / 5);
          continue;
        }
        const poi = detail.pois[0];
        biz = (poi.business ?? {}) as Record<string, string | undefined>;
        tel = biz.tel ?? poi.tel;
        coverImageUrl = extractCoverImageUrl(poi.photos);
      } else {
        // 无 poi_id（如手动添加的店）：用名称+坐标搜高德 POI 找候选
        const search = await searchAmapByNameAndLocation(row.name, row.lng, row.lat);
        if (!search || search.status !== "1" || !search.pois?.[0]) {
          console.log("SKIP (search empty)");
          skipped++;
          await sleep(60_000 / 5);
          continue;
        }
        // 取第一个候选（高德按距离+名称匹配排序）
        const candidate = search.pois[0];
        // 验证距离（候选 location 应在 200m 内，避免误匹配）
        const candidateLoc = (candidate.location ?? "").split(",");
        if (candidateLoc.length === 2) {
          const cLng = parseFloat(candidateLoc[0]);
          const cLat = parseFloat(candidateLoc[1]);
          if (Number.isFinite(cLng) && Number.isFinite(cLat)) {
            const dist = haversine(row.lng, row.lat, cLng, cLat);
            if (dist > 200) {
              console.log(`SKIP (candidate too far: ${Math.round(dist)}m)`);
              await sleep(60_000 / 5);
              continue;
            }
          }
        }
        biz = (candidate.business ?? {}) as Record<string, string | undefined>;
        tel = biz.tel ?? candidate.tel;
        coverImageUrl = extractCoverImageUrl(candidate.photos);
        // 回写 poi_id + source 给后续直接走详情路径
        extraPatch.poi_id = candidate.id;
        extraPatch.source = "amap";
      }
      const patch: Record<string, unknown> = {
        rating: parseRating(biz.rating),
        average_price: parseCost(biz.cost),
        phone: tel ?? null,
        business_hours: biz.opening_hours ?? null,
        tags: parseTags(biz.tag),
        cover_image_url: coverImageUrl,
        ...extraPatch,
      };
      // 仅写入非空字段，避免覆盖已有非空值
      const cleanPatch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v !== null && v !== undefined) cleanPatch[k] = v;
      }
      if (Object.keys(cleanPatch).length === 0) {
        console.log("SKIP (empty patch)");
        skipped++;
        await sleep(60_000 / 5);
        continue;
      }
      if (DRY_RUN) {
        console.log("WOULD UPDATE:", JSON.stringify(cleanPatch));
        updated++;
      } else {
        const { error: upErr } = await supabase
          .from("places")
          .update(cleanPatch)
          .eq("id", row.id);
        if (upErr) {
          console.log("FAIL:", upErr.message);
          failed++;
        } else {
          console.log("OK:", Object.keys(cleanPatch).join(","));
          updated++;
        }
      }
    } catch (err) {
      console.log("ERR:", err instanceof Error ? err.message : String);
      failed++;
    }
    await sleep(60_000 / 5); // 250ms / req → ~4 QPS
  }

  console.log(
    `\n[backfill] 完成：updated=${updated}, skipped=${skipped}, failed=${failed}`
  );
  process.exit(failed > 0 ? 1 : 0);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[backfill] 未捕获错误:", err);
  process.exit(1);
});