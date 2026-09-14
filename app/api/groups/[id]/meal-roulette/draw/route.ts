import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import {
  drawCandidate,
  type DietaryCandidate,
  type PartyMemberDietary,
} from "@/lib/dietary";
import type {
  DrawRouletteBody,
  DrawRouletteResult,
  MealRouletteItem,
  MemberDietary,
} from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/groups/[id]/meal-roulette/draw
 * 带忌口过滤的抽签。
 *
 * 为什么抽签要在服务端做而不是前端：
 *   - 候选池来自圈子共享数据，前端抽需要先把全量数据拉下来，随候选增长会变慢
 *   - 忌口属于其他成员的隐私数据，不该大量下发到前端
 *   - 服务端统一实现 strict → loose 的降级逻辑，前端只负责展示结果
 *
 * 随机性：用 Math.random 足够（决策工具，不涉及抽奖利益分配；
 * 小程序提审需避免任何奖品/概率获利形态，参见《微信小程序审核驳回高危点清单.md》§6）。
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as DrawRouletteBody;
    const mode = body.mode === "loose" ? "loose" : "strict";

    // 1. 候选池
    const { data: items, error: itemsErr } = await supabase
      .from("meal_roulette_items")
      .select(
        `id, group_id, title, address, phone, signature_dishes, cuisine, dietary_tags,
         added_by, created_at,
         adder:profiles!meal_roulette_items_added_by_fkey(id, nickname, avatar_url)`
      )
      .eq("group_id", id)
      .order("created_at", { ascending: false });

    if (itemsErr) {
      return jsonResponse(
        { error: safeErrorMessage(itemsErr, "获取候选失败") },
        { status: 500 }
      );
    }

    const candidates = (items ?? []) as unknown as MealRouletteItem[];

    // 2. 圈子成员忌口（RPC 内含成员身份校验）
    const { data: memberRows, error: memberErr } = await supabase.rpc(
      "get_group_member_dietary",
      { p_group_id: id }
    );
    if (memberErr) {
      return jsonResponse(
        { error: safeErrorMessage(memberErr, "获取成员忌口失败") },
        { status: 500 }
      );
    }

    const allMembers = (memberRows ?? []) as MemberDietary[];

    // 3. 本次参与成员：指定了就用指定集合，否则全员
    // 本餐参与成员：空数组 / 未传 = 全员参与。
    // 注意不能用 `new Set([])` 当非空标记，否则会把所有人都过滤掉。
    const requestedIds = Array.isArray(body.participantIds)
      ? body.participantIds.filter(
          (x): x is string => typeof x === "string"
        )
      : [];
    const requested = requestedIds.length > 0 ? new Set(requestedIds) : null;

    const party: PartyMemberDietary[] = allMembers
      .filter((m) => (requested ? requested.has(m.user_id) : true))
      .map((m) => ({
        userId: m.user_id,
        nickname: m.nickname,
        dietaryTags: m.dietary_tags ?? [],
      }));

    // 4. 抽签（strict 无可用候选时内部自动降级为 loose）
    const result = drawCandidate(
      candidates as DietaryCandidate[],
      party,
      mode
    );

    const payload: DrawRouletteResult = {
      picked: (result.picked as MealRouletteItem | null) ?? null,
      poolSize: result.pool.length,
      mode: result.mode,
      excludedCount: result.excludedCount,
      warnings: result.warnings,
    };

    return jsonResponse({ data: payload });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    return jsonResponse(
      { error: safeErrorMessage(err, "服务器错误") },
      { status: 500 }
    );
  }
}
