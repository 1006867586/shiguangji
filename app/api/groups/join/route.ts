import { NextRequest } from "next/server";
import { createServerClient, requireUser, UnauthorizedError } from "@/lib/supabase/server";
import { jsonResponse, isValidInviteCode, safeErrorMessage } from "@/lib/utils";
import type { JoinGroupBody } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/groups/join?code=ABCDEF — 邀请码预览
 * 无需登录：按邀请码返回圈子公开信息（名称/简介/头像/成员数/是否已加入），
 * 供邀请链接落地页渲染预览卡片。邀请码无效返回 404。
 */
export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("code") ?? "")
    .trim()
    .toUpperCase();

  if (!isValidInviteCode(code)) {
    return jsonResponse(
      { error: "邀请码格式不正确（6 位字母数字）" },
      { status: 400 }
    );
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("get_group_preview_by_code", {
    p_code: code,
  });

  if (error || !data || data.length === 0) {
    return jsonResponse(
      { error: "邀请码无效或圈子不存在" },
      { status: 404 }
    );
  }

  return jsonResponse({ data: data[0] });
}

/** POST /api/groups/join — 通过邀请码加入圈子 */
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

    // 先用预览 RPC 解析圈子并判断当前用户是否已是成员
    const { data: preview, error: previewErr } = await supabase.rpc(
      "get_group_preview_by_code",
      { p_code: code }
    );
    if (previewErr || !preview || preview.length === 0) {
      return jsonResponse(
        { error: "邀请码无效或圈子不存在" },
        { status: 404 }
      );
    }
    const groupId = preview[0].id as string;

    // 已是成员：直接返回，不重复插入
    if (preview[0].is_member) {
      return jsonResponse(
        { data: { id: groupId, alreadyMember: true }, message: "你已是该圈子成员" }
      );
    }

    // 调用 join_group_by_code RPC（security definer，绕过 RLS）真正加入
    const { data: group, error: joinErr } = await supabase.rpc(
      "join_group_by_code",
      { p_code: code }
    );

    if (joinErr || !group) {
      return jsonResponse(
        { error: safeErrorMessage(joinErr, "加入失败") },
        { status: 400 }
      );
    }

    return jsonResponse(
      { data: { id: groupId, alreadyMember: false }, message: "加入成功" },
      { status: 201 }
    );
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
