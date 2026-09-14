// ============================================================
// lib/dietary.ts — 忌口 / 口味档案的纯逻辑
//
// 设计取舍说明（改动前请先看这段）：
//   餐厅侧的 dietary_tags 是「能满足的忌口」**白名单**，不是黑名单。
//   因为现实中非素食馆也能做素菜，用黑名单直接排除会误杀大量候选。
//   所以抽签不是简单 filter，而是分两级：
//     - strict：只抽能同时满足所有人忌口的餐厅
//     - loose：strict 无结果时降级，全部候选参与，但结果卡必须给出忌口提醒
//   「提醒」才是这个功能真正的价值，过滤只是锦上添花。
// ============================================================

/** 忌口标签定义：key 入库，label 展示 */
export interface DietaryTag {
  key: string;
  label: string;
}

/**
 * 预设忌口标签。
 * key 一旦上线就不要改语义（已落库），只能新增。
 */
export const DIETARY_TAGS: readonly DietaryTag[] = [
  { key: "no_spicy", label: "不吃辣" },
  { key: "no_cilantro", label: "不吃香菜" },
  { key: "vegetarian", label: "素食" },
  { key: "no_beef", label: "不吃牛肉" },
  { key: "no_pork", label: "不吃猪肉" },
  { key: "no_lamb", label: "不吃羊肉" },
  { key: "no_seafood", label: "海鲜过敏" },
  { key: "no_nuts", label: "坚果过敏" },
  { key: "lactose", label: "乳糖不耐" },
  { key: "gluten", label: "麸质过敏" },
  { key: "no_organ", label: "不吃内脏" },
  { key: "no_raw", label: "不吃生冷" },
  { key: "halal", label: "清真" },
  { key: "light", label: "少油少盐" },
] as const;

const TAG_KEY_SET: ReadonlySet<string> = new Set(DIETARY_TAGS.map((t) => t.key));
const KEY_TO_LABEL: ReadonlyMap<string, string> = new Map(
  DIETARY_TAGS.map((t) => [t.key, t.label])
);

/** 是否为已注册的忌口 key */
export function isDietaryTagKey(key: string): boolean {
  return TAG_KEY_SET.has(key);
}

/** key → 中文名；未知 key 原样返回（避免脏数据把 UI 打空） */
export function dietaryLabel(key: string): string {
  return KEY_TO_LABEL.get(key) ?? key;
}

/**
 * 清洗用户提交的忌口标签数组：
 * 非数组 → []；逐项转字符串、trim、去重、丢弃不在白名单内的 key。
 */
export function sanitizeDietaryTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const k = raw.trim();
    if (!k || !isDietaryTagKey(k)) continue;
    seen.add(k);
  }
  return [...seen];
}

// ============================================================
// 抽签：候选 × 参与成员忌口
// ============================================================

/** 候选所需的最小字段（MealRouletteItem 的子集，便于单测构造） */
export interface DietaryCandidate {
  id: string;
  title: string;
  /** 该餐厅能满足的忌口标签（白名单） */
  dietary_tags?: string[] | null;
}

/** 参与本次抽签的成员忌口 */
export interface PartyMemberDietary {
  userId: string;
  nickname: string;
  dietaryTags: string[];
}

export type DrawMode = "strict" | "loose";

/** 单条忌口的提醒条目（结果卡展示用） */
export interface DietaryWarning {
  key: string;
  label: string;
  nicknames: string[];
}

export interface DrawResult<T extends DietaryCandidate> {
  /** 抽中的候选；候选池为空时为 null */
  picked: T | null;
  /** 实际参与抽签的候选池 */
  pool: T[];
  /** 本次实际生效的模式（strict 无结果会自动降级为 loose） */
  mode: DrawMode;
  /** 因忌口冲突被排除的候选数（仅 strict 模式有值） */
  excludedCount: number;
  /** 本局需注意的忌口（按人数降序） */
  warnings: DietaryWarning[];
}

/**
 * 该候选是否满足全部必需忌口。
 * 没有任何忌口要求时永远返回 true。
 */
export function satisfiesDietary(
  candidate: { dietary_tags?: string[] | null },
  required: readonly string[]
): boolean {
  if (required.length === 0) return true;
  const supported = new Set(candidate.dietary_tags ?? []);
  return required.every((tag) => supported.has(tag));
}

/** 汇总参与成员的忌口：去重并按人数降序，便于展示「本局需注意」 */
export function summarizeDietary(
  members: readonly PartyMemberDietary[]
): DietaryWarning[] {
  const buckets = new Map<string, string[]>();
  for (const m of members) {
    for (const tag of m.dietaryTags ?? []) {
      const list = buckets.get(tag);
      if (list) list.push(m.nickname);
      else buckets.set(tag, [m.nickname]);
    }
  }
  return [...buckets.entries()]
    .map(([key, nicknames]) => ({
      key,
      label: dietaryLabel(key),
      nicknames,
    }))
    .sort(
      (a, b) =>
        b.nicknames.length - a.nicknames.length ||
        a.key.localeCompare(b.key)
    );
}

/** 参与成员的所有忌口（去重，顺序稳定） */
export function collectRequiredTags(
  members: readonly PartyMemberDietary[]
): string[] {
  const set = new Set<string>();
  for (const m of members) {
    for (const tag of m.dietaryTags ?? []) set.add(tag);
  }
  return [...set].sort();
}

/** 均匀随机取一个元素；random 可注入以便测试 */
export function pickRandom<T>(
  pool: readonly T[],
  random: () => number = Math.random
): T | null {
  if (pool.length === 0) return null;
  const idx = Math.floor(random() * pool.length);
  // 防御：random() 返回值越界（如测试注入 1）时夹到最后一项
  return pool[Math.min(Math.max(idx, 0), pool.length - 1)];
}

/**
 * 带忌口过滤的抽签。
 *
 * @param candidates 全部候选
 * @param members    参与本次聚餐的成员（决定忌口集合）
 * @param mode       请求模式；strict 在过滤后为空时会降级为 loose
 * @param random     随机源（测试注入）
 */
export function drawCandidate<T extends DietaryCandidate>(
  candidates: readonly T[],
  members: readonly PartyMemberDietary[],
  mode: DrawMode = "strict",
  random: () => number = Math.random
): DrawResult<T> {
  const warnings = summarizeDietary(members);

  if (candidates.length === 0) {
    return { picked: null, pool: [], mode, excludedCount: 0, warnings };
  }

  const required = collectRequiredTags(members);

  // 无人填忌口 → 不需要区分模式，直接全池抽
  if (required.length === 0) {
    const pool = [...candidates];
    return {
      picked: pickRandom(pool, random),
      pool,
      mode: "loose",
      excludedCount: 0,
      warnings,
    };
  }

  const safe = candidates.filter((c) => satisfiesDietary(c, required));

  if (mode === "strict" && safe.length > 0) {
    return {
      picked: pickRandom(safe, random),
      pool: safe,
      mode: "strict",
      excludedCount: candidates.length - safe.length,
      warnings,
    };
  }

  // strict 无结果（或本就是 loose）→ 全池抽，但必须带上提醒
  const pool = [...candidates];
  return {
    picked: pickRandom(pool, random),
    pool,
    mode: "loose",
    excludedCount: mode === "strict" ? safe.length : 0,
    warnings,
  };
}
