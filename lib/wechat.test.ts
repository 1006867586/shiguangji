import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { code2Session, Code2SessionError } from "./wechat";

describe("code2Session", () => {
  beforeEach(() => {
    vi.stubEnv("WEAPP_APPID", "wx-test-appid");
    vi.stubEnv("WEAPP_SECRET", "test-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("成功时返回 openid / unionid，且 URL 携带 appid 与 js_code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ openid: "o_123", unionid: "u_456", session_key: "sk" }),
          { status: 200 }
        )
      )
    );
    const result = await code2Session("code-1");
    expect(result.openid).toBe("o_123");
    expect(result.unionid).toBe("u_456");
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("appid=wx-test-appid");
    expect(url).toContain("js_code=code-1");
  });

  it("微信业务错误码抛 Code2SessionError（携带 errcode）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ errcode: 40029, errmsg: "invalid code" }), { status: 200 })
      )
    );
    const err = await code2Session("bad").catch((e) => e);
    expect(err).toBeInstanceOf(Code2SessionError);
    expect(err.errcode).toBe(40029);
  });

  it("HTTP 失败抛普通 Error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream down", { status: 502 })));
    await expect(code2Session("x")).rejects.toThrow("HTTP 502");
  });
});
