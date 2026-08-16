import { describe, it, expect } from "vitest";
import { mapFeedRow, parseExternalLink } from "@/lib/activities";

describe("parseExternalLink", () => {
  it("返回 phone/category/location 字段（feed 卡片展示所需）", () => {
    const link = parseExternalLink({
      platform: "meituan",
      url: "https://meituan.com/x",
      title: "海底捞",
      coverImage: "https://img.com/c.jpg",
      rating: 4.5,
      address: "北京",
      phone: "010-12345678",
      price: "人均 120",
      category: "火锅",
      location: { lng: 116.4, lat: 39.9 },
    });
    expect(link).toMatchObject({
      phone: "010-12345678",
      category: "火锅",
      location: { lng: 116.4, lat: 39.9 },
    });
  });

  it("兼容 cover_image / location 内 longitude+latitude 旧命名", () => {
    const link = parseExternalLink({
      url: "https://meituan.com/x",
      title: "店",
      cover_image: "https://img.com/old.jpg",
      location: { longitude: 116.1, latitude: 39.8 },
    });
    expect(link?.coverImage).toBe("https://img.com/old.jpg");
    expect(link?.location).toEqual({ lng: 116.1, lat: 39.8 });
  });

  it("非法 location（缺坐标/非数值）返回 null", () => {
    const noCoords = parseExternalLink({
      url: "https://x.com",
      title: "店",
      location: { lng: "116" },
    });
    expect(noCoords?.location).toBeNull();

    const noLocation = parseExternalLink({
      url: "https://x.com",
      title: "店",
    });
    expect(noLocation?.location).toBeNull();
  });
});

describe("mapFeedRow", () => {
  it("映射 repost_comment/group_id 并规范化 repost_of.external_link", () => {
    const row = {
      id: "a1",
      type: "repost",
      content: null,
      external_link: null,
      created_at: "2026-08-16T00:00:00Z",
      author: { id: "u1", nickname: "张三", avatar_url: null },
      photo_count: 0,
      comment_count: 0,
      like_count: 1,
      is_liked: true,
      repost_comment: "这家好吃！",
      group_id: "g1",
      repost_of: {
        id: "a0",
        type: "original",
        content: "原文",
        external_link: {
          url: "https://meituan.com/y",
          title: "店",
          cover_image: "https://img.com/old.jpg",
          phone: "123",
          location: { lng: 1, lat: 2 },
        },
        created_at: "2026-08-15T00:00:00Z",
        author: { id: "u2", nickname: "李四", avatar_url: null },
      },
    };
    const a = mapFeedRow(row as unknown as Record<string, unknown>);
    expect(a.repost_comment).toBe("这家好吃！");
    expect(a.group_id).toBe("g1");
    expect(a.repost_of?.external_link).toMatchObject({
      coverImage: "https://img.com/old.jpg",
      phone: "123",
      location: { lng: 1, lat: 2 },
    });
  });
});
