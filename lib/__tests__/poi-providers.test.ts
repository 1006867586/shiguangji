import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  searchAmapPois,
  searchBaiduPois,
  isPoiProviderConfigured,
  calculateBaiduSn,
  PoiProviderError,
} from "@/lib/poi/providers";

// ============================================================
// lib/poi/providers.ts 高德/百度地图 POI 检索封装测试（mock fetch）
// ============================================================

function mockFetchOnce(body: unknown, init?: ResponseInit) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), init));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function lastCallUrl(fn: ReturnType<typeof vi.fn>): URL {
  const arg = fn.mock.calls[0][0];
  return arg instanceof URL ? arg : new URL(arg as string);
}

beforeEach(() => {
  process.env.AMAP_KEY = "test-amap-key";
  process.env.BAIDU_MAP_AK = "test-baidu-ak";
});

afterEach(() => {
  delete process.env.AMAP_KEY;
  delete process.env.BAIDU_MAP_AK;
  delete process.env.BAIDU_MAP_SK;
  vi.unstubAllGlobals();
});

describe("searchAmapPois", () => {
  it("构造搜索 POI 2.0 请求参数", async () => {
    const fn = mockFetchOnce({ status: "1", pois: [] });
    await searchAmapPois({ keyword: "海底捞", city: "北京" });

    const url = lastCallUrl(fn);
    expect(url.origin + url.pathname).toBe(
      "https://restapi.amap.com/v5/place/text"
    );
    expect(url.searchParams.get("key")).toBe("test-amap-key");
    expect(url.searchParams.get("keywords")).toBe("海底捞");
    expect(url.searchParams.get("region")).toBe("北京");
    expect(url.searchParams.get("city_limit")).toBe("true");
    expect(url.searchParams.get("show_fields")).toContain("business");
  });

  it("解析 POI 候选字段（gcj02 坐标/电话/评分/人均/分类）", async () => {
    mockFetchOnce({
      status: "1",
      pois: [
        {
          id: "B0FFG9abc",
          name: "海底捞火锅(望京店)",
          type: "餐饮服务;中餐厅;火锅店",
          address: "阜通东大街6号",
          location: "116.481028,39.996343",
          business: { tel: "010-64788888;010-64788899", rating: "4.5", cost: "120" },
        },
      ],
    });

    const pois = await searchAmapPois({ keyword: "海底捞", city: "北京" });
    expect(pois).toHaveLength(1);
    expect(pois[0]).toMatchObject({
      provider: "amap",
      id: "B0FFG9abc",
      name: "海底捞火锅(望京店)",
      address: "阜通东大街6号",
      phone: "010-64788888",
      category: "火锅店",
      rating: 4.5,
      price: 120,
      location: { lng: 116.481028, lat: 39.996343, coordType: "gcj02" },
    });
  });

  it("status 非 1 时抛出 PoiProviderError", async () => {
    mockFetchOnce({ status: "0", info: "INVALID_USER_KEY", infocode: "10001" });
    await expect(searchAmapPois({ keyword: "海底捞" })).rejects.toThrow(
      PoiProviderError
    );
  });

  it("未配置 AMAP_KEY 时抛错", async () => {
    delete process.env.AMAP_KEY;
    await expect(searchAmapPois({ keyword: "海底捞" })).rejects.toThrow(
      /AMAP_KEY/
    );
  });
});

describe("searchBaiduPois", () => {
  it("构造地点检索请求参数", async () => {
    const fn = mockFetchOnce({ status: 0, results: [] });
    await searchBaiduPois({ keyword: "海底捞", city: "北京" });

    const url = lastCallUrl(fn);
    expect(url.origin + url.pathname).toBe(
      "https://api.map.baidu.com/place/v2/search"
    );
    expect(url.searchParams.get("ak")).toBe("test-baidu-ak");
    expect(url.searchParams.get("query")).toBe("海底捞");
    expect(url.searchParams.get("region")).toBe("北京");
    expect(url.searchParams.get("city_limit")).toBe("true");
    expect(url.searchParams.get("scope")).toBe("2");
    expect(url.searchParams.get("output")).toBe("json");
  });

  it("解析 POI 候选字段（bd09 坐标/电话/详情链接/标签）", async () => {
    mockFetchOnce({
      status: 0,
      results: [
        {
          name: "海底捞火锅(望京店)",
          location: { lng: 116.49, lat: 39.99 },
          address: "阜通东大街6号方恒购物中心4层",
          city: "北京市",
          telephone: "010-64788888",
          detail_info: { tag: "美食;火锅", detail_url: "https://map.baidu.com/xx" },
        },
      ],
    });

    const pois = await searchBaiduPois({ keyword: "海底捞", city: "北京" });
    expect(pois).toHaveLength(1);
    expect(pois[0]).toMatchObject({
      provider: "baidu",
      name: "海底捞火锅(望京店)",
      address: "阜通东大街6号方恒购物中心4层",
      city: "北京市",
      phone: "010-64788888",
      category: "火锅",
      url: "https://map.baidu.com/xx",
      location: { lng: 116.49, lat: 39.99, coordType: "bd09" },
    });
  });

  it("status 非 0 时抛出 PoiProviderError", async () => {
    mockFetchOnce({ status: 2, message: "Request Parameter Error" });
    await expect(searchBaiduPois({ keyword: "海底捞" })).rejects.toThrow(
      PoiProviderError
    );
  });

  it("未配置 BAIDU_MAP_AK 时抛错", async () => {
    delete process.env.BAIDU_MAP_AK;
    await expect(searchBaiduPois({ keyword: "海底捞" })).rejects.toThrow(
      /BAIDU_MAP_AK/
    );
  });

  it("配了 BAIDU_MAP_SK 时附加 sn 签名参数", async () => {
    process.env.BAIDU_MAP_SK = "test-baidu-sk";
    const fn = mockFetchOnce({ status: 0, results: [] });
    await searchBaiduPois({ keyword: "海底捞", city: "北京" });

    const url = lastCallUrl(fn);
    const sn = url.searchParams.get("sn");
    expect(sn).not.toBeNull();
    expect(sn).toMatch(/^[a-f0-9]{32}$/);

    // 独立重算应一致（验证签名算法一致性）
    const expected = calculateBaiduSn(
      "test-baidu-sk",
      "/place/v2/search",
      Object.fromEntries(
        [...url.searchParams.entries()].filter(([k]) => k !== "sn")
      )
    );
    expect(sn).toBe(expected);
  });

  it("未配 BAIDU_MAP_SK 时不附加 sn（向后兼容旧版免 SN 的 AK）", async () => {
    const fn = mockFetchOnce({ status: 0, results: [] });
    await searchBaiduPois({ keyword: "海底捞" });
    expect(lastCallUrl(fn).searchParams.get("sn")).toBeNull();
  });
});

describe("calculateBaiduSn", () => {
  it("返回 32 位小写 hex（MD5 标准长度）", () => {
    const sn = calculateBaiduSn("sk", "/place/v2/search", {
      ak: "ak",
      query: "海底捞",
    });
    expect(sn).toMatch(/^[a-f0-9]{32}$/);
  });

  it("确定性：相同输入产出相同 SN", () => {
    const a = calculateBaiduSn("sk", "/place/v2/search", {
      ak: "ak",
      query: "海底捞",
      region: "北京",
    });
    const b = calculateBaiduSn("sk", "/place/v2/search", {
      ak: "ak",
      query: "海底捞",
      region: "北京",
    });
    expect(a).toBe(b);
  });

  it("参数顺序不影响 SN（按 key 字典序排序后再签名）", () => {
    const a = calculateBaiduSn("sk", "/place/v2/search", {
      query: "海底捞",
      ak: "ak",
      region: "北京",
    });
    const b = calculateBaiduSn("sk", "/place/v2/search", {
      ak: "ak",
      region: "北京",
      query: "海底捞",
    });
    expect(a).toBe(b);
  });

  it("SK 不同则 SN 不同", () => {
    const a = calculateBaiduSn("sk1", "/place/v2/search", {
      ak: "ak",
      query: "海底捞",
    });
    const b = calculateBaiduSn("sk2", "/place/v2/search", {
      ak: "ak",
      query: "海底捞",
    });
    expect(a).not.toBe(b);
  });
});

describe("isPoiProviderConfigured", () => {
  it("按环境变量返回配置状态", () => {
    expect(isPoiProviderConfigured()).toEqual({ amap: true, baidu: true });
    delete process.env.BAIDU_MAP_AK;
    expect(isPoiProviderConfigured()).toEqual({ amap: true, baidu: false });
  });
});
