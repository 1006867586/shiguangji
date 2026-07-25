import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isValidInviteCode, safeErrorMessage } from "@/lib/utils";
import type { JoinGroupBody } from "@/types";

export const dynamic = "force-dynamic";

/** POST /api/groups/join — 通过邀请码加入团体 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as JoinGroupBody;
    const code = body.inviteCode?.trim().toUpperCase();

    // 非空 + 长度合理（6-32），再校验格式
    if (!code || code.length < 6 || code.length > 32 || !isValidInviteCode(code)) {
      return jsonResponse(
        { error: "邀请码格式不正确（6 位字母数字）" },
        { status: 400 }
      );
    }

    // 调用 join_group_by_code RPC（security definer，绕过 RLS）
    const { data: group, error: joinErr } = await supabase.rpc(
      "join_group_by_code",
      { p_code: code }
    );

    if (joinErr || !group) {
      return jsonResponse(
        { error: safeErrorMessage(joinErr, "邀请码无效或团体不存在") },
        { status: 404 }
      );
    }

    return jsonResponse({ data: group, message: "加入成功" }, { status: 201 });
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
