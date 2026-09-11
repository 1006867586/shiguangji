import { describe, it, expect } from "vitest";
import {
  parseMentions,
  extractMentionedUserIds,
  buildMentionUserMap,
  type MentionMember,
} from "@/lib/mention";

// ============================================================
// lib/mention.ts @提及解析测试
// ============================================================

describe("parseMentions", () => {
  it("提取单个中文昵称", () => {
    expect(parseMentions("你好 @张三")).toEqual(["张三"]);
  });

  it("提取多个不同昵称", () => {
    const result = parseMentions("@Alice 和 @Bob 一起");
    expect(result).toEqual(expect.arrayContaining(["Alice", "Bob"]));
    expect(result).toHaveLength(2);
  });

  it("提取中文昵称", () => {
    expect(parseMentions("@小明 @小红")).toEqual(
      expect.arrayContaining(["小明", "小红"])
    );
  });

  it("无 @ 提及返回空数组", () => {
    expect(parseMentions("没有提及的普通文本")).toEqual([]);
  });

  it("空字符串返回空数组", () => {
    expect(parseMentions("")).toEqual([]);
  });

  it("null 安全处理（传入非字符串）", () => {
    expect(parseMentions(null as unknown as string)).toEqual([]);
  });

  it("重复提及去重", () => {
    const result = parseMentions("@张三 你好 @张三 再见");
    expect(result).toEqual(["张三"]);
  });

  it("单个字符昵称", () => {
    expect(parseMentions("@a 你好")).toEqual(["a"]);
  });

  it("30 字符昵称（边界值，合法）", () => {
    const name = "a".repeat(30);
    expect(parseMentions(`@${name}`)).toEqual([name]);
  });

  it("31 字符昵称被过滤（超长）", () => {
    const name = "a".repeat(31);
    expect(parseMentions(`@${name}`)).toEqual([]);
  });

  it("在标点处停止匹配", () => {
    const result = parseMentions("@张三，你好");
    expect(result).toEqual(["张三"]);
  });

  it("英文标点处停止匹配", () => {
    const result = parseMentions("Hello @Alice, how are you?");
    expect(result).toEqual(["Alice"]);
  });

  it("混合中英文昵称", () => {
    const result = parseMentions("@张三 和 @Alice");
    expect(result).toEqual(expect.arrayContaining(["张三", "Alice"]));
  });

  it("@ 后紧跟标点不匹配", () => {
    expect(parseMentions("@，你好")).toEqual([]);
  });
});

describe("extractMentionedUserIds", () => {
  const members: MentionMember[] = [
    { user_id: "u1", profile: { nickname: "张三" } },
    { user_id: "u2", profile: { nickname: "李四" } },
    { user_id: "u3", profile: { nickname: "Alice" } },
    { user_id: "u4", profile: null },
    { user_id: "u5", profile: { nickname: "" } },
  ];

  it("匹配单个成员", () => {
    expect(extractMentionedUserIds("你好 @张三", members)).toEqual(["u1"]);
  });

  it("匹配多个成员", () => {
    const result = extractMentionedUserIds("@张三 和 @李四", members);
    expect(result).toEqual(expect.arrayContaining(["u1", "u2"]));
    expect(result).toHaveLength(2);
  });

  it("大小写不敏感匹配", () => {
    expect(extractMentionedUserIds("@ALICE", members)).toEqual(["u3"]);
  });

  it("无匹配昵称返回空数组", () => {
    expect(extractMentionedUserIds("@不存在的用户", members)).toEqual([]);
  });

  it("无 @ 提及返回空数组", () => {
    expect(extractMentionedUserIds("普通文本", members)).toEqual([]);
  });

  it("空文本返回空数组", () => {
    expect(extractMentionedUserIds("", members)).toEqual([]);
  });

  it("空成员列表返回空数组", () => {
    expect(extractMentionedUserIds("@张三", [])).toEqual([]);
  });

  it("跳过 profile 为 null 的成员", () => {
    // u4 的 profile 为 null，不应匹配
    expect(extractMentionedUserIds("@u4", members)).toEqual([]);
  });

  it("跳过空昵称成员", () => {
    // u5 的 nickname 为空字符串
    const result = extractMentionedUserIds("@", members);
    expect(result).toEqual([]);
  });

  it("同一昵称匹配多个用户（全部命中）", () => {
    const dupMembers: MentionMember[] = [
      { user_id: "a1", profile: { nickname: "张三" } },
      { user_id: "a2", profile: { nickname: "张三" } },
    ];
    const result = extractMentionedUserIds("@张三", dupMembers);
    expect(result).toEqual(expect.arrayContaining(["a1", "a2"]));
    expect(result).toHaveLength(2);
  });

  it("结果去重", () => {
    // 重复 @同一人，结果应去重
    const result = extractMentionedUserIds("@张三 @张三", members);
    expect(result).toEqual(["u1"]);
  });
});

describe("buildMentionUserMap", () => {
  const members = [
    {
      user_id: "u1",
      profile: {
        nickname: "张三",
        avatar_url: "https://img/a.png",
        frameColor: "#ff0000",
        wornBadges: [{ id: "b1", icon: "🏅", color: "#ff0", name: "美食家" }],
        achievements: [{ id: "a1", key: "meals", name: "干饭王", description: "", icon: "🍚", rule_type: "total_meals", threshold: 10, sort_order: 1, unlocked: true }],
      },
    },
    { user_id: "u2", profile: { nickname: "Alice", avatar_url: null } },
    { user_id: "u3", profile: null },
    { user_id: "u4", profile: { nickname: "" } },
  ];

  it("按小写昵称建索引（大小写不敏感命中）", () => {
    const map = buildMentionUserMap(members);
    expect(map["张三"].id).toBe("u1");
    expect(map["alice"].id).toBe("u2");
    expect(map["ALICE"]).toBeUndefined(); // 键统一小写
  });

  it("保留展示所需字段", () => {
    const user = buildMentionUserMap(members)["张三"];
    expect(user).toMatchObject({
      id: "u1",
      nickname: "张三",
      avatar_url: "https://img/a.png",
      frameColor: "#ff0000",
    });
    expect(user.wornBadges).toHaveLength(1);
    expect(user.achievements).toHaveLength(1);
  });

  it("缺失字段兜底为空", () => {
    const user = buildMentionUserMap(members)["alice"];
    expect(user.avatar_url).toBeNull();
    expect(user.frameColor).toBeNull();
    expect(user.wornBadges).toEqual([]);
    expect(user.achievements).toEqual([]);
  });

  it("跳过 profile 为 null / 空昵称的成员", () => {
    const map = buildMentionUserMap(members);
    expect(map["u3"]).toBeUndefined();
    expect(map["u4"]).toBeUndefined();
    expect(Object.keys(map)).toHaveLength(2);
  });

  it("空/undefined 成员列表返回空映射", () => {
    expect(buildMentionUserMap([])).toEqual({});
    expect(buildMentionUserMap(null)).toEqual({});
    expect(buildMentionUserMap(undefined)).toEqual({});
  });
});
