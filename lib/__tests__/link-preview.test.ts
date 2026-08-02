import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseShareText, parseExternalLink } from "@/lib/link-preview";

// ============================================================
// lib/link-preview.ts 测试
//
// parseShareText 为纯函数，直接断言各字段提取结果，无需 mock。
// parseExternalLink 依赖 fetch，用 vi.spyOn(globalThis, "fetch") mock
// 抓取结果（返回 ok 但空 body，模拟 fetchPageMeta 抓不到任何 meta），
// 并覆盖 SSRF 守卫（assertSafeFetchUrl）对各类非法 URL 的拒绝路径。
// 注：assertSafeFetchUrl 抛错信息为 "暂不支持该链接,仅支持美团/大众点评"
// （ASCII 逗号），用 /暂不支持/ 模糊匹配更稳。
// ============================================================

describe("parseShareText", () => {
  it("从分享文本提取 URL（含反引号包裹）", () => {
    const text =
      "【雾都小馆】快来试试这家餐厅吧！ 【地址：江岸区云林街14号1楼2号】【电话：15347053039】@美团 `http://dpurl.cn/BNE9Tdaz`";
    const result = parseShareText(text);
    expect(result.url).toBe("http://dpurl.cn/BNE9Tdaz");
  });

  it("提取未被反引号包裹的 URL", () => {
    const result = parseShareText("看这家 https://www.dianping.com/shop/123 不错");
    expect(result.url).toBe("https://www.dianping.com/shop/123");
  });

  it("提取店名【雾都小馆】", () => {
    const result = parseShareText("【雾都小馆】快来试试 @美团");
    expect(result.title).toBe("雾都小馆");
  });

  it("跳过【地址】/【电话】等括号，仅把第一个普通括号当店名", () => {
    const result = parseShareText("【地址：北京】【雾都小馆】");
    expect(result.title).toBe("雾都小馆");
  });

  it("提取地址【地址：xxx】（全角冒号）", () => {
    const result = parseShareText("【地址：江岸区云林街14号】");
    expect(result.address).toBe("江岸区云林街14号");
  });

  it("提取地址【位置:xxx】（半角冒号）", () => {
    const result = parseShareText("【位置:北京朝阳区】");
    expect(result.address).toBe("北京朝阳区");
  });

  it("提取电话【电话：xxx】", () => {
    const result = parseShareText("【电话：4001234567】");
    expect(result.phone).toBe("4001234567");
  });

  it("识别 @美团 → meituan", () => {
    expect(parseShareText("@美团 https://meituan.com/x").platform).toBe("meituan");
  });

  it("识别 @大众点评 → dianping", () => {
    expect(parseShareText("@大众点评 https://dianping.com/x").platform).toBe(
      "dianping"
    );
  });

  it("识别 @点评 → dianping", () => {
    expect(parseShareText("@点评 https://dianping.com/x").platform).toBe(
      "dianping"
    );
  });

  it("无平台标记时 platform 为 null", () => {
    expect(parseShareText("https://dianping.com/x").platform).toBeNull();
  });

  it("空字符串输入返回全 null", () => {
    expect(parseShareText("")).toEqual({
      url: null,
      title: null,
      address: null,
      phone: null,
      platform: null,
    });
  });

  it("空值输入返回全 null", () => {
    expect(parseShareText(null as unknown as string)).toEqual({
      url: null,
      title: null,
      address: null,
      phone: null,
      platform: null,
    });
  });

  it("无 URL 的纯文本返回全 null", () => {
    expect(parseShareText("今天天气不错，去散步吧")).toEqual({
      url: null,
      title: null,
      address: null,
      phone: null,
      platform: null,
    });
  });

  it("完整分享文本一次性提取全部字段", () => {
    const text =
      "【雾都小馆】快来试试这家餐厅吧！ 【地址：江岸区云林街14号1楼2号】【电话：15347053039】@大众点评 `http://dpurl.cn/BNE9Tdaz`";
    expect(parseShareText(text)).toEqual({
      url: "http://dpurl.cn/BNE9Tdaz",
      title: "雾都小馆",
      address: "江岸区云林街14号1楼2号",
      phone: "15347053039",
      platform: "dianping",
    });
  });
});

describe("parseExternalLink", () => {
  beforeEach(() => {
    // mock fetch：返回 ok 但空 body，模拟 fetchPageMeta 抓不到任何 meta
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 200 }) as Response
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("纯 URL 输入 + fetch 返回空 → 返回基本结构（title 回退为 url）", async () => {
    const url = "https://www.dianping.com/shop/123";
    const result = await parseExternalLink(url);
    expect(result).toEqual({
      platform: "dianping",
      url,
      title: url,
      coverImage: null,
      address: null,
      phone: null,
      rating: null,
      price: null,
    });
  });

  it("分享文本输入 + fetch 返回空 → 文本提取字段优先于网页抓取", async () => {
    const text = "【雾都小馆】@美团 `http://dpurl.cn/BNE9Tdaz`";
    const result = await parseExternalLink(text);
    expect(result).toEqual({
      platform: "meituan",
      url: "http://dpurl.cn/BNE9Tdaz",
      title: "雾都小馆",
      coverImage: null,
      address: null,
      phone: null,
      rating: null,
      price: null,
    });
    // fetch 被调用过一次（抓取商家页）
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("非白名单 https 域名 → 抛「暂不支持」（SSRF 守卫）", async () => {
    // 注：ftp:// 实际会返回 null（extractUrlFromText/isValidUrl 仅认 http(s)，
    // 不会进入抓取流程），故改用非白名单 https 域名触发 assertSafeFetchUrl 守卫。
    await expect(parseExternalLink("https://example.com")).rejects.toThrow(
      /暂不支持/
    );
  });

  it("私有 IP（192.168.1.1）→ 抛「暂不支持」", async () => {
    await expect(parseExternalLink("http://192.168.1.1")).rejects.toThrow(
      /暂不支持/
    );
  });

  it("localhost → 抛「暂不支持」", async () => {
    await expect(parseExternalLink("http://localhost:3000")).rejects.toThrow(
      /暂不支持/
    );
  });

  it("空输入返回 null", async () => {
    expect(await parseExternalLink("")).toBeNull();
  });
});
