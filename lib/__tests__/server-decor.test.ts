import { describe, it, expect, vi } from "vitest";
import { attachDecorToProfiles } from "@/lib/server-decor";
import type { DecoratableProfile } from "@/lib/server-decor";

// ============================================================
// attachDecorToProfiles —— 批量给 profile 挂载头像框色 + 佩戴徽章
// ============================================================

function setupSupabase(opts: {
  displayRows?: Array<{
    user_id: string;
    avatar_frame_id: string | null;
    badge_ids: string[];
  }>;
  itemRows?: Array<{
    id: string;
    kind: string;
    name: string;
    icon: string | null;
    color: string | null;
  }>;
}) {
  const rpc = vi.fn().mockResolvedValue({ data: opts.displayRows ?? [], error: null });
  const select = vi.fn().mockResolvedValue({ data: opts.itemRows ?? [], error: null });
  const from = vi.fn(() => ({ select }));
  return { supabase: { rpc, from } as never, rpc, from };
}

describe("attachDecorToProfiles", () => {
  it("空列表 / null 输入：直接返回，不发任何查询", async () => {
    const { supabase, rpc, from } = setupSupabase({});
    await attachDecorToProfiles(supabase, []);
    await attachDecorToProfiles(supabase, null);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("全无佩戴：挂载 null / 空数组，仍发出一次批量查询", async () => {
    const { supabase, rpc } = setupSupabase({});
    const profiles: DecoratableProfile[] = [{ id: "u1" }, { id: "u2" }];
    await attachDecorToProfiles(supabase, profiles);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_users_decor_display", {
      p_user_ids: ["u1", "u2"],
    });
    expect(profiles[0]).toMatchObject({ frameColor: null, wornBadges: [] });
    expect(profiles[1]).toMatchObject({ frameColor: null, wornBadges: [] });
  });

  it("正常挂载：头像框色 + 佩戴徽章（含 icon/color/name）", async () => {
    const { supabase } = setupSupabase({
      displayRows: [
        { user_id: "u1", avatar_frame_id: "f1", badge_ids: ["b1", "b2"] },
      ],
      itemRows: [
        { id: "f1", kind: "avatar_frame", name: "鎏金头像框", icon: "🖼️", color: "#f5b840" },
        { id: "b1", kind: "badge", name: "闪耀之星", icon: "⭐", color: "#fde047" },
        { id: "b2", kind: "badge", name: "干饭冠军", icon: "🏆", color: "#f59e0b" },
      ],
    });
    const profiles: DecoratableProfile[] = [{ id: "u1" }];
    await attachDecorToProfiles(supabase, profiles);
    expect(profiles[0].frameColor).toBe("#f5b840");
    expect(profiles[0].wornBadges).toEqual([
      { id: "b1", icon: "⭐", color: "#fde047", name: "闪耀之星" },
      { id: "b2", icon: "🏆", color: "#f59e0b", name: "干饭冠军" },
    ]);
  });

  it("只有徽章、无头像框", async () => {
    const { supabase } = setupSupabase({
      displayRows: [
        { user_id: "u1", avatar_frame_id: null, badge_ids: ["b1"] },
      ],
      itemRows: [
        { id: "b1", kind: "badge", name: "火锅信徒", icon: "🍲", color: "#ef4444" },
      ],
    });
    const profiles: DecoratableProfile[] = [{ id: "u1" }];
    await attachDecorToProfiles(supabase, profiles);
    expect(profiles[0].frameColor).toBeNull();
    expect(profiles[0].wornBadges).toHaveLength(1);
  });

  it("badge_ids 含未在目录中的 id → 自动过滤，不影响其他", async () => {
    const { supabase } = setupSupabase({
      displayRows: [
        { user_id: "u1", avatar_frame_id: null, badge_ids: ["b1", "ghost"] },
      ],
      itemRows: [
        { id: "b1", kind: "badge", name: "干饭冠军", icon: "🏆", color: "#f59e0b" },
      ],
    });
    const profiles: DecoratableProfile[] = [{ id: "u1" }];
    await attachDecorToProfiles(supabase, profiles);
    expect(profiles[0].wornBadges).toHaveLength(1);
    expect(profiles[0].wornBadges?.[0].id).toBe("b1");
  });

  it("同一用户出现多次 → user ids 去重后只查询一次", async () => {
    const { supabase, rpc } = setupSupabase({
      displayRows: [
        { user_id: "u1", avatar_frame_id: null, badge_ids: [] },
      ],
    });
    const profiles: DecoratableProfile[] = [{ id: "u1" }, { id: "u1" }];
    await attachDecorToProfiles(supabase, profiles);
    expect(rpc).toHaveBeenCalledWith("get_users_decor_display", {
      p_user_ids: ["u1"],
    });
  });

  it("null 元素被跳过，不影响其余挂载", async () => {
    const { supabase, rpc } = setupSupabase({
      displayRows: [
        { user_id: "u2", avatar_frame_id: "f1", badge_ids: [] },
      ],
      itemRows: [
        { id: "f1", kind: "avatar_frame", name: "鎏金头像框", icon: "🖼️", color: "#f5b840" },
      ],
    });
    const profiles: (DecoratableProfile | null)[] = [null, undefined, { id: "u2" }];
    await attachDecorToProfiles(supabase, profiles);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(profiles[2]).toMatchObject({ frameColor: "#f5b840" });
  });
});
