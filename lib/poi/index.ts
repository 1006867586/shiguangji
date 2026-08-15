// ============================================================
// POI 匹配模块统一出口
// 用法：import { matchPoi } from "@/lib/poi";
// ============================================================

export type {
  PoiCandidate,
  PoiProviderName,
} from "./types";
export {
  cleanShopName,
  extractCoreBrand,
  buildSearchVariants,
} from "./name-cleaner";
export {
  levenshtein,
  nameSimilarity,
  normalizePhone,
  phoneEquals,
} from "./similarity";
export {
  searchAmapPois,
  searchBaiduPois,
  isPoiProviderConfigured,
  PoiProviderError,
} from "./providers";
export {
  matchPoi,
  HIGH_THRESHOLD,
  MEDIUM_THRESHOLD,
  LOW_THRESHOLD,
} from "./matcher";
export type {
  MatchPoiInput,
  MatchPoiDeps,
  MatchResult,
  MatchAttempt,
  MatchTier,
  PoiSearchFn,
} from "./matcher";
export {
  enrichPlacesWithPoi,
} from "./enrich";
export type {
  PoiEnrichPlace,
  PoiEnrichPatch,
  PoiEnrichSummary,
  PoiEnrichOptions,
} from "./enrich";
export type { PoiSearchOptions } from "./providers";
