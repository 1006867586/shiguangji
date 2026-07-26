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
 * POST /api/groups/[id]/reset-invite-code — 重置邀请码
 * 仅团体 admin 可调用，调用 RPC reset_invite_code（security definer）。
 * 返回 { data: { inviteCode: string } }。
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验当前用户为团体 admin（RPC 内部也会校验）
    const { data: membership } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "无权访问" }, { status: 403 });
    }
    if (membership.role !== "admin") {
      return jsonResponse(
        { error: "仅管理员可重置邀请码" },
        { status: 403 }
      );
    }

    const { data: code, error: rpcErr } = await supabase.rpc(
      "reset_invite_code",
      { p_group_id: id }
    );

    if (rpcErr || !code) {
      return jsonResponse(
        { error: safeErrorMessage(rpcErr, "重置邀请码失败") },
        { status: 400 }
      );
    }

    return jsonResponse({ data: { inviteCode: code as string } });
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
