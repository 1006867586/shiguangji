import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage } from "@/lib/utils";
import type { ContentReport, ResolveReportBody } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 获取当前用户在指定团体中是否为 admin */
async function isGroupAdmin(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  groupId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "admin";
}

/**
 * GET /api/reports/[id] — 获取单个举报详情
 * 仅举报者本人或团体 admin 可访问。
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const { data: report, error } = await supabase
      .from("content_reports")
      .select(
        `id, reporter_id, target_type, target_id, group_id, reason, detail,
         status, resolved_by, resolved_at, created_at,
         reporter:profiles!content_reports_reporter_id_fkey(id, nickname, avatar_url)`
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !report) {
      return jsonResponse({ error: "举报不存在" }, { status: 404 });
    }

    const r = report as unknown as ContentReport;

    // 权限：举报者本人 或 团体 admin
    if (r.reporter_id !== user.id) {
      const admin = await isGroupAdmin(supabase, r.group_id, user.id);
      if (!admin) {
        return jsonResponse({ error: "无权访问" }, { status: 403 });
      }
    }

    return jsonResponse({ data: r });
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

/**
 * PATCH /api/reports/[id] — 处理举报
 * body: { status: 'resolved' | 'dismissed' }
 * 仅团体 admin 可调用，更新 resolved_by 与 resolved_at。
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    const body = (await request.json()) as ResolveReportBody;
    if (body.status !== "resolved" && body.status !== "dismissed") {
      return jsonResponse(
        { error: "参数错误：status 必须为 resolved 或 dismissed" },
        { status: 400 }
      );
    }

    // 查询举报是否存在并取得 group_id 用于权限校验
    const { data: existing, error: findErr } = await supabase
      .from("content_reports")
      .select("id, group_id, status")
      .eq("id", id)
      .maybeSingle();

    if (findErr || !existing) {
      return jsonResponse({ error: "举报不存在" }, { status: 404 });
    }

    const admin = await isGroupAdmin(supabase, existing.group_id, user.id);
    if (!admin) {
      return jsonResponse(
        { error: "仅管理员可处理举报" },
        { status: 403 }
      );
    }

    const { data: updated, error: updateErr } = await supabase
      .from("content_reports")
      .update({
        status: body.status,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `id, reporter_id, target_type, target_id, group_id, reason, detail,
         status, resolved_by, resolved_at, created_at,
         reporter:profiles!content_reports_reporter_id_fkey(id, nickname, avatar_url)`
      )
      .single();

    if (updateErr || !updated) {
      return jsonResponse(
        { error: safeErrorMessage(updateErr, "处理举报失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: updated as unknown as ContentReport });
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
