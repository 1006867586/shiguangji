import { describe, it, expect, vi } from "vitest";
import { enrichPlacesWithPoi } from "@/lib/poi/enrich";
import type { MatchResult } from "@/lib/poi/matcher";
import type { PoiCandidate } from "@/lib/poi/types";

// ============================================================
// lib/poi/enrich.ts 批量 POI 补齐编排测试（注入 mock matchPoi）
// ============================================================

function makeCandidate(partial: Partial<PoiCandidate>): PoiCandidate {
  return {
    provider: "amap",
    id: "test-id",
    name: "海底捞火锅(望京店)",
    address: "阜通东大街6号",
    phone: "010-64788888",
    city: "北京市",
    category: "火锅店",
    rating: 4.5,
    price: 120,
    url: null,
    location: { lng: 116.48, lat: 39.99, coordType: "gcj02" },
    ...partial,
  };
}

function makeMatchResult(partial: Partial<MatchResult>): MatchResult {
  return {
    matched: true,
    tier: "high",
    confidence: 0.95,
    candidate: makeCandidate({}),
    attempts: [],
    ...partial,
  };
}

/** 按店名分发的 mock matchPoi */
function nameRouter(table: Record<string, MatchResult>) {
  return vi.fn(async (input: { name: string }) => {
    const r = table[input.name];
    if (!r) return makeMatchResult({ matched: false, tier: "none", candidate: null });
    return r;
  });
}

const PLACE = {
  id: "p1",
  title: "海底捞火锅(望京店)",
  address: null as string | null,
  phone: null as string | null,
  category: null as string | null,
  rating: null as number | null,
};

describe("enrichPlacesWithPoi", () => {
  it("高置信命中生成补齐补丁，仅填空字段", async () => {
    const match = nameRouter({
      "海底捞火锅(望京店)": makeMatchResult({}),
    });

    const result = await enrichPlacesWithPoi([PLACE], { matchFn: match });

    expect(result.patches).toHaveLength(1);
    expect(result.patches[0].id).toBe("p1");
    expect(result.patches[0].updates).toEqual({
      phone: "010-64788888",
      address: "阜通东大街6号",
      category: "火锅店",
      rating: 4.5,
    });
    expect(result.matched).toBe(1);
    expect(match).toHaveBeenCalledWith(
      expect.objectContaining({ name: "海底捞火锅(望京店)" })
    );
  });

  it("已有字段不覆盖（只补缺失）", async () => {
    const match = nameRouter({
      老王家: makeMatchResult({
        candidate: makeCandidate({
          name: "老王家私房菜",
          phone: "010-99999999",
          address: "新地址1号",
          rating: 3.9,
        }),
      }),
    });

    const result = await enrichPlacesWithPoi(
      [
        {
          id: "p2",
          title: "老王家",
          address: "旧地址8号",
          phone: null,
          category: "私房菜",
          rating: 4.8,
        },
      ],
      { matchFn: match }
    );

    expect(result.patches[0].updates).toEqual({ phone: "010-99999999" });
  });

  it("电话/地址/品类齐全的行跳过匹配，不发请求", async () => {
    const match = nameRouter({});
    const result = await enrichPlacesWithPoi(
      [
        {
          id: "p3",
          title: "完整店铺",
          address: "地址",
          phone: "010-11111111",
          category: "火锅",
          rating: null,
        },
      ],
      { matchFn: match }
    );

    expect(match).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.patches).toHaveLength(0);
  });

  it("low/none 档不生成补丁，计入 failed/unmatched", async () => {
    const match = nameRouter({
      低分店: makeMatchResult({ matched: false, tier: "low", confidence: 0.6, candidate: makeCandidate({}) }),
      无结果店: makeMatchResult({ matched: false, tier: "none", confidence: 0, candidate: null }),
    });

    const result = await enrichPlacesWithPoi(
      [
        { id: "a", title: "低分店", address: null, phone: null, category: null, rating: null },
        { id: "b", title: "无结果店", address: null, phone: null, category: null, rating: null },
      ],
      { matchFn: match }
    );

    expect(result.patches).toHaveLength(0);
    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(2);
  });

  it("matchPoi 抛错不中断批次，计入 errors", async () => {
    const match = vi.fn(async () => {
      throw new Error("amap down");
    });

    const result = await enrichPlacesWithPoi(
      [
        { id: "a", title: "店A", address: null, phone: null, category: null, rating: null },
        { id: "b", title: "店B", address: null, phone: null, category: null, rating: null },
      ],
      { matchFn: match }
    );

    expect(match).toHaveBeenCalledTimes(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatchObject({ id: "a" });
    expect(result.matched).toBe(0);
  });

  it("串行调用并按 delayMs 间隔（保护地图 API 配额）", async () => {
    vi.useFakeTimers();
    try {
      const match = vi.fn(async () => makeMatchResult({}));
      const promise = enrichPlacesWithPoi(
        [
          { id: "a", title: "店A", address: null, phone: null, category: null, rating: null },
          { id: "b", title: "店B", address: null, phone: null, category: null, rating: null },
        ],
        { matchFn: match, delayMs: 200 }
      );
      // 推进假时钟直至完成
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(match).toHaveBeenCalledTimes(2);
      expect(result.matched).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("city 透传给 matchFn", async () => {
    const match = nameRouter({});
    await enrichPlacesWithPoi([PLACE], { matchFn: match, city: "武汉" });
    expect(match).toHaveBeenCalledWith(expect.objectContaining({ city: "武汉" }));
  });

  it("空输入直接返回零统计", async () => {
    const match = nameRouter({});
    const result = await enrichPlacesWithPoi([], { matchFn: match });
    expect(result).toEqual({
      patches: [],
      matched: 0,
      unmatched: 0,
      skipped: 0,
      errors: [],
      budgetExhausted: 0,
    });
  });

  it("时间预算耗尽时停止处理，剩余行计入 budgetExhausted", async () => {
    vi.useFakeTimers();
    try {
      // 每次匹配消耗 1s（用 setTimeout 模拟耗时）
      const match = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return makeMatchResult({});
      });
      const places = Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        title: `店${i}`,
        address: null,
        phone: null,
        category: null,
        rating: null,
      }));

      const promise = enrichPlacesWithPoi(places, {
        matchFn: match,
        delayMs: 0,
        timeBudgetMs: 2500,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      // 预算 2.5s，每条 1s → 处理 3 条后停止
      expect(result.matched).toBe(3);
      expect(result.budgetExhausted).toBe(2);
      expect(match).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
