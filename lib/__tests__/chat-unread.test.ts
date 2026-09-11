import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getUnreadCount } from "@/app/api/groups/[id]/messages/unread-count/route";
import { POST as markRead } from "@/app/api/groups/[id]/messages/read/route";
import {
  requireUser,
  createServerClient,
  UnauthorizedError,
} from "@/lib/supabase/server";

// ============================================================
// 聊天未读链路 API 路由测试：
//   GET  /api/groups/[id]/messages/unread-count
//   POST /api/groups/[id]/messages/read
//
// 通过 vi.mock 替换 @/lib/supabase/server，覆盖
//   401（未登录）→ 400（非法 id）→ 403（非成员）→ 200 / 500
// ============================================================

vi.mock("@/lib/supabase/server", () => {
  class UnauthorizedError extends Error {
    status = 401;
    code = "unauthorized";
    constructor() {
      super("未登录或会话已过期");
    }
  }
  return {
    requireUser: vi.fn(),
    createServerClient: vi.fn(),
    UnauthorizedError,
  };
});

const VALID_ID = "11111111-2222-3333-4444-555555555555";
const BASE = `http://localhost:3000/api/groups/${VALID_ID}/messages`;

type QueryBuilder = {
  maybeSingle: ReturnType<typeof vi.fn>;
};

/** 构造 fluent chain 的 supabase mock：from().select().eq().eq().maybeSingle() + rpc() */
function setupSupabase() {
  const qb: QueryBuilder = { maybeSingle: vi.fn() };
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: qb.maybeSingle }),
      }),
    }),
  }));
  const rpc = vi.fn();
  (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    from,
    rpc,
  } as never);
  return { qb, rpc };
}

describe("GET /api/groups/[id]/messages/unread-count", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1" } as never);
    setupSupabase();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("未登录 → 401", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError());
    const res = await getUnreadCount(
      new NextRequest(`${BASE}/unread-count`),
      { params: Promise.resolve({ id: VALID_ID }) }
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "未登录或会话已过期" });
  });

  it("非法 id → 400", async () => {
    const res = await getUnreadCount(
      new NextRequest(`http://localhost:3000/api/groups/bad-id/messages/unread-count`),
      { params: Promise.resolve({ id: "bad-id" }) }
    );
    expect(res.status).toBe(400);
  });

  it("非圈子成员 → 403", async () => {
    const { qb } = setupSupabase();
    qb.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await getUnreadCount(
      new NextRequest(`${BASE}/unread-count`),
      { params: Promise.resolve({ id: VALID_ID }) }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "无权访问" });
  });

  it("成员身份正常 → 返回未读数", async () => {
    const { qb, rpc } = setupSupabase();
    qb.maybeSingle.mockResolvedValue({ data: { id: "m1" }, error: null });
    rpc.mockResolvedValue({
      data: [{ group_id: VALID_ID, unread_count: 3 }],
      error: null,
    });
    const res = await getUnreadCount(
      new NextRequest(`${BASE}/unread-count`),
      { params: Promise.resolve({ id: VALID_ID }) }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { count: 3 } });
    expect(rpc).toHaveBeenCalledWith("get_chat_unread_count", {
      p_group_id: VALID_ID,
    });
  });

  it("RPC 出错 → 500", async () => {
    const { qb, rpc } = setupSupabase();
    qb.maybeSingle.mockResolvedValue({ data: { id: "m1" }, error: null });
    rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    const res = await getUnreadCount(
      new NextRequest(`${BASE}/unread-count`),
      { params: Promise.resolve({ id: VALID_ID }) }
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "boom" });
  });
});

describe("POST /api/groups/[id]/messages/read", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1" } as never);
    setupSupabase();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("未登录 → 401", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError());
    const res = await markRead(new NextRequest(`${BASE}/read`), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("非法 id → 400", async () => {
    const res = await markRead(
      new NextRequest(`http://localhost:3000/api/groups/bad-id/messages/read`),
      { params: Promise.resolve({ id: "bad-id" }) }
    );
    expect(res.status).toBe(400);
  });

  it("非圈子成员 → 403", async () => {
    const { qb } = setupSupabase();
    qb.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await markRead(new NextRequest(`${BASE}/read`), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("成员身份正常 → 调用 mark_group_chat_read 并返回 ok", async () => {
    const { qb, rpc } = setupSupabase();
    qb.maybeSingle.mockResolvedValue({ data: { id: "m1" }, error: null });
    rpc.mockResolvedValue({ data: null, error: null });
    const res = await markRead(new NextRequest(`${BASE}/read`), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(rpc).toHaveBeenCalledWith("mark_group_chat_read", {
      p_group_id: VALID_ID,
    });
  });

  it("RPC 出错 → 500", async () => {
    const { qb, rpc } = setupSupabase();
    qb.maybeSingle.mockResolvedValue({ data: { id: "m1" }, error: null });
    rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    const res = await markRead(new NextRequest(`${BASE}/read`), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "boom" });
  });
});
