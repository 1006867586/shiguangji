import { describe, it, expect } from "vitest";
import {
  containsSensitiveWord,
  maskSensitiveWords,
  SENSITIVE_WORDS,
} from "@/lib/sensitive-words";

// ============================================================
// lib/sensitive-words.ts 敏感词过滤测试
// ============================================================

describe("containsSensitiveWord", () => {
  it("正常文本不包含敏感词", () => {
    const result = containsSensitiveWord("今天天气真好，我们去吃饭吧");
    expect(result.found).toBe(false);
    expect(result.words).toEqual([]);
  });

  it("检测到赌博类敏感词", () => {
    const result = containsSensitiveWord("这里有赌博内容");
    expect(result.found).toBe(true);
    expect(result.words).toContain("赌博");
  });

  it("检测到色情类敏感词", () => {
    const result = containsSensitiveWord("传播色情信息");
    expect(result.found).toBe(true);
    expect(result.words).toContain("色情");
  });

  it("检测到辱骂类敏感词", () => {
    const result = containsSensitiveWord("你真是个傻逼");
    expect(result.found).toBe(true);
    expect(result.words).toContain("傻逼");
  });

  it("空字符串不包含敏感词", () => {
    const result = containsSensitiveWord("");
    expect(result.found).toBe(false);
    expect(result.words).toEqual([]);
  });

  it("null 安全处理", () => {
    const result = containsSensitiveWord(null as unknown as string);
    expect(result.found).toBe(false);
  });

  it("大小写不敏感", () => {
    // "AV" 在词库中存储为 " AV "（含空格）
    const result = containsSensitiveWord("视频 AV 内容");
    expect(result.found).toBe(true);
    expect(result.words).toContain("AV");
  });

  it("多个敏感词同时命中", () => {
    const result = containsSensitiveWord("赌博和色情都有");
    expect(result.found).toBe(true);
    expect(result.words.length).toBeGreaterThanOrEqual(2);
    expect(result.words).toEqual(expect.arrayContaining(["赌博", "色情"]));
  });

  it("词库非空", () => {
    expect(SENSITIVE_WORDS.length).toBeGreaterThan(0);
  });

  it("长词优先匹配（分裂国家）", () => {
    // "分裂国家" 是完整敏感词，不应只匹配部分
    const result = containsSensitiveWord("讨论分裂国家问题");
    expect(result.found).toBe(true);
    expect(result.words).toContain("分裂国家");
  });
});

describe("maskSensitiveWords", () => {
  it("替换赌博为 ***", () => {
    expect(maskSensitiveWords("这里有赌博内容")).toBe("这里有***内容");
  });

  it("替换色情为 ***", () => {
    expect(maskSensitiveWords("传播色情信息")).toBe("传播***信息");
  });

  it("正常文本原样返回", () => {
    expect(maskSensitiveWords("正常文本")).toBe("正常文本");
  });

  it("空字符串原样返回", () => {
    expect(maskSensitiveWords("")).toBe("");
  });

  it("null 安全处理", () => {
    expect(maskSensitiveWords(null as unknown as string)).toBeNull();
  });

  it("多个敏感词全部替换", () => {
    const result = maskSensitiveWords("赌博和色情都有");
    expect(result).toBe("***和***都有");
  });

  it("同一敏感词多次出现全部替换", () => {
    expect(maskSensitiveWords("赌博赌博赌博")).toBe("*********");
  });

  it("大小写不敏感替换", () => {
    const result = maskSensitiveWords("视频 AV 内容");
    expect(result).toContain("***");
    expect(result).not.toContain("AV");
  });

  it("长词完整替换（不残留部分）", () => {
    const result = maskSensitiveWords("讨论分裂国家问题");
    expect(result).toBe("讨论***问题");
    // 不应残留 "国家" 或 "分裂" 单独的部分
    expect(result).not.toContain("分裂");
    expect(result).not.toContain("国家");
  });
});
