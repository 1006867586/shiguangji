import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isValidInviteCode } from "@/lib/utils";
import type { JoinGroupBody } from "@/types";

export const dynamic = "force-dynamic";

/** POST /api/groups/join — 通过邀请码加入团体 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as JoinGroupBody;
    const code = body.inviteCode?.trim().toUpperCase();

    if (!code || !isValidInviteCode(code)) {
      return jsonResponse(
        { error: "邀请码格式不正确（6 位字母数字）" },
        { status: 400 }
      );
    }

    const { data: group, error: groupErr } = await supabase
      .from("groups")
      .select("id, name, invite_code")
      .eq("invite_code", code)
      .maybeSingle();

    if (groupErr || !group) {
      return jsonResponse({ error: "邀请码无效或团体不存在" }, { status: 404 });
    }

    // 检查是否已加入
    const { data: existMember } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", group.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existMember) {
      return jsonResponse({
        data: group,
        message: "你已是该团体成员",
      });
    }

    const { error: joinErr } = await supabase
      .from("group_members")
      .insert({
        group_id: group.id,
        user_id: user.id,
        role: "member",
      });

    if (joinErr) {
      return jsonResponse({ error: joinErr.message }, { status: 500 });
    }

    return jsonResponse({ data: group, message: "加入成功" }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return jsonResponse({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "服务器错误";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
