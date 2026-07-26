// ============================================================
// 敏感词过滤
// 用于活动 / 评论等内容的安全审查。
// 本次实现选择「阻断」策略：发现敏感词时拒绝创建内容。
// ============================================================

/**
 * 常见中文敏感词集合。
 * 涵盖政治、色情、辱骂、违法广告等几大类，仅用于内容安全过滤示例。
 * 实际生产环境应结合 DFA / AC 自动机等算法与外部词库维护。
 */
export const SENSITIVE_WORDS: string[] = [
  // 政治类
  "反动",
  "颠覆",
  "分裂国家",
  "煽动",
  "敌对势力",
  "政变",
  "独立",
  "台独",
  "藏独",
  "疆独",
  // 色情类
  "色情",
  "淫秽",
  "卖淫",
  "嫖娼",
  "裸聊",
  "一夜情",
  "黄网",
  " AV ",
  "成人电影",
  "性服务",
  // 辱骂类
  "傻逼",
  "草泥马",
  "你妈",
  "滚蛋",
  "废物",
  "贱人",
  "婊子",
  "王八蛋",
  "混账",
  "去死",
  "脑残",
  "弱智",
  // 违法 / 暴力类
  "毒品",
  "吸毒",
  "贩毒",
  "冰毒",
  "海洛因",
  "大麻",
  "枪支",
  "弹药",
  "炸药",
  "恐怖袭击",
  "杀人",
  "绑架",
  "诈骗",
  "洗钱",
  // 赌博 / 诈骗类
  "赌博",
  "博彩",
  "六合彩",
  "私彩",
  "刷单",
  "传销",
  "非法集资",
  "色情直播",
];

/** 将敏感词数组转为按长度倒序排列，便于优先匹配更长的词，避免短词误伤 */
const SORTED_WORDS = [...SENSITIVE_WORDS].sort((a, b) => b.length - a.length);

/**
 * 检查文本是否包含敏感词。
 * 大小写不敏感（同时兼容英文 / 中文全角空格场景）。
 *
 * @returns found: 是否发现敏感词；words: 命中的敏感词去重列表
 */
export function containsSensitiveWord(text: string): {
  found: boolean;
  words: string[];
} {
  if (!text || typeof text !== "string") {
    return { found: false, words: [] };
  }

  const lower = text.toLowerCase();
  const hits = new Set<string>();

  for (const word of SORTED_WORDS) {
    if (!word) continue;
    // 词库中部分词被故意加了空格（如 " AV "），统一按原文比较
    const w = word.toLowerCase();
    if (lower.includes(w)) {
      hits.add(word.trim());
    }
  }

  return {
    found: hits.size > 0,
    words: Array.from(hits),
  };
}

/**
 * 将文本中的敏感词替换为 `***`。
 * 按长度倒序替换，避免短词先替换导致长词残缺。
 *
 * @returns 处理后的文本（未命中敏感词则原样返回）
 */
export function maskSensitiveWords(text: string): string {
  if (!text || typeof text !== "string") return text;

  let result = text;
  for (const word of SORTED_WORDS) {
    if (!word) continue;
    // 全局替换（g 标志），同时转义正则元字符
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    result = result.replace(re, "***");
  }
  return result;
}
