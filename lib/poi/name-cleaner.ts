// ============================================================
// 店铺名清洗
// 美团/点评解析出的店铺名常带分店后缀、emoji、装饰符号，
// 直接用于地图 POI 搜索会降低命中率，需先清洗再降级。
// ============================================================

/** 匹配 emoji 及变体选择符（✨🔥⭐\uFE0F 等） */
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{E000}-\u{F8FF}]/gu;

/** 匹配成对括号及其内容（全角/半角/方头） */
const BRACKET_GROUP_RE = /[（(【\[][^（(【\[）)】\]]*[）)】\]]/g;

/** 匹配尾部「·某某店」形式的分店后缀（无括号） */
const DOT_BRANCH_RE = /[·•・][^·•・]*店$/;

/** 残留装饰符号（括号去除后可能留下不成对的符号） */
const DECORATION_RE = /[【】\[\]{}★☆|/•・]/g;

/** 尾部门店属性词 */
const STORE_ATTR_RE = /(旗舰店|总店|概念店|体验店|专营店)$/;

/**
 * 清洗店铺名：去 emoji、括号分店后缀、·分店尾缀、装饰符号，折叠空白。
 * 清洗结果为空时回退原始名（避免搜索词丢失）。
 */
export function cleanShopName(raw: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  let cleaned = trimmed
    .replace(EMOJI_RE, "")
    .replace(BRACKET_GROUP_RE, "")
    .replace(DOT_BRANCH_RE, "")
    .replace(DECORATION_RE, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) cleaned = trimmed;
  return cleaned;
}

/**
 * 提取核心品牌词：在清洗基础上按 · 分隔取第一段，并去掉尾部门店属性词。
 * 用于最后一级降级搜索（连锁品牌小微门店常只收录品牌名）。
 */
export function extractCoreBrand(raw: string): string {
  const cleaned = cleanShopName(raw);
  if (!cleaned) return "";

  const stripped = cleaned.replace(STORE_ATTR_RE, "").trim();
  const segments = stripped
    .split(/[·•・]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return segments[0] || stripped || cleaned;
}

/**
 * 构建多级搜索查询词：原始名 → 清洗名 → 核心品牌，去重保序。
 * 越靠前精确度越高，靠后的作为降级兜底。
 */
export function buildSearchVariants(raw: string): string[] {
  if (typeof raw !== "string") return [];
  const original = raw.trim();
  if (!original) return [];

  const variants = [original, cleanShopName(original), extractCoreBrand(original)];
  return Array.from(new Set(variants.filter((v) => v && v.trim())));
}
