import { describe, it, expect } from "vitest";
import {
  levenshtein,
  nameSimilarity,
  normalizePhone,
  phoneEquals,
} from "@/lib/poi/similarity";

// ============================================================
// lib/poi/similarity.ts 名称/电话相似度校验测试
// ============================================================

describe("levenshtein", () => {
  it("相同字符串距离为 0", () => {
    expect(levenshtein("海底捞", "海底捞")).toBe(0);
  });

  it("单字差异距离为 1", () => {
    expect(levenshtein("小郡肝串串", "小郡干串串")).toBe(1);
  });

  it("完全不同等于较长串长度", () => {
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("空串与任意串距离为其长度", () => {
    expect(levenshtein("", "火锅")).toBe(2);
  });
});

describe("nameSimilarity", () => {
  it("完全相同返回 1", () => {
    expect(nameSimilarity("海底捞火锅", "海底捞火锅")).toBe(1);
  });

  it("忽略大小写与空白", () => {
    expect(nameSimilarity("coco 都可", "CoCo都可")).toBe(1);
  });

  it("一方包含另一方给高分（≥0.75）", () => {
    const score = nameSimilarity("海底捞火锅", "海底捞火锅（望京店）");
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it("短名被长名包含时也拿高分", () => {
    const score = nameSimilarity("望京海底捞", "海底捞");
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it("单字差异按编辑距离衰减", () => {
    expect(nameSimilarity("小郡肝串串", "小郡干串串")).toBeCloseTo(0.8, 2);
  });

  it("完全无关的低分", () => {
    expect(nameSimilarity("海底捞", "肯德基")).toBeLessThan(0.3);
  });

  it("空串返回 0", () => {
    expect(nameSimilarity("", "海底捞")).toBe(0);
  });
});

describe("normalizePhone", () => {
  it("去掉区号分隔符与空格", () => {
    expect(normalizePhone("027-8765 4321")).toBe("02787654321");
  });

  it("去掉 +86 前缀", () => {
    expect(normalizePhone("+86 138 0013 8000")).toBe("13800138000");
  });

  it("保留 400 号码原样（去分隔）", () => {
    expect(normalizePhone("400-123-4567")).toBe("4001234567");
  });

  it("空值返回空串", () => {
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone("  ")).toBe("");
  });
});

describe("phoneEquals", () => {
  it("格式不同但号码相同", () => {
    expect(phoneEquals("027-87654321", "02787654321")).toBe(true);
  });

  it("一方带区号一方不带（后缀匹配）", () => {
    expect(phoneEquals("02787654321", "87654321")).toBe(true);
  });

  it("400 号码分隔符不影响", () => {
    expect(phoneEquals("400-123-4567", "4001234567")).toBe(true);
  });

  it("不同号码返回 false", () => {
    expect(phoneEquals("02787654321", "02787654322")).toBe(false);
  });

  it("任一方为空返回 false", () => {
    expect(phoneEquals("", "87654321")).toBe(false);
    expect(phoneEquals("87654321", null)).toBe(false);
  });

  it("后缀过短（<7 位）不视为相同", () => {
    expect(phoneEquals("0278765", "8765")).toBe(false);
  });
});
