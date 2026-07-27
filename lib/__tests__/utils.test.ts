import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatRelativeTime,
  formatDateTime,
  isUuid,
  isUrl,
  extractUrlFromText,
  detectPlatform,
  safeRedirectPath,
  isValidInviteCode,
  generateInviteCode,
  getExt,
  safeParseInt,
  safeErrorMessage,
  sanitizeExternalLink,
  cn,
} from "@/lib/utils";

// ============================================================
// lib/utils.ts 纯函数测试
// ============================================================

describe("formatRelativeTime", () => {
  beforeEach(() => {
    // 固定"当前时间"为 2025-06-15 12:00:00 UTC
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("30 秒内返回「刚刚」", () => {
    expect(formatRelativeTime(new Date("2025-06-15T11:59:40Z"))).toBe("刚刚");
  });

  it("当前时间返回「刚刚」", () => {
    expect(formatRelativeTime(new Date("2025-06-15T12:00:00Z"))).toBe("刚刚");
  });

  it("5 分钟前返回相对分钟", () => {
    const result = formatRelativeTime(new Date("2025-06-15T11:55:00Z"));
    expect(result).toContain("5");
    expect(result).toContain("分钟");
  });

  it("3 小时前返回相对小时", () => {
    const result = formatRelativeTime(new Date("2025-06-15T09:00:00Z"));
    expect(result).toContain("3");
    expect(result).toContain("小时");
  });

  it("3 天前返回相对天", () => {
    const result = formatRelativeTime(new Date("2025-06-12T12:00:00Z"));
    expect(result).toContain("3");
    expect(result).toContain("天");
  });

  it("10 天前（同年）返回短日期格式", () => {
    const result = formatRelativeTime(new Date("2025-06-05T12:00:00Z"));
    // 短日期格式包含月/日
    expect(result).toMatch(/\d{2}\/\d{2}/);
  });

  it("跨年日期返回完整日期格式（含年份）", () => {
    const result = formatRelativeTime(new Date("2024-06-05T12:00:00Z"));
    // 完整日期包含年份
    expect(result).toContain("2024");
  });

  it("接受 ISO 字符串输入", () => {
    const result = formatRelativeTime("2025-06-15T11:55:00Z");
    expect(result).toContain("分钟");
  });
});

describe("formatDateTime", () => {
  it("返回格式化日期时间字符串", () => {
    const result = formatDateTime("2025-06-15T12:00:00Z");
    expect(result).toMatch(/2025/);
    expect(result).toMatch(/06/);
    expect(result).toMatch(/15/);
  });

  it("接受 Date 对象", () => {
    const result = formatDateTime(new Date("2025-01-01T00:00:00Z"));
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("isUuid", () => {
  it("接受标准 UUID v4", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("接受小写 UUID", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000".toLowerCase())).toBe(true);
  });

  it("拒绝非 UUID 字符串", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("拒绝空字符串", () => {
    expect(isUuid("")).toBe(false);
  });

  it("拒绝长度不足的字符串", () => {
    expect(isUuid("550e8400-e29b-41d4-a716")).toBe(false);
  });

  it("拒绝含非法字符的 UUID", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-44665544000g")).toBe(false);
  });
});

describe("isUrl", () => {
  it("接受 https URL", () => {
    expect(isUrl("https://example.com")).toBe(true);
  });

  it("接受 http URL", () => {
    expect(isUrl("http://localhost:3000")).toBe(true);
  });

  it("拒绝 ftp 协议", () => {
    expect(isUrl("ftp://example.com")).toBe(false);
  });

  it("拒绝非 URL 字符串", () => {
    expect(isUrl("not-a-url")).toBe(false);
  });

  it("拒绝空字符串", () => {
    expect(isUrl("")).toBe(false);
  });

  it("拒绝 javascript 协议", () => {
    expect(isUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("extractUrlFromText", () => {
  it("从文本中提取 https URL", () => {
    const result = extractUrlFromText("看这个 https://example.com 链接");
    expect(result).toBe("https://example.com");
  });

  it("提取 http URL", () => {
    const result = extractUrlFromText("访问 http://localhost:3000/path");
    expect(result).toBe("http://localhost:3000/path");
  });

  it("无 URL 时返回 null", () => {
    expect(extractUrlFromText("没有链接的文本")).toBeNull();
  });

  it("空字符串返回 null", () => {
    expect(extractUrlFromText("")).toBeNull();
  });

  it("null 安全处理（传入空值）", () => {
    expect(extractUrlFromText(null as unknown as string)).toBeNull();
  });

  it("提取带查询参数的 URL", () => {
    const result = extractUrlFromText("访问 https://example.com/page?q=1&b=2");
    expect(result).toBe("https://example.com/page?q=1&b=2");
  });
});

describe("detectPlatform", () => {
  it("识别点评链接", () => {
    expect(detectPlatform("https://www.dianping.com/shop/123")).toBe("dianping");
  });

  it("识别 dpurl 短链", () => {
    expect(detectPlatform("https://dpurl.com/abc")).toBe("dianping");
  });

  it("识别美团链接", () => {
    // 用户粘贴的美团链接保持原平台标记，不归一化
    expect(detectPlatform("https://meituan.com/restaurant/456")).toBe("meituan");
  });

  it("识别 meituanwa 域名", () => {
    expect(detectPlatform("https://meituanwa.com/x")).toBe("meituan");
  });

  it("其他链接返回 other", () => {
    expect(detectPlatform("https://example.com")).toBe("other");
  });

  it("非 URL 输入返回 other", () => {
    expect(detectPlatform("not-a-url")).toBe("other");
  });
});

describe("safeRedirectPath", () => {
  it("接受正常站内路径", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
  });

  it("接受带查询参数的站内路径", () => {
    expect(safeRedirectPath("/path?q=1")).toBe("/path?q=1");
  });

  it("拒绝协议相对 URL（开放重定向防护）", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/");
  });

  it("拒绝绝对 URL", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/");
  });

  it("null 返回根路径", () => {
    expect(safeRedirectPath(null)).toBe("/");
  });

  it("空字符串返回根路径", () => {
    expect(safeRedirectPath("")).toBe("/");
  });

  it("拒绝反斜杠开头的路径", () => {
    expect(safeRedirectPath("\\evil.com")).toBe("/");
  });
});

describe("isValidInviteCode", () => {
  it("接受 6 位大写字母+数字", () => {
    expect(isValidInviteCode("ABC123")).toBe(true);
  });

  it("接受纯大写字母", () => {
    expect(isValidInviteCode("ABCDEF")).toBe(true);
  });

  it("接受纯数字", () => {
    expect(isValidInviteCode("123456")).toBe(true);
  });

  it("拒绝小写字母", () => {
    expect(isValidInviteCode("abc123")).toBe(false);
  });

  it("拒绝长度不足", () => {
    expect(isValidInviteCode("ABC12")).toBe(false);
  });

  it("拒绝长度超限", () => {
    expect(isValidInviteCode("ABCDEFG")).toBe(false);
  });

  it("拒绝空字符串", () => {
    expect(isValidInviteCode("")).toBe(false);
  });

  it("拒绝含特殊字符", () => {
    expect(isValidInviteCode("AB-123")).toBe(false);
  });
});

describe("generateInviteCode", () => {
  it("默认生成 6 位邀请码", () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(6);
    expect(isValidInviteCode(code)).toBe(true);
  });

  it("支持自定义长度", () => {
    const code = generateInviteCode(8);
    expect(code).toHaveLength(8);
  });

  it("仅使用合法字符集（排除易混淆字符）", () => {
    const code = generateInviteCode(100);
    // 字符集为 ABCDEFGHJKMNPQRSTUVWXYZ23456789（不含 I L O 0 1）
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
  });

  it("每次生成结果不同（随机性）", () => {
    const code1 = generateInviteCode();
    const code2 = generateInviteCode();
    // 极低概率相同，1000 次中几乎不可能
    expect(code1).not.toBe(code2);
  });
});

describe("getExt", () => {
  it("提取常见扩展名", () => {
    expect(getExt("photo.jpg")).toBe("jpg");
  });

  it("大写扩展名转小写", () => {
    expect(getExt("photo.JPEG")).toBe("jpeg");
  });

  it("无扩展名返回默认 jpg", () => {
    expect(getExt("noext")).toBe("jpg");
  });

  it("多扩展名取最后一个", () => {
    expect(getExt("archive.tar.gz")).toBe("gz");
  });
});

describe("safeParseInt", () => {
  it("解析正常数字", () => {
    expect(safeParseInt("10", 20)).toBe(10);
  });

  it("null 返回默认值", () => {
    expect(safeParseInt(null, 20)).toBe(20);
  });

  it("0 或负数返回默认值", () => {
    expect(safeParseInt("0", 20)).toBe(20);
    expect(safeParseInt("-5", 20)).toBe(20);
  });

  it("非数字返回默认值", () => {
    expect(safeParseInt("abc", 20)).toBe(20);
  });

  it("超过上限被截断", () => {
    expect(safeParseInt("999", 20, 100)).toBe(100);
  });

  it("浮点数向下取整", () => {
    expect(safeParseInt("3.7", 20)).toBe(3);
  });
});

describe("safeErrorMessage", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("从 Error 实例提取 message（非生产环境）", () => {
    const result = safeErrorMessage(new Error("test error"), "fallback");
    // NODE_ENV !== "production" 时返回真实 message
    expect(result).toBe("test error");
  });

  it("从对象提取 message 字段", () => {
    const result = safeErrorMessage({ message: "pg error" }, "fallback");
    expect(result).toBe("pg error");
  });

  it("字符串错误直接返回", () => {
    const result = safeErrorMessage("string error", "fallback");
    expect(result).toBe("string error");
  });

  it("未知类型返回 fallback", () => {
    const result = safeErrorMessage(42, "fallback");
    expect(result).toBe("fallback");
  });

  it("null 返回 fallback", () => {
    const result = safeErrorMessage(null, "fallback");
    expect(result).toBe("fallback");
  });

  it("始终调用 console.error 记录原始错误", () => {
    safeErrorMessage(new Error("test"), "fallback");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("sanitizeExternalLink", () => {
  it("清洗合法对象", () => {
    const result = sanitizeExternalLink({
      platform: "dianping",
      url: "https://dianping.com",
      title: "测试",
      coverImage: "https://img.com/x.jpg",
      rating: 4.5,
      address: "北京",
      phone: "123",
      price: "100",
    });
    expect(result).toEqual({
      platform: "dianping",
      url: "https://dianping.com",
      title: "测试",
      coverImage: "https://img.com/x.jpg",
      rating: 4.5,
      address: "北京",
      phone: "123",
      price: "100",
    });
  });

  it("非法 platform 回退到 other", () => {
    const result = sanitizeExternalLink({ platform: "invalid", url: "" });
    expect(result?.platform).toBe("other");
  });

  it("null 返回 null", () => {
    expect(sanitizeExternalLink(null)).toBeNull();
  });

  it("数组返回 null", () => {
    expect(sanitizeExternalLink([1, 2, 3])).toBeNull();
  });

  it("缺失字段填充默认值", () => {
    const result = sanitizeExternalLink({});
    expect(result).toEqual({
      platform: "other",
      url: "",
      title: "",
      coverImage: null,
      rating: null,
      address: null,
      phone: null,
      price: null,
    });
  });

  it("非字符串 url 转为空字符串", () => {
    const result = sanitizeExternalLink({ url: 123 });
    expect(result?.url).toBe("");
  });
});

describe("cn", () => {
  it("合并多个 className", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("处理条件 className", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("解决 Tailwind 冲突（后者优先）", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
