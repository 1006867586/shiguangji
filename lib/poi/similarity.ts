// ============================================================
// 相似度校验
// 对地图 POI 候选与原始店铺信息做名称/电话比对，
// 避免关键词搜索"取第一条"造成的误匹配。
// ============================================================

/** 名称归一化：小写、去空白与符号，仅保留字母数字与中文 */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

/** 经典编辑距离（Levenshtein），滚动数组实现 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * 名称相似度 0-1：
 * - 归一化后相等 → 1
 * - 一方包含另一方 → 0.75 起步，按长度比加权（连锁分店常见形态）
 * - 其余按归一化编辑距离衰减
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  if (na.includes(nb) || nb.includes(na)) {
    const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
    return 0.75 + 0.2 * ratio;
  }

  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

/**
 * 电话归一化：仅保留数字，去掉 +86 国家码前缀。
 * 座机区号保留（0755/010 等），400 号码原样保留。
 */
export function normalizePhone(phone?: string | null): string {
  if (!phone || typeof phone !== "string") return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("86") && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits;
}

/**
 * 电话一致性：归一化后全等，或双方有效位均 ≥7 时后缀对齐
 * （兼容「带区号 vs 不带区号」「分机截断」等差异）。
 */
export function phoneEquals(a?: string | null, b?: string | null): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const shorter = Math.min(na.length, nb.length);
  if (shorter < 7) return false;
  return na.endsWith(nb.slice(-shorter));
}
