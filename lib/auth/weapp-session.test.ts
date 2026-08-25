import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildWeappVirtualEmail,
  exchangeOpenIdForSession,
  WeappSessionError,
} from "./weapp-session";

const mocks = vi.hoisted(() => ({
  generateLink: vi.fn(),
  updateUserById: vi.fn(),
  verifyOtp: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        generateLink: mocks.generateLink,
        updateUserById: mocks.updateUserById,
      },
      verifyOtp: mocks.verifyOtp,
    },
    from: vi.fn(() => ({ upsert: mocks.upsert })),
  })),
}));

describe("exchangeOpenIdForSession", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    mocks.generateLink.mockReset();
    mocks.updateUserById.mockReset();
    mocks.verifyOtp.mockReset();
    mocks.upsert.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("虚拟邮箱格式为 wx_{openid}@wechat.local", () => {
    expect(buildWeappVirtualEmail("o_abc")).toBe("wx_o_abc@wechat.local");
  });

  it("新用户：建立会话、写元数据 nickname、profiles upsert、消费 token_hash", async () => {
    const user = { id: "u1", created_at: new Date().toISOString(), user_metadata: {} };
    mocks.generateLink.mockResolvedValue({
      data: { user, properties: { hashed_token: "tok" } },
      error: null,
    });
    mocks.updateUserById.mockResolvedValue({ data: { user }, error: null });
    mocks.upsert.mockResolvedValue({ data: null, error: null });
    mocks.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: "at",
          refresh_token: "rt",
          expires_at: 4102444800,
        },
      },
      error: null,
    });

    const result = await exchangeOpenIdForSession("o_abc");

    expect(result.isNewUser).toBe(true);
    expect(result.accessToken).toBe("at");
    expect(result.openid).toBe("o_abc");
    // openid.slice(-4) 为 "_abc"
    expect(mocks.updateUserById.mock.calls[0][1].user_metadata.nickname).toBe("微信用户_abc");
    expect(mocks.upsert).toHaveBeenCalledWith({ id: "u1", nickname: "微信用户_abc" });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "tok", type: "magiclink" });
  });

  it("generateLink 失败抛 WeappSessionError(code=link_failed)", async () => {
    mocks.generateLink.mockResolvedValue({ data: null, error: new Error("boom") });
    const err = await exchangeOpenIdForSession("o_abc").catch((e) => e);
    expect(err).toBeInstanceOf(WeappSessionError);
    expect(err.code).toBe("link_failed");
  });

  it("新用户传入 nickname + avatarUrl：写入 user_metadata 与 profiles（不覆盖已有）", async () => {
    const user = { id: "u1", created_at: new Date().toISOString(), user_metadata: {} };
    mocks.generateLink.mockResolvedValue({
      data: { user, properties: { hashed_token: "tok" } },
      error: null,
    });
    mocks.updateUserById.mockResolvedValue({ data: { user }, error: null });
    mocks.upsert.mockResolvedValue({ data: null, error: null });
    mocks.verifyOtp.mockResolvedValue({
      data: {
        session: { access_token: "at", refresh_token: "rt", expires_at: 4102444800 },
      },
      error: null,
    });

    const result = await exchangeOpenIdForSession("o_abc", {
      nickname: "小明",
      avatarUrl: "https://r2.example.com/avatar.jpg",
    });

    expect(result.isNewUser).toBe(true);
    expect(result.nickname).toBe("小明");
    expect(result.avatarUrl).toBe("https://r2.example.com/avatar.jpg");
    expect(mocks.updateUserById.mock.calls[0][1].user_metadata.nickname).toBe("小明");
    expect(mocks.updateUserById.mock.calls[0][1].user_metadata.avatar_url).toBe(
      "https://r2.example.com/avatar.jpg"
    );
    expect(mocks.upsert).toHaveBeenCalledWith({
      id: "u1",
      nickname: "小明",
      avatar_url: "https://r2.example.com/avatar.jpg",
    });
  });

  it("老用户传入 nickname + avatarUrl：确认页预填+可选改，传入则覆盖更新", async () => {
    // user.created_at 设为 1 小时前 → createdMinutesAgo > 2 → isNewUser=false
    const createdAt = new Date(Date.now() - 60 * 60_000).toISOString();
    const user = { id: "u_old", created_at: createdAt, user_metadata: { nickname: "旧昵称" } };
    mocks.generateLink.mockResolvedValue({
      data: { user, properties: { hashed_token: "tok" } },
      error: null,
    });
    mocks.updateUserById.mockResolvedValue({ data: { user }, error: null });
    mocks.upsert.mockResolvedValue({ data: null, error: null });
    mocks.verifyOtp.mockResolvedValue({
      data: {
        session: { access_token: "at", refresh_token: "rt", expires_at: 4102444800 },
      },
      error: null,
    });

    const result = await exchangeOpenIdForSession("o_old", {
      nickname: "新昵称",
      avatarUrl: "https://r2.example.com/new.jpg",
    });

    expect(result.isNewUser).toBe(false);
    // 老用户确认页传入新资料 → 按前端传入值更新（预填+可选改，不区分新老用户）
    expect(mocks.updateUserById.mock.calls[0][1].user_metadata.nickname).toBe("新昵称");
    expect(mocks.updateUserById.mock.calls[0][1].user_metadata.avatar_url).toBe(
      "https://r2.example.com/new.jpg"
    );
    expect(mocks.upsert).toHaveBeenCalledWith({
      id: "u_old",
      nickname: "新昵称",
      avatar_url: "https://r2.example.com/new.jpg",
    });
  });

  it("options.writeProfile=false（login-status 场景）：跳过 updateUserById 与 upsert", async () => {
    const user = { id: "u1", created_at: new Date().toISOString(), user_metadata: {} };
    mocks.generateLink.mockResolvedValue({
      data: { user, properties: { hashed_token: "tok" } },
      error: null,
    });
    mocks.verifyOtp.mockResolvedValue({
      data: {
        session: { access_token: "at", refresh_token: "rt", expires_at: 4102444800 },
      },
      error: null,
    });

    const result = await exchangeOpenIdForSession(
      "o_abc",
      { nickname: "小明", avatarUrl: "https://r2.example.com/a.jpg" },
      { writeProfile: false }
    );

    expect(result.isNewUser).toBe(true);
    expect(result.accessToken).toBe("at");
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
