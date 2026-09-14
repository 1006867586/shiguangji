import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type {
  DietarySummaryEntry,
  GroupDietaryResponse,
  MemberDietary,
} from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/groups/[id]/dietary
 * 返回该圈子的忌口汇总 + 每位成员的忌口明细。
 *
 * 汇总走 RPC get_group_dietary_summary（迁移 033），原因：
 *   - unnest + group by 在 SQL 里一次算完，避免把成员行拉到应用层再聚合
 *   - RPC 是 security definer，内部自带圈子成员身份校验
 * 出于隐私考虑只返回昵称与忌口，不含手机号/邮箱等。
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data: summary, error: summaryErr } = await supabase.rpc(
      "get_group_dietary_summary",
      { p_group_id: id }
    );
    if (summaryErr) {
      return jsonResponse(
        { error: safeErrorMessage(summaryErr, "获取忌口汇总失败") },
        { status: 500 }
      );
    }

    const { data: members, error: memberErr } = await supabase.rpc(
      "get_group_member_dietary",
      { p_group_id: id }
    );
    if (memberErr) {
      return jsonResponse(
        { error: safeErrorMessage(memberErr, "获取成员忌口失败") },
        { status: 500 }
      );
    }

    // 非成员调用 RPC 时 exists 条件不成立 → 返回空数组而非报错，
    // 这里补一次显式成员校验，让前端能区分「无权限」和「圈子没人填忌口」。
    const { data: mine } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!mine) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }

    const payload: GroupDietaryResponse = {
      summary: (summary ?? []) as DietarySummaryEntry[],
      members: (members ?? []) as MemberDietary[],
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
