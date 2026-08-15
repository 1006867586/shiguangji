import { describe, it, expect } from "vitest";
import {
  cleanShopName,
  extractCoreBrand,
  buildSearchVariants,
} from "@/lib/poi/name-cleaner";

// ============================================================
// lib/poi/name-cleaner.ts 店铺名清洗测试
// ============================================================

describe("cleanShopName", () => {
  it("去掉全角括号分店后缀", () => {
    expect(cleanShopName("海底捞火锅（望京店）")).toBe("海底捞火锅");
  });

  it("去掉半角括号分店后缀", () => {
    expect(cleanShopName("CoCo都可(万达广场店)")).toBe("CoCo都可");
  });

  it("去掉方括号分店后缀", () => {
    expect(cleanShopName("瑞幸咖啡【科技园店】")).toBe("瑞幸咖啡");
  });

  it("去掉非括号的 · 分店尾缀", () => {
    expect(cleanShopName("老乡鸡·武汉天地店")).toBe("老乡鸡");
  });

  it("去掉 emoji 与装饰符号", () => {
    expect(cleanShopName("✨⭐小郡肝串串🔥【旗舰店】")).toBe("小郡肝串串");
  });

  it("折叠多余空白", () => {
    expect(cleanShopName("  张记   包子铺  ")).toBe("张记 包子铺");
  });

  it("清洗后为空时回退原始名", () => {
    expect(cleanShopName("✨🔥")).toBe("✨🔥");
  });

  it("普通店名保持不变", () => {
    expect(cleanShopName("蔡林记热干面")).toBe("蔡林记热干面");
  });

  it("括号内是英文名而非分店时也一并去掉（用于搜索无碍）", () => {
    expect(cleanShopName("麦当劳（McDonald's）")).toBe("麦当劳");
  });

  it("null 安全处理", () => {
    expect(cleanShopName(null as unknown as string)).toBe("");
  });
});

describe("extractCoreBrand", () => {
  it("按 · 分隔取品牌段", () => {
    expect(extractCoreBrand("狮龙聚会·青山老牌烧烤(恩施街店)")).toBe(
      "狮龙聚会"
    );
  });

  it("无 · 时取清洗后的整体", () => {
    expect(extractCoreBrand("蔡林记热干面")).toBe("蔡林记热干面");
  });

  it("多个 · 取第一个非空段", () => {
    expect(extractCoreBrand("·茶颜悦色·幽兰拿铁")).toBe("茶颜悦色");
  });

  it("去掉尾部旗舰店/总店字样", () => {
    expect(extractCoreBrand("周黑鸭旗舰店")).toBe("周黑鸭");
  });
});

describe("buildSearchVariants", () => {
  it("生成 原始名→清洗名→核心品牌 三级查询词并去重", () => {
    expect(
      buildSearchVariants("狮龙聚会·青山老牌烧烤(恩施街店)")
    ).toEqual(["狮龙聚会·青山老牌烧烤(恩施街店)", "狮龙聚会·青山老牌烧烤", "狮龙聚会"]);
  });

  it("清洗名与原始名相同时去重", () => {
    expect(buildSearchVariants("蔡林记热干面")).toEqual(["蔡林记热干面"]);
  });

  it("空输入返回空数组", () => {
    expect(buildSearchVariants("")).toEqual([]);
    expect(buildSearchVariants("   ")).toEqual([]);
  });
});
