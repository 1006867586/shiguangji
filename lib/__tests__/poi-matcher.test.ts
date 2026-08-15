import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { matchPoi, HIGH_THRESHOLD, MEDIUM_THRESHOLD } from "@/lib/poi/matcher";
import type { PoiCandidate } from "@/lib/poi/types";
import type { PoiSearchFn } from "@/lib/poi/matcher";

// ============================================================
// lib/poi/matcher.ts 多级搜索降级 + 相似度校验编排测试（注入 mock 搜索）
// ============================================================

function makeCandidate(partial: Partial<PoiCandidate>): PoiCandidate {
  return {
    provider: "amap",
    id: "test-id",
    name: "海底捞火锅(望京店)",
    address: null,
    phone: null,
    city: null,
    category: null,
    rating: null,
    price: null,
    url: null,
    location: { lng: 116.48, lat: 39.99, coordType: "gcj02" },
    ...partial,
  };
}

/** 按关键词分发的 mock 搜索函数 */
function keywordRouter(table: Record<string, PoiCandidate[]>): PoiSearchFn {
  return vi.fn(async (opts) => table[opts.keyword] ?? []);
}

beforeEach(() => {
  process.env.AMAP_KEY = "test-amap-key";
  process.env.BAIDU_MAP_AK = "test-baidu-ak";
});

afterEach(() => {
  delete process.env.AMAP_KEY;
  delete process.env.BAIDU_MAP_AK;
});

describe("matchPoi 多级降级", () => {
  it("第一级精确命中高分即提前返回，不再降级", async () => {
    const amap = keywordRouter({
      海底捞火锅: [makeCandidate({ name: "海底捞火锅(望京店)", phone: "010-64788888" })],
    });

    const result = await matchPoi(
      { name: "海底捞火锅", city: "北京" },
      { searchAmap: amap }
    );

    expect(result.matched).toBe(true);
    expect(result.tier).toBe("high");
    expect(result.candidate?.name).toBe("海底捞火锅(望京店)");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ level: 1, keyword: "海底捞火锅" });
  });

  it("第一级无结果时降级到清洗名再搜索", async () => {
    const amap = keywordRouter({
      "海底捞火锅(望京店)": [],
      海底捞火锅: [makeCandidate({ name: "海底捞火锅(望京店)" })],
    });

    const result = await matchPoi(
      { name: "海底捞火锅（望京店）" },
      { searchAmap: amap }
    );

    expect(result.matched).toBe(true);
    expect(result.attempts.map((a) => a.level)).toEqual([1, 2]);
    expect(result.attempts[1].keyword).toBe("海底捞火锅");
    expect(result.candidate).not.toBeNull();
  });

  it("清洗名也未命中时降级到核心品牌词", async () => {
    const amap = keywordRouter({
      "狮龙聚会·青山老牌烧烤(恩施街店)": [],
      "狮龙聚会·青山老牌烧烤": [],
      狮龙聚会: [makeCandidate({ name: "狮龙聚会·青山老牌烧烤(恩施街店)" })],
    });

    const result = await matchPoi(
      { name: "狮龙聚会·青山老牌烧烤(恩施街店)" },
      { searchAmap: amap }
    );

    expect(result.matched).toBe(true);
    expect(result.attempts.map((a) => a.level)).toEqual([1, 2, 3]);
    expect(result.attempts[2].keyword).toBe("狮龙聚会");
  });

  it("空名称直接返回 none", async () => {
    const result = await matchPoi({ name: "" }, { searchAmap: keywordRouter({}) });
    expect(result.tier).toBe("none");
    expect(result.matched).toBe(false);
    expect(result.candidate).toBeNull();
    expect(result.attempts).toHaveLength(0);
  });
});

describe("matchPoi 相似度校验", () => {
  it("电话一致显著加分（中分升为高置信）", async () => {
    // 名称相似度约 0.82（包含关系），无电话只能是 medium
    const amap = keywordRouter({
      "海底捞火锅（望京店）": [],
      海底捞火锅: [makeCandidate({ name: "海底捞", phone: "010-64788888" })],
    });

    const withPhone = await matchPoi(
      { name: "海底捞火锅（望京店）", knownPhone: "010-64788888" },
      { searchAmap: amap }
    );
    expect(withPhone.confidence).toBeGreaterThanOrEqual(HIGH_THRESHOLD);
    expect(withPhone.tier).toBe("high");

    const noPhone = await matchPoi(
      { name: "海底捞火锅（望京店）" },
      {
        searchAmap: keywordRouter({
          "海底捞火锅（望京店）": [],
          海底捞火锅: [makeCandidate({ name: "海底捞" })],
        }),
      }
    );
    expect(noPhone.confidence).toBeLessThan(HIGH_THRESHOLD);
    expect(noPhone.tier).toBe("medium");
    expect(noPhone.matched).toBe(true);
  });

  it("品类一致小幅加分", async () => {
    const base = { name: "海底捞", city: "北京" };
    const amap = keywordRouter({
      海底捞: [makeCandidate({ name: "海底捞", category: "火锅店" })],
    });

    const result = await matchPoi(
      { ...base, knownCategory: "火锅" },
      { searchAmap: amap }
    );
    // 名称全等 1.0，仅验证品类加分后封顶不超过 1
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.tier).toBe("high");
  });

  it("最佳候选低于 medium 但达到 low 时保留供人工复核", async () => {
    // 名称相似度约 0.67 → low 档
    const amap = keywordRouter({
      老王家私房菜: [makeCandidate({ name: "老王私房菜馆" })],
    });

    const result = await matchPoi({ name: "老王家私房菜" }, { searchAmap: amap });

    expect(result.matched).toBe(false);
    expect(result.tier).toBe("low");
    expect(result.candidate?.name).toBe("老王私房菜馆");
  });

  it("完全无关的候选不返回", async () => {
    const amap = keywordRouter({
      "海底捞(中关村店)": [],
      海底捞: [makeCandidate({ name: "肯德基(人民广场店)" })],
    });

    const result = await matchPoi(
      { name: "海底捞（中关村店）" },
      { searchAmap: amap }
    );

    expect(result.tier).toBe("none");
    expect(result.matched).toBe(false);
    expect(result.candidate).toBeNull();
  });
});

describe("matchPoi 平台编排", () => {
  it("单平台抛错不影响另一平台结果，错误记录在 attempts", async () => {
    const amap = vi.fn(async () => {
      throw new Error("amap down");
    });
    const baidu = keywordRouter({
      海底捞: [
        makeCandidate({ provider: "baidu", name: "海底捞火锅(望京店)" }),
      ],
    });

    const result = await matchPoi(
      { name: "海底捞" },
      { searchAmap: amap, searchBaidu: baidu }
    );

    expect(result.matched).toBe(true);
    const amapAttempt = result.attempts.find((a) => a.provider === "amap");
    expect(amapAttempt?.error).toContain("amap down");
    expect(result.attempts.find((a) => a.provider === "baidu")?.error).toBeUndefined();
  });

  it("未配置任何平台时返回 none 且不发请求", async () => {
    delete process.env.AMAP_KEY;
    delete process.env.BAIDU_MAP_AK;

    const result = await matchPoi({ name: "海底捞" });

    expect(result.tier).toBe("none");
    expect(result.matched).toBe(false);
    expect(result.attempts).toHaveLength(0);
  });

  it("仅配置高德时只查询高德", async () => {
    delete process.env.BAIDU_MAP_AK;
    const amap = keywordRouter({
      海底捞: [makeCandidate({ name: "海底捞火锅(望京店)" })],
    });

    const result = await matchPoi({ name: "海底捞" }, { searchAmap: amap });

    expect(result.matched).toBe(true);
    expect(result.attempts.map((a) => a.provider)).toEqual(["amap"]);
  });

  it("置信度阈值常量导出供上层复用", () => {
    expect(HIGH_THRESHOLD).toBeGreaterThan(MEDIUM_THRESHOLD);
    expect(MEDIUM_THRESHOLD).toBe(0.7);
  });
});
