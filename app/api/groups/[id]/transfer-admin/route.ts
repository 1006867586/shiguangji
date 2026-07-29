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
 * POST /api/groups/[id]/transfer-admin — 转让圈子管理员
 * body: { newAdminId: UUID }
 * 仅当前 admin 可调用，调用 RPC transfer_group_admin（security definer）。
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const body = (await request.json()) as { newAdminId?: string };
    const newAdminId = body?.newAdminId;

    if (!newAdminId || !isUuid(newAdminId)) {
      return jsonResponse(
        { error: "参数错误：newAdminId 不合法" },
        { status: 400 }
      );
    }

    if (newAdminId === user.id) {
      return jsonResponse(
        { error: "不能转让给自己" },
        { status: 400 }
      );
    }

    // 校验当前用户为圈子 admin（RPC 内部也会校验）
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
        { error: "仅管理员可转让管理员" },
        { status: 403 }
      );
    }

    const { error: rpcErr } = await supabase.rpc("transfer_group_admin", {
      p_group_id: id,
      p_new_admin: newAdminId,
    });

    if (rpcErr) {
      return jsonResponse(
        { error: safeErrorMessage(rpcErr, "转让管理员失败") },
        { status: 400 }
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
