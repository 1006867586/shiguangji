import { describe, it, expect } from "vitest";
import {
  DIETARY_TAGS,
  dietaryLabel,
  isDietaryTagKey,
  sanitizeDietaryTags,
  satisfiesDietary,
  summarizeDietary,
  collectRequiredTags,
  pickRandom,
  drawCandidate,
  type DietaryCandidate,
  type PartyMemberDietary,
} from "../dietary";

describe("忌口标签基础", () => {
  it("标签表非空且 key 唯一", () => {
    expect(DIETARY_TAGS.length).toBeGreaterThan(0);
    const keys = DIETARY_TAGS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("isDietaryTagKey 只认已注册的 key", () => {
    expect(isDietaryTagKey("no_spicy")).toBe(true);
    expect(isDietaryTagKey("vegetarian")).toBe(true);
    expect(isDietaryTagKey("NO_SPICY")).toBe(false);
    expect(isDietaryTagKey("随便打的")).toBe(false);
  });

  it("dietaryLabel 取中文名，未知 key 原样返回", () => {
    expect(dietaryLabel("no_spicy")).toBe("不吃辣");
    expect(dietaryLabel("未注册的key")).toBe("未注册的key");
  });
});

describe("sanitizeDietaryTags", () => {
  it("非数组输入返回空数组", () => {
    expect(sanitizeDietaryTags(null)).toEqual([]);
    expect(sanitizeDietaryTags(undefined)).toEqual([]);
    expect(sanitizeDietaryTags("no_spicy")).toEqual([]);
    expect(sanitizeDietaryTags({ 0: "no_spicy" })).toEqual([]);
  });

  it("保留合法 key 并去重", () => {
    expect(sanitizeDietaryTags(["no_spicy", "vegetarian", "no_spicy"])).toEqual([
      "no_spicy",
      "vegetarian",
    ]);
  });

  it("丢弃非字符串、空白与未注册项", () => {
    expect(
      sanitizeDietaryTags(["no_spicy", "", "  ", 123, null, ["x"], "no_spicy_x"])
    ).toEqual(["no_spicy"]);
  });

  it("trim 后再校验", () => {
    expect(sanitizeDietaryTags(["  no_spicy  "])).toEqual(["no_spicy"]);
  });
});

describe("satisfiesDietary", () => {
  it("无必需忌口时恒为真", () => {
    expect(satisfiesDietary({ dietary_tags: [] }, [])).toBe(true);
    expect(satisfiesDietary({ dietary_tags: null }, [])).toBe(true);
  });

  it("餐厅_tags 需完全覆盖必需忌口", () => {
    expect(satisfiesDietary({ dietary_tags: ["vegetarian"] }, ["vegetarian"])).toBe(true);
    expect(
      satisfiesDietary({ dietary_tags: ["vegetarian", "halal"] }, ["vegetarian"])
    ).toBe(true);
    expect(satisfiesDietary({ dietary_tags: ["halal"] }, ["vegetarian"])).toBe(false);
  });

  it("缺一个不满足即判否", () => {
    expect(
      satisfiesDietary({ dietary_tags: ["vegetarian"] }, ["vegetarian", "no_spicy"])
    ).toBe(false);
  });

  it("未标注的餐厅(dietary_tags 为空)无法满足任何忌口", () => {
    expect(satisfiesDietary({ dietary_tags: [] }, ["no_spicy"])).toBe(false);
  });
});

describe("summarizeDietary / collectRequiredTags", () => {
  it("汇总成员忌口并按人数降序", () => {
    const members: PartyMemberDietary[] = [
      { userId: "u1", nickname: "小明", dietaryTags: ["no_spicy"] },
      { userId: "u2", nickname: "小红", dietaryTags: ["no_spicy", "vegetarian"] },
      { userId: "u3", nickname: "小刚", dietaryTags: [] },
    ];
    const summary = summarizeDietary(members);
    expect(summary.map((s) => s.key)).toEqual(["no_spicy", "vegetarian"]);
    expect(summary[0].nicknames.sort()).toEqual(["小明", "小红"].sort());
    expect(summary[0].label).toBe("不吃辣");
  });

  it("无成员或无忌口时返回空", () => {
    expect(summarizeDietary([])).toEqual([]);
    expect(
      summarizeDietary([{ userId: "u1", nickname: "小明", dietaryTags: [] }])
    ).toEqual([]);
  });

  it("collectRequiredTags 去重且稳定排序", () => {
    const tags = collectRequiredTags([
      { userId: "u1", nickname: "a", dietaryTags: ["no_pork", "no_spicy"] },
      { userId: "u2", nickname: "b", dietaryTags: ["no_spicy"] },
    ]);
    expect(tags).toEqual(["no_pork", "no_spicy"]);
  });
});

describe("pickRandom", () => {
  it("空池返回 null", () => {
    expect(pickRandom([], () => 0.5)).toBeNull();
  });

  it("按 random 取值", () => {
    const pool = ["a", "b", "c"];
    expect(pickRandom(pool, () => 0)).toBe("a");
    expect(pickRandom(pool, () => 0.5)).toBe("b");
    expect(pickRandom(pool, () => 0.99)).toBe("c");
  });

  it("random 返回边界值时不越界", () => {
    const pool = ["a", "b"];
    expect(pickRandom(pool, () => 1)).toBe("b");
    expect(pickRandom(pool, () => -0.5)).toBe("a");
  });
});

describe("drawCandidate", () => {
  const candidates: DietaryCandidate[] = [
    { id: "c1", title: "川味小馆", dietary_tags: [] },
    { id: "c2", title: "素斋阁", dietary_tags: ["vegetarian"] },
    { id: "c3", title: "清真牛肉面", dietary_tags: ["halal"] },
    { id: "c4", title: "素食清真自助", dietary_tags: ["vegetarian", "halal"] },
  ];

  const nobody: PartyMemberDietary[] = [
    { userId: "u1", nickname: "小明", dietaryTags: [] },
  ];
  const veg: PartyMemberDietary[] = [
    { userId: "u2", nickname: "小红", dietaryTags: ["vegetarian"] },
  ];
  const vegAndHalal: PartyMemberDietary[] = [
    { userId: "u2", nickname: "小红", dietaryTags: ["vegetarian"] },
    { userId: "u3", nickname: "小刚", dietaryTags: ["halal"] },
  ];

  it("空候选池返回 null 且 mode 保持请求值", () => {
    const r = drawCandidate([], veg, "strict");
    expect(r.picked).toBeNull();
    expect(r.pool).toEqual([]);
  });

  it("无人填忌口时全池参与，mode 为 loose", () => {
    const r = drawCandidate(candidates, nobody, "strict", () => 0);
    expect(r.mode).toBe("loose");
    expect(r.pool).toHaveLength(4);
    expect(r.picked?.id).toBe("c1");
    expect(r.excludedCount).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it("strict 模式只抽能满足全部忌口的候选", () => {
    const r = drawCandidate(candidates, veg, "strict", () => 0);
    expect(r.mode).toBe("strict");
    expect(r.pool.map((c) => c.id)).toEqual(["c2", "c4"]);
    expect(r.excludedCount).toBe(2);
    expect(r.picked?.id).toBe("c2");
  });

  it("多个忌口需同时满足，取交集", () => {
    const r = drawCandidate(candidates, vegAndHalal, "strict", () => 0);
    expect(r.pool.map((c) => c.id)).toEqual(["c4"]);
    expect(r.picked?.id).toBe("c4");
  });

  it("strict 无可用候选时降级 loose，并保留忌口提醒", () => {
    const single = [{ id: "c1", title: "川味小馆", dietary_tags: [] }];
    const r = drawCandidate(single, veg, "strict", () => 0);
    expect(r.mode).toBe("loose");
    expect(r.pool).toHaveLength(1);
    expect(r.picked?.id).toBe("c1");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].key).toBe("vegetarian");
  });

  it("loose 模式始终全池参与", () => {
    const r = drawCandidate(candidates, vegAndHalal, "loose", () => 0.99);
    expect(r.mode).toBe("loose");
    expect(r.pool).toHaveLength(4);
    expect(r.picked?.id).toBe("c4");
  });

  it("提醒按人数降序排列昵称", () => {
    // halal 3 人、no_spicy 2 人 → halal 应排首位
    const members: PartyMemberDietary[] = [
      { userId: "u1", nickname: "甲", dietaryTags: ["halal"] },
      { userId: "u2", nickname: "乙", dietaryTags: ["no_spicy", "halal"] },
      { userId: "u3", nickname: "丙", dietaryTags: ["no_spicy", "halal"] },
    ];
    const r = drawCandidate(candidates, members, "loose", () => 0);
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0].key).toBe("halal");
    expect(r.warnings[0].nicknames.sort()).toEqual(["丙", "乙", "甲"].sort());
    expect(r.warnings[1].key).toBe("no_spicy");
    expect(r.warnings[1].nicknames).toHaveLength(2);
  });

  it("dietary_tags 为 null 的候选视为不满足任何忌口", () => {
    const withNull: DietaryCandidate[] = [
      { id: "n1", title: "未标注店", dietary_tags: null },
      { id: "n2", title: "素食店", dietary_tags: ["vegetarian"] },
    ];
    const r = drawCandidate(withNull, veg, "strict", () => 0);
    expect(r.pool.map((c) => c.id)).toEqual(["n2"]);
  });
});
