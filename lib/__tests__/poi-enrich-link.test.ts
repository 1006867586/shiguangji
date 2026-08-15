import { describe, it, expect, vi } from "vitest";
import { enrichLinkWithPoi } from "@/lib/poi/enrich";
import { parseExternalLink } from "@/lib/link-preview";
import type { MatchResult } from "@/lib/poi/matcher";
import type { PoiCandidate } from "@/lib/poi/types";
import type { ExternalLink } from "@/types";

// ============================================================
// lib/poi/enrich.ts enrichLinkWithPoi（链接解析 POI 兜底）测试
// ============================================================

function makeCandidate(partial: Partial<PoiCandidate>): PoiCandidate {
  return {
    provider: "amap",
    id: "test-id",
    name: "雾都小馆",
    address: "江岸区云林街14号1楼2号",
    phone: "15347053039",
    city: "武汉市",
    category: "川菜",
    rating: 4.4,
    price: 67,
    url: null,
    location: { lng: 114.3, lat: 30.6, coordType: "gcj02" },
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

function makeLink(partial: Partial<ExternalLink>): ExternalLink {
  return {
    platform: "dianping",
    url: "http://dpurl.cn/BNE9Tdaz",
    title: "雾都小馆",
    coverImage: "https://p0.meituan.net/cover.jpg",
    rating: null,
    address: null,
    phone: null,
    price: "¥67/人",
    category: null,
    ...partial,
  };
}

describe("enrichLinkWithPoi", () => {
  it("高置信命中补齐缺失的电话/地址/品类/评分", async () => {
    const matchFn = vi.fn(async () => makeMatchResult({}));

    const result = await enrichLinkWithPoi(makeLink({}), { matchFn });

    expect(result.link).toMatchObject({
      phone: "15347053039",
      address: "江岸区云林街14号1楼2号",
      category: "川菜",
      rating: 4.4,
    });
    expect(result.link.coverImage).toBe("https://p0.meituan.net/cover.jpg");
    expect(result.link.price).toBe("¥67/人");
    expect(result.tier).toBe("high");
  });

  it("已有字段不覆盖（价格字符串格式保留，不套用 POI 人均数字）", async () => {
    const matchFn = vi.fn(async () => makeMatchResult({}));

    const result = await enrichLinkWithPoi(
      makeLink({
        phone: "027-87654321",
        address: "云林街14号",
        category: "火锅",
        rating: 4.8,
      }),
      { matchFn }
    );

    expect(result.link).toMatchObject({
      phone: "027-87654321",
      address: "云林街14号",
      category: "火锅",
      rating: 4.8,
    });
    expect(result.link.price).toBe("¥67/人");
  });

  it("字段齐全时不发起匹配", async () => {
    const matchFn = vi.fn(async () => makeMatchResult({}));

    await enrichLinkWithPoi(
      makeLink({ phone: "1", address: "a", category: "c", rating: 4.5 }),
      { matchFn }
    );

    expect(matchFn).not.toHaveBeenCalled();
  });

  it("无店名时不发起匹配（链接解析可能拿不到标题）", async () => {
    const matchFn = vi.fn(async () => makeMatchResult({}));

    const result = await enrichLinkWithPoi(makeLink({ title: "" }), { matchFn });

    expect(matchFn).not.toHaveBeenCalled();
    expect(result.tier).toBe("none");
  });

  it("低置信不补齐，保留原值", async () => {
    const matchFn = vi.fn(async () =>
      makeMatchResult({ matched: false, tier: "low", confidence: 0.6 })
    );

    const result = await enrichLinkWithPoi(makeLink({}), { matchFn });

    expect(result.link.phone).toBeNull();
    expect(result.link.address).toBeNull();
    expect(result.tier).toBe("low");
  });

  it("匹配抛错不阻塞，返回原链接", async () => {
    const matchFn = vi.fn(async () => {
      throw new Error("amap down");
    });

    const original = makeLink({});
    const result = await enrichLinkWithPoi(original, { matchFn });

    expect(result.link).toEqual(original);
    expect(result.tier).toBe("none");
  });

  it("把已知电话/品类传给匹配函数用于加分校验", async () => {
    const matchFn = vi.fn(async () => makeMatchResult({}));

    await enrichLinkWithPoi(
      makeLink({ phone: "15347053039", category: "川菜(雾都)" }),
      { matchFn }
    );

    expect(matchFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "雾都小馆",
        knownPhone: "15347053039",
        knownCategory: "川菜(雾都)",
      })
    );
  });

  it("city 选项透传（分享文本地址中提取的城市提示）", async () => {
    const matchFn = vi.fn(async () => makeMatchResult({}));

    await enrichLinkWithPoi(makeLink({}), { matchFn, city: "武汉" });

    expect(matchFn).toHaveBeenCalledWith(
      expect.objectContaining({ city: "武汉" })
    );
  });
});

describe("parseExternalLink 集成 POI 兜底", () => {
  it("分享文本缺电话/地址时，用店名走地图匹配补齐", async () => {
    const matchFn = vi.fn(async () => makeMatchResult({}));

    // 无 URL 的分享文本：避免测试中发起真实 HTTP 抓取
    const parsed = await parseExternalLink(
      "【雾都小馆】快来试试这家餐厅吧！",
      { poiMatchFn: matchFn }
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.phone).toBe("15347053039");
    expect(parsed?.address).toBe("江岸区云林街14号1楼2号");
    expect(parsed?.category).toBe("川菜");
    expect(matchFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: "雾都小馆" })
    );
  });

  it("分享文本自带电话/地址时不再发起 POI 匹配（仅缺品类评分除外）", async () => {
    const matchFn = vi.fn(async () => makeMatchResult({}));

    await parseExternalLink(
      "【雾都小馆】快来试试！【地址：江岸区云林街14号】【电话：15347053039】【人均：67元】",
      { poiMatchFn: matchFn }
    );

    // 电话地址已在，但品类/评分缺失 → 仍会匹配（只补空字段）
    expect(matchFn).toHaveBeenCalled();
  });
});
