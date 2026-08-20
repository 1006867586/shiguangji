// ============================================================
// 批量 POI 补齐编排
// 用于收藏夹导入主流程：入库后对缺失电话/地址/品类的店铺
// 逐条跑 matchPoi，生成「仅填空字段」的更新补丁。
// 纯编排逻辑，不直接操作数据库，便于测试与复用。
// ============================================================

import { matchPoi, type MatchPoiInput, type MatchResult } from "./matcher";
import { bd09ToGcj02 } from "./coords";
import type { ExternalLink } from "@/types";

export interface PoiEnrichPlace {
  id: string;
  title: string;
  address: string | null;
  phone: string | null;
  category: string | null;
  rating: number | null;
}

export interface PoiEnrichPatch {
  id: string;
  /** 仅包含当前为空且候选有的字段 */
  updates: {
    phone?: string;
    address?: string;
    category?: string;
    rating?: number;
  };
  tier: MatchResult["tier"];
  confidence: number;
}

export interface PoiEnrichSummary {
  patches: PoiEnrichPatch[];
  /** high/medium 命中数 */
  matched: number;
  /** low/none 未命中数 */
  unmatched: number;
  /** 字段完整跳过匹配数 */
  skipped: number;
  /** 匹配过程出错的行 */
  errors: Array<{ id: string; message: string }>;
  /** 时间预算耗尽后未处理的行数 */
  budgetExhausted: number;
}

export interface PoiEnrichOptions {
  /** 注入自定义匹配函数（测试用），默认使用 matchPoi */
  matchFn?: (input: MatchPoiInput) => Promise<MatchResult>;
  /** 城市名，限定检索范围提升命中率 */
  city?: string | null;
  /** 串行间隔毫秒，保护地图 API 配额，默认 150ms */
  delayMs?: number;
  /** 总时间预算毫秒，耗尽后停止处理剩余行（serverless 超时保护） */
  timeBudgetMs?: number;
}

const DEFAULT_DELAY_MS = 150;

/** 电话/地址/品类均齐全视为完整，无需 POI 匹配 */
function isComplete(p: PoiEnrichPlace): boolean {
  return Boolean(p.address && p.phone && p.category);
}

/** 由匹配候选生成补丁：仅填当前为空的字段 */
function buildPatch(place: PoiEnrichPlace, result: MatchResult): PoiEnrichPatch | null {
  if (!result.matched || !result.candidate) return null;

  const cand = result.candidate;
  const updates: PoiEnrichPatch["updates"] = {};
  if (!place.phone && cand.phone) updates.phone = cand.phone;
  if (!place.address && cand.address) updates.address = cand.address;
  if (!place.category && cand.category) updates.category = cand.category;
  if (place.rating == null && cand.rating != null) updates.rating = cand.rating;

  if (Object.keys(updates).length === 0) return null;

  return {
    id: place.id,
    updates,
    tier: result.tier,
    confidence: result.confidence,
  };
}

/**
 * 批量补齐：对每条缺失字段的店铺串行执行 POI 匹配。
 * 单条失败不影响整批，结果汇总返回供调用方落库与展示。
 */
export async function enrichPlacesWithPoi(
  places: PoiEnrichPlace[],
  opts: PoiEnrichOptions = {}
): Promise<PoiEnrichSummary> {
  const matchFn = opts.matchFn ?? matchPoi;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;

  const summary: PoiEnrichSummary = {
    patches: [],
    matched: 0,
    unmatched: 0,
    skipped: 0,
    errors: [],
    budgetExhausted: 0,
  };
  if (places.length === 0) return summary;

  const pending = places.filter((p) => {
    if (isComplete(p)) {
      summary.skipped += 1;
      return false;
    }
    return true;
  });

  const startedAt = Date.now();
  for (let i = 0; i < pending.length; i++) {
    const place = pending[i];
    // 时间预算耗尽：剩余行不再处理，由调用方决定是否异步补跑
    if (
      opts.timeBudgetMs != null &&
      Date.now() - startedAt > opts.timeBudgetMs
    ) {
      summary.budgetExhausted = pending.length - i;
      break;
    }
    try {
      const result = await matchFn({
        name: place.title,
        city: opts.city ?? undefined,
        knownPhone: place.phone,
        knownCategory: place.category,
      });
      const patch = buildPatch(place, result);
      if (patch) {
        summary.patches.push(patch);
        summary.matched += 1;
      } else {
        summary.unmatched += 1;
      }
    } catch (e) {
      summary.errors.push({
        id: place.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    // 串行间隔，避免触发地图 API QPS 限制
    if (i < pending.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return summary;
}

// ============================================================
// 链接解析 POI 兜底（发起活动：粘贴美团/点评分享链接）
// 商家 share 页会打码电话与详细地址，分享文本缺失时
// 用店名跑地图 POI 匹配补齐电话/地址/品类/评分。
// ============================================================

export interface LinkPoiEnrichOptions {
  /** 注入自定义匹配函数（测试用），默认使用 matchPoi */
  matchFn?: (input: MatchPoiInput) => Promise<MatchResult>;
  /** 城市提示（如能从分享文本地址推断），限定检索范围 */
  city?: string | null;
}

export interface LinkPoiEnrichResult {
  /** 补齐后的链接（新对象，入参不变） */
  link: ExternalLink;
  /** 匹配置信档位，未匹配为 none */
  tier: MatchResult["tier"];
  confidence: number;
}

/** 地址/电话/品类/评分/人均/封面均齐全视为完整，无需 POI 兜底 */
function isLinkComplete(link: ExternalLink): boolean {
  return Boolean(
    link.phone &&
      link.address &&
      link.category &&
      link.rating != null &&
      link.price &&
      link.coverImage
  );
}

/** POI 人均数字（元）→ 统一字符串格式 "¥67/人"，与网页抓取格式保持一致 */
function formatPrice(price: number): string {
  const n = Number.isInteger(price) ? price : Math.round(price);
  return `¥${n}/人`;
}

/**
 * 单条链接 POI 兜底：仅当店名存在且字段缺失时匹配，
 * 只填空字段；人均缺失时用 POI 人均数字格式化为 "¥X/人"（而非直接套用数字）。
 * 匹配失败不影响原链接，返回原值。
 */
export async function enrichLinkWithPoi(
  link: ExternalLink,
  opts: LinkPoiEnrichOptions = {}
): Promise<LinkPoiEnrichResult> {
  const title = link.title?.trim();
  if (!title || isLinkComplete(link)) {
    return { link, tier: "none", confidence: 0 };
  }

  try {
    const matchFn = opts.matchFn ?? matchPoi;
    const result = await matchFn({
      name: title,
      city: opts.city ?? undefined,
      knownPhone: link.phone ?? null,
      knownCategory: link.category ?? null,
    });

    if (!result.matched || !result.candidate) {
      return {
        link,
        tier: result.tier,
        confidence: result.confidence,
      };
    }

    const cand = result.candidate;
    const enriched: ExternalLink = { ...link };
    if (!enriched.phone && cand.phone) enriched.phone = cand.phone;
    if (!enriched.address && cand.address) enriched.address = cand.address;
    if (!enriched.category && cand.category) enriched.category = cand.category;
    if (enriched.rating == null && cand.rating != null) {
      enriched.rating = cand.rating;
    }
    if (!enriched.price && cand.price != null) {
      enriched.price = formatPrice(cand.price);
    }
    // 封面图：点评/美团 share 页不返回封面、截图识别也无封面时，
    // 用地图 POI 返回的真实可访问照片 URL 补全
    if (!enriched.coverImage && cand.photos && cand.photos.length > 0) {
      enriched.coverImage = cand.photos[0];
    }
    // 坐标落库（GCJ-02 统一系），供小程序 wx.openLocation / 地图导航使用
    if (!enriched.location && cand.location) {
      enriched.location =
        cand.location.coordType === "bd09"
          ? bd09ToGcj02(cand.location.lng, cand.location.lat)
          : { lng: cand.location.lng, lat: cand.location.lat };
    }

    return {
      link: enriched,
      tier: result.tier,
      confidence: result.confidence,
    };
  } catch {
    // 地图接口异常不阻塞链接解析主流程
    return { link, tier: "none", confidence: 0 };
  }
}
