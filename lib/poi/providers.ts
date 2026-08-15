// ============================================================
// 高德/百度地图官方 POI 检索封装
// - 高德：搜索 POI 2.0（restapi.amap.com/v5/place/text），GCJ-02 坐标
// - 百度：地点检索 v2（api.map.baidu.com/place/v2/search），BD-09 坐标
// 两者均需在 .env.local 配置服务端 Key/AK，返回统一 PoiCandidate 结构。
// ============================================================

import crypto from "node:crypto";
import type { PoiCandidate } from "./types";

const AMAP_TEXT_URL = "https://restapi.amap.com/v5/place/text";
const BAIDU_PLACE_URL = "https://api.map.baidu.com/place/v2/search";
const BAIDU_PLACE_PATH = "/place/v2/search";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_PAGE_SIZE = 10;

/** 地图接口调用错误（Key 无效/参数错误/超时等） */
export class PoiProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: "amap" | "baidu",
    public readonly code?: string | number
  ) {
    super(message);
    this.name = "PoiProviderError";
  }
}

export interface PoiSearchOptions {
  keyword: string;
  /** 城市名或 adcode，限定检索范围可显著降低误匹配 */
  city?: string | null;
  pageSize?: number;
  timeoutMs?: number;
}

/** 是否配置了地图服务密钥（未配置的平台在 matcher 中跳过） */
export function isPoiProviderConfigured(): { amap: boolean; baidu: boolean } {
  return {
    amap: Boolean(process.env.AMAP_KEY),
    baidu: Boolean(process.env.BAIDU_MAP_AK),
  };
}

async function fetchJson(
  provider: "amap" | "baidu",
  url: URL,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new PoiProviderError(
        `${provider} 接口 HTTP ${res.status}`,
        provider
      );
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof PoiProviderError) throw e;
    throw new PoiProviderError(
      `${provider} 接口请求失败: ${e instanceof Error ? e.message : String(e)}`,
      provider
    );
  } finally {
    clearTimeout(timer);
  }
}

/** 取字符串末级分类："餐饮服务;中餐厅;火锅店" → "火锅店" */
function lastSegment(type?: string | null): string | null {
  if (!type) return null;
  const segs = type
    .split(/[;；,，/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return segs.length ? segs[segs.length - 1] : null;
}

function toNumberOrNull(v?: string | number | null): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** 多个电话（; 分隔）取第一个 */
function firstPhone(tel?: string | null): string | null {
  if (!tel) return null;
  const first = tel.split(";")[0].trim();
  return first || null;
}

// ---------------- 高德 ----------------

interface AmapPoi {
  id?: string;
  name?: string;
  type?: string;
  address?: string;
  location?: string;
  cityname?: string;
  pcityname?: string;
  tel?: string;
  business?: { tel?: string; rating?: string; cost?: string } | null;
}

export async function searchAmapPois(
  opts: PoiSearchOptions
): Promise<PoiCandidate[]> {
  const key = process.env.AMAP_KEY;
  if (!key) {
    throw new PoiProviderError(
      "未配置 AMAP_KEY（高德 Web 服务 Key）",
      "amap"
    );
  }

  const url = new URL(AMAP_TEXT_URL);
  url.searchParams.set("key", key);
  url.searchParams.set("keywords", opts.keyword);
  if (opts.city) {
    url.searchParams.set("region", opts.city);
    url.searchParams.set("city_limit", "true");
  }
  url.searchParams.set("show_fields", "business,photos");
  url.searchParams.set("page_size", String(opts.pageSize ?? DEFAULT_PAGE_SIZE));

  const data = await fetchJson("amap", url, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (data.status !== "1") {
    throw new PoiProviderError(
      `高德接口错误 [${data.infocode ?? "?"}] ${data.info ?? ""}`.trim(),
      "amap",
      data.infocode as string | undefined
    );
  }

  const pois = (data.pois ?? []) as AmapPoi[];
  return pois.map((p) => {
    const [lng, lat] = (p.location ?? "").split(",").map(Number);
    return {
      provider: "amap" as const,
      id: p.id ?? "",
      name: p.name ?? "",
      address: p.address || null,
      phone: firstPhone(p.business?.tel ?? p.tel),
      city: p.cityname ?? p.pcityname ?? null,
      category: lastSegment(p.type),
      rating: toNumberOrNull(p.business?.rating),
      price: toNumberOrNull(p.business?.cost),
      url: null,
      location: {
        lng: Number.isFinite(lng) ? lng : 0,
        lat: Number.isFinite(lat) ? lat : 0,
        coordType: "gcj02" as const,
      },
    };
  });
}

// ---------------- 百度 ----------------

interface BaiduPoi {
  uid?: string;
  name?: string;
  address?: string;
  province?: string;
  city?: string;
  area?: string;
  telephone?: string;
  location?: { lng?: number; lat?: number };
  detail_info?: { tag?: string; detail_url?: string } | null;
}

export async function searchBaiduPois(
  opts: PoiSearchOptions
): Promise<PoiCandidate[]> {
  const ak = process.env.BAIDU_MAP_AK;
  if (!ak) {
    throw new PoiProviderError(
      "未配置 BAIDU_MAP_AK（百度地图服务端 AK）",
      "baidu"
    );
  }
  const sk = process.env.BAIDU_MAP_SK;

  const url = new URL(BAIDU_PLACE_URL);
  url.searchParams.set("ak", ak);
  url.searchParams.set("query", opts.keyword);
  // 百度 region 为必填，未知城市时退化为全国检索
  url.searchParams.set("region", opts.city || "全国");
  if (opts.city) {
    url.searchParams.set("city_limit", "true");
  }
  url.searchParams.set("scope", "2");
  url.searchParams.set("output", "json");
  url.searchParams.set("page_size", String(opts.pageSize ?? DEFAULT_PAGE_SIZE));

  // 百度服务端 AK 现强制 SN 校验；配了 SK 则计算签名附加，未配则按旧版 AK-only 发请求
  if (sk) {
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      params[k] = v;
    });
    const sn = calculateBaiduSn(sk, BAIDU_PLACE_PATH, params);
    url.searchParams.set("sn", sn);
  }

  const data = await fetchJson("baidu", url, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (data.status !== 0) {
    throw new PoiProviderError(
      `百度接口错误 [${data.status ?? "?"}] ${data.message ?? ""}`.trim(),
      "baidu",
      data.status as number | undefined
    );
  }

  const results = (data.results ?? []) as BaiduPoi[];
  return results.map((p) => ({
    provider: "baidu" as const,
    id: p.uid ?? "",
    name: p.name ?? "",
    address: p.address || null,
    phone: firstPhone(p.telephone),
    city: p.city ?? p.province ?? null,
    category: lastSegment(p.detail_info?.tag),
    rating: null,
    price: null,
    url: p.detail_info?.detail_url || null,
    location: {
      lng: p.location?.lng ?? 0,
      lat: p.location?.lat ?? 0,
      coordType: "bd09" as const,
    },
  }));
}

/**
 * 计算百度地图 SN 签名。
 * 算法（百度官方 SN 校验规范）：
 *   1. 取请求 path（不含 host 和 query），如 /place/v2/search
 *   2. 把所有参数（含 ak，不含 sn）按 key 字典序排序，拼接为 k=v&k=v（值不 URL 编码）
 *   3. 拼接：sk + path + "?" + sortedQuery
 *   4. 对上一步字符串做 encodeURIComponent（RFC3986）
 *   5. 计算 MD5（小写 hex），作为 sn 参数附加到请求 URL
 */
export function calculateBaiduSn(
  sk: string,
  path: string,
  params: Record<string, string>
): string {
  const sortedQuery = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  const raw = `${sk}${path}?${sortedQuery}`;
  const encoded = encodeURIComponent(raw);
  return crypto.createHash("md5").update(encoded).digest("hex");
}
