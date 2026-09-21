// ============================================================
// lib/food-almanac.ts — 美食黄历的纯逻辑
//
// 参照开源项目 qddidi/vue3-calendar：黄历展示真实农历 + 宜/忌。
// 这里给它套上「美食」主题：
//   - 农历日期 / 干支 / 生肖：来自 lunar-typescript，与参考项目一致
//   - 宜 / 忌：美食主题文案，由日期确定性生成（同一天恒定，不同天翻转）
//     因此不带随机性，便于截图、测试与「今日该吃什么」的复现。
// ============================================================

import { Solar } from "lunar-typescript";

/** 一条宜/忌词条 */
export interface AlmanacEntry {
  text: string;
  hint?: string;
}

/** 美食黄历某天的完整数据 */
export interface FoodAlmanac {
  /** 公历标签，如「9月21日 星期一」 */
  solarLabel: string;
  /** 农历标签，如「八月十一」 */
  lunarLabel: string;
  /** 干支标签，如「丙申年 · 己亥月 · 壬子日」 */
  ganzhiLabel: string;
  /** 当日生肖（日支），如「鼠」 */
  dayAnimal: string;
  /** 宜 —— 今天适合吃什么（3 条） */
  yi: AlmanacEntry[];
  /** 忌 —— 今天要少吃/避开什么（3 条） */
  ji: AlmanacEntry[];
  /** 一句玩味的今日运势 */
  note: string;
}

// ---- 宜 / 忌文案池（可按需扩充）-----------------------------------

const YI_POOL: Adverbial[] = [
  { subject: "火锅", hint: "热闹开涮，越滚越旺" },
  { subject: "烤肉", hint: "滋滋作响，火候正好" },
  { subject: "日料", hint: "清鲜美味的本味之选" },
  { subject: "粤式点心", hint: "一盅两件，慢火温胃" },
  { subject: "川菜", hint: "开胃提神，红红火火" },
  { subject: "烧烤", hint: "烟火气足，适合同聚" },
  { subject: "海鲜", hint: "时令鲜美，补益元气" },
  { subject: "甜品", hint: "甜蜜收尾，心情大好" },
  { subject: "面食", hint: "扎实顶饱，暖身暖心" },
  { subject: "汤羹", hint: "温润滋补，润燥养胃" },
  { subject: "粥品", hint: "清淡易食，调理肠胃" },
  { subject: "早茶", hint: "边吃边聊，从容开场" },
];

const JI_POOL: Adverbial[] = [
  { subject: "重辣", hint: "火气偏旺，今日宜温" },
  { subject: "生冷", hint: "脾胃宜护，少碰生寒" },
  { subject: "油炸", hint: "油腻过重，适可而止" },
  { subject: "隔夜菜", hint: "新鲜为上，别委屈胃" },
  { subject: "暴饮暴食", hint: "细水长流，七分饱即可" },
  { subject: "高糖甜品", hint: "甜多易腻，少量为妙" },
  { subject: "冰饮过量", hint: "入口寒凉，缓缓服用" },
  { subject: "吃太晚", hint: "早点收工，给胃留时间" },
  { subject: "空腹饮酒", hint: "先垫垫肚，再谈尽兴" },
  { subject: "混合豪吃", hint: "种类过杂，肠胃易抗议" },
  { subject: "烫食入口", hint: "晾一晾，别烫了舌头" },
  { subject: "偏食单一", hint: "荤素搭配，才够均衡" },
];

const NOTE_POOL = [
  "今天的胃有一段好胃口，就交给「宜」来安排。",
  "惦记的、想试的，趁今日宜食下手最稳。",
  "宜食不用太多，吃到满足就好；忌的轻轻绕开。",
  "今日份快乐，从一顿合口味的饭开始。",
  "约个饭吧，黄历都替你挑好了方向。",
  "时令当道，跟着感觉走，错不了。",
];

interface Adverbial {
  subject: string;
  hint: string;
}

// ---- 确定性伪随机：同一天恒定，不同天可复现 ------------------------

/** mulberry32 确定性随机数（同一种子结果恒定） */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把日期折叠成一个 32 位种子（YYYYMMDD 数字） */
function dateSeed(date: Date): number {
  return (
    date.getFullYear() * 10000 +
    (date.getMonth() + 1) * 100 +
    date.getDate()
  );
}

/** 从数组随机选 n 个不重复元素（确定性） */
function sample<T>(pool: readonly T[], n: number, rand: () => number): T[] {
  const arr = [...pool];
  const out: T[] = [];
  while (out.length < n && arr.length > 0) {
    const idx = Math.floor(rand() * arr.length);
    out.push(arr.splice(idx, 1)[0]);
  }
  return out;
}

/** 「宜」与「忌」文案主体不重复：忌池取下一位偏移，避免同一天撞主题 */
function shifted<T>(arr: readonly T[], offset: number): T[] {
  return [...arr.slice(offset), ...arr.slice(0, offset)];
}

function pickOne<T>(pool: readonly T[], rand: () => number): T {
  return pool[Math.floor(rand() * pool.length)];
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * 生成某天的美食黄历。
 * @param date 目标日期（默认当天；会忽略时分秒）
 */
export function getFoodAlmanac(date: Date = new Date()): FoodAlmanac {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const solar = Solar.fromDate(d);
  const lunar = solar.getLunar();

  // 农历：「八月十一」；公历：「9月21日 星期一」
  const lunarLabel = `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
  const solarLabel = `${d.getMonth() + 1}月${d.getDate()}日 星期${
    WEEKDAYS[d.getDay()]
  }`;

  // 干支：年 + 月 + 日（去掉天干地支之间的空格便于紧凑展示）
  const ganzhiLabel =
    `${lunar.getYearInGanZhi()} · ` +
    `${lunar.getMonthInGanZhi()} · ${lunar.getDayInGanZhi()}`;

  // 当日生肖（日支对应生肖）：直接取 lunar 的按日生肖
  const dayAnimal = lunar.getDayShengXiao();

  // 确定性宜忌：以日期为种子，同日稳定
  const rand = seededRandom(dateSeed(d));
  // 忌池整体错位，保证与「宜」的食材不直接撞车（视觉上不重复）
  const yi = sample(YI_POOL, 3, rand).map((e) => ({ text: e.subject, hint: e.hint }));
  const ji = sample(shifted(JI_POOL, 3), 3, rand).map((e) => ({
    text: e.subject,
    hint: e.hint,
  }));
  const note = pickOne(NOTE_POOL, rand);

  return {
    solarLabel,
    lunarLabel,
    ganzhiLabel,
    dayAnimal,
    yi,
    ji,
    note,
  };
}