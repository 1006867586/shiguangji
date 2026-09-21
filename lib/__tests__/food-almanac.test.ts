import { describe, expect, it } from "vitest";
import { getFoodAlmanac } from "@/lib/food-almanac";

describe("getFoodAlmanac", () => {
  it("返回 3 宜 / 3 忌，且文案不为空", () => {
    const a = getFoodAlmanac(new Date(2026, 8, 21)); // 2026-09-21
    expect(a.yi).toHaveLength(3);
    expect(a.ji).toHaveLength(3);
    for (const e of a.yi) {
      expect(e.text).toBeTruthy();
      expect(e.hint).toBeTruthy();
    }
    for (const e of a.ji) {
      expect(e.text).toBeTruthy();
      expect(e.hint).toBeTruthy();
    }
    expect(a.note).toBeTruthy();
  });

  it("同一天结果恒定（确定性）", () => {
    const a = getFoodAlmanac(new Date(2026, 8, 21));
    const b = getFoodAlmanac(new Date(2026, 8, 21, 23, 59, 59));
    expect(a).toEqual(b);
  });

  it("不同日期结果不同（宜/忌会轮换）", () => {
    const set = new Set<string>();
    // 连续 30 天应产生多套不同组合，避免几天不出新文案
    for (let day = 1; day <= 30; day++) {
      const a = getFoodAlmanac(new Date(2026, 8, day));
      set.add(a.yi.map((e) => e.text).join("|"));
    }
    expect(set.size).toBeGreaterThan(2);
  });

  it("宜食与忌食主体不同，避免当天撞主题", () => {
    for (let day = 1; day <= 30; day++) {
      const a = getFoodAlmanac(new Date(2026, 8, day));
      const yiSubjects = new Set(a.yi.map((e) => e.text));
      const jiSubjects = new Set(a.ji.map((e) => e.text));
      for (const s of a.ji.map((e) => e.text)) {
        expect(yiSubjects.has(s)).toBe(false);
      }
      expect(jiSubjects.size).toBe(a.ji.length); // 忌之间也不重复
    }
  });

  it("返回真实农历 / 干支 / 生肖字段", () => {
    const a = getFoodAlmanac(new Date(2026, 8, 21));
    expect(a.lunarLabel).toBeTruthy();
    expect(a.solarLabel).toBeTruthy();
    expect(a.ganzhiLabel).toContain("·");
    expect(a.dayAnimal).toBeTruthy();
  });
});