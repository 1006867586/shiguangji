// ============================================================
// POI 匹配编排：多级搜索降级 + 相似度校验
//
// 流程：
//   1. 由店铺名生成三级查询词：原始名 → 清洗名 → 核心品牌
//   2. 逐级调用已配置的地图平台（高德优先，双平台并行）
//   3. 候选统一打分：名称相似度 + 电话一致加分 + 品类一致加分
//   4. 任一级出现高置信命中即提前返回，否则继续降级
//   5. 按阈值分级：high/medium 视为匹配，low 保留供人工复核
// ============================================================

import { buildSearchVariants } from "./name-cleaner";
import { nameSimilarity, phoneEquals } from "./similarity";
import {
  isPoiProviderConfigured,
  searchAmapPois,
  searchBaiduPois,
  type PoiSearchOptions,
} from "./providers";
import type { PoiCandidate, PoiProviderName } from "./types";

/** 高置信：直接采信 */
export const HIGH_THRESHOLD = 0.85;
/** 中置信：视为匹配 */
export const MEDIUM_THRESHOLD = 0.7;
/** 低置信：不匹配但保留候选供人工复核 */
export const LOW_THRESHOLD = 0.55;

const PHONE_MATCH_BONUS = 0.15;
const CATEGORY_MATCH_BONUS = 0.05;

export interface MatchPoiInput {
  /** 店铺名（来自美团/点评解析） */
  name: string;
  /** 城市名或 adcode，强烈建议提供 */
  city?: string | null;
  /** 已知电话（如解析时已带），用于加分校验 */
  knownPhone?: string | null;
  /** 已知品类（如 火锅/烧烤），用于加分校验 */
  knownCategory?: string | null;
}

export type PoiSearchFn = (opts: PoiSearchOptions) => Promise<PoiCandidate[]>;

export interface MatchPoiDeps {
  /** 测试注入用，替换默认的高德搜索 */
  searchAmap?: PoiSearchFn;
  /** 测试注入用，替换默认的百度搜索 */
  searchBaidu?: PoiSearchFn;
}

export interface MatchAttempt {
  /** 1=原始名 2=清洗名 3=核心品牌 */
  level: number;
  keyword: string;
  provider: PoiProviderName;
  candidateCount: number;
  error?: string;
}

export type MatchTier = "high" | "medium" | "low" | "none";

export interface MatchResult {
  /** high/medium 为 true；low 返回候选但需人工确认 */
  matched: boolean;
  tier: MatchTier;
  /** 综合置信度 0-1 */
  confidence: number;
  candidate: PoiCandidate | null;
  /** 每级每平台的搜索轨迹（含错误），便于排查与审计 */
  attempts: MatchAttempt[];
}

/** 候选综合打分：名称相似度为主，电话/品类一致加分，封顶 1 */
function scoreCandidate(input: MatchPoiInput, cand: PoiCandidate): number {
  let score = nameSimilarity(input.name, cand.name);

  if (
    input.knownPhone &&
    cand.phone &&
    phoneEquals(input.knownPhone, cand.phone)
  ) {
    score += PHONE_MATCH_BONUS;
  }

  if (
    input.knownCategory &&
    cand.category &&
    (cand.category.includes(input.knownCategory) ||
      input.knownCategory.includes(cand.category))
  ) {
    score += CATEGORY_MATCH_BONUS;
  }

  return Math.min(1, score);
}

/**
 * 匹配入口。依赖注入的搜索函数优先于环境变量配置，
 * 便于测试与将来接入更多数据源。
 */
export async function matchPoi(
  input: MatchPoiInput,
  deps: MatchPoiDeps = {}
): Promise<MatchResult> {
  const variants = buildSearchVariants(input.name ?? "");
  const configured = isPoiProviderConfigured();

  const searchers: Array<{ provider: PoiProviderName; fn: PoiSearchFn }> = [];
  const hasInjected = Boolean(deps.searchAmap || deps.searchBaidu);
  if (hasInjected) {
    // 注入即完全接管（测试/定制数据源），不再叠加默认平台
    if (deps.searchAmap) {
      searchers.push({ provider: "amap", fn: deps.searchAmap });
    }
    if (deps.searchBaidu) {
      searchers.push({ provider: "baidu", fn: deps.searchBaidu });
    }
  } else {
    if (configured.amap) {
      searchers.push({ provider: "amap", fn: searchAmapPois });
    }
    if (configured.baidu) {
      searchers.push({ provider: "baidu", fn: searchBaiduPois });
    }
  }

  if (variants.length === 0 || searchers.length === 0) {
    return {
      matched: false,
      tier: "none",
      confidence: 0,
      candidate: null,
      attempts: [],
    };
  }

  const attempts: MatchAttempt[] = [];
  let best: { candidate: PoiCandidate; score: number } | null = null;

  for (let level = 0; level < variants.length; level++) {
    const keyword = variants[level];

    // 双平台并行，单平台失败不阻塞另一平台
    const settled = await Promise.allSettled(
      searchers.map(({ fn }) => fn({ keyword, city: input.city ?? undefined }))
    );

    for (let i = 0; i < settled.length; i++) {
      const res = settled[i];
      const { provider } = searchers[i];
      if (res.status === "fulfilled") {
        attempts.push({
          level: level + 1,
          keyword,
          provider,
          candidateCount: res.value.length,
        });
        for (const cand of res.value) {
          const score = scoreCandidate(input, cand);
          if (!best || score > best.score) {
            best = { candidate: cand, score };
          }
        }
      } else {
        attempts.push({
          level: level + 1,
          keyword,
          provider,
          candidateCount: 0,
          error:
            res.reason instanceof Error
              ? res.reason.message
              : String(res.reason),
        });
      }
    }

    // 高置信命中，提前结束降级
    if (best && best.score >= HIGH_THRESHOLD) break;
  }

  if (!best) {
    return {
      matched: false,
      tier: "none",
      confidence: 0,
      candidate: null,
      attempts,
    };
  }

  const { candidate, score } = best;
  const tier: MatchTier =
    score >= HIGH_THRESHOLD
      ? "high"
      : score >= MEDIUM_THRESHOLD
      ? "medium"
      : score >= LOW_THRESHOLD
      ? "low"
      : "none";

  if (tier === "none") {
    return { matched: false, tier, confidence: score, candidate: null, attempts };
  }

  return {
    matched: tier === "high" || tier === "medium",
    tier,
    confidence: score,
    candidate,
    attempts,
  };
}
