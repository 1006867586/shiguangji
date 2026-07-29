import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/groups/[id]/leave — 退出圈子
 * 删除自己的 group_members 记录。
 * 校验：如果是最后一个 admin，不允许退出（需先转让管理员）。
 * 若圈子只剩一人，退出后圈子由 Supabase 级联策略处理。
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 查询当前用户的成员身份
    const { data: membership, error: mErr } = await supabase
      .from("group_members")
      .select("id, role")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (mErr) {
      return jsonResponse(
        { error: safeErrorMessage(mErr, "退出圈子失败") },
        { status: 500 }
      );
    }
    if (!membership) {
      return jsonResponse(
        { error: "你不是该圈子成员" },
        { status: 404 }
      );
    }

    // 如果是 admin，需校验还有其他 admin（不能让圈子没有管理员）
    if (membership.role === "admin") {
      const { count, error: countErr } = await supabase
        .from("group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", id)
        .eq("role", "admin");

      if (countErr) {
        return jsonResponse(
          { error: safeErrorMessage(countErr, "退出圈子失败") },
          { status: 500 }
        );
      }

      // count 为当前 admin 总数；若只有自己一个 admin，禁止退出
      if ((count ?? 0) <= 1) {
        return jsonResponse(
          { error: "你是唯一的管理员，请先转让管理员后再退出" },
          { status: 400 }
        );
      }
    }

    // 删除自己的成员记录（RLS 允许 user_id = auth.uid() 删除）
    const { error: delErr } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", id)
      .eq("user_id", user.id);

    if (delErr) {
      return jsonResponse(
        { error: safeErrorMessage(delErr, "退出圈子失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ success: true });
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
