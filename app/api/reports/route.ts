import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import { jsonResponse, isUuid, safeErrorMessage, safeParseInt } from "@/lib/utils";
import type {
  ContentReport,
  CreateReportBody,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from "@/types";

export const dynamic = "force-dynamic";

const VALID_TARGET_TYPES: ReportTargetType[] = ["activity", "comment", "photo"];
const VALID_REASONS: ReportReason[] = ["spam", "abuse", "porn", "illegal", "other"];
const VALID_STATUSES: ReportStatus[] = ["pending", "resolved", "dismissed"];

/** 获取当前用户在指定圈子中是否为 admin */
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

/** 获取当前用户是否为指定圈子成员 */
async function isGroupMember(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  groupId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * GET /api/reports — 获取举报列表
 * 仅圈子 admin 可见本圈子的举报。支持 ?groupId=xxx&status=pending 过滤，分页。
 * 返回 { data: ContentReport[], hasMore: boolean }。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");
    const status = searchParams.get("status");
    const limit = safeParseInt(searchParams.get("limit"), 20, 100);
    const offset = safeParseInt(searchParams.get("offset"), 0, 10000);

    if (groupId && !isUuid(groupId)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }
    if (status && !VALID_STATUSES.includes(status as ReportStatus)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 没有 groupId 时，聚合当前用户作为 admin 的所有圈子举报
    if (!groupId) {
      const { data: adminGroups, error: agErr } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id)
        .eq("role", "admin");

      if (agErr) {
        return jsonResponse(
          { error: safeErrorMessage(agErr, "获取举报列表失败") },
          { status: 500 }
        );
      }

      const groupIds = (adminGroups ?? []).map((g) => g.group_id);
      if (groupIds.length === 0) {
        return jsonResponse({ data: [], hasMore: false });
      }

      let query = supabase
        .from("content_reports")
        .select(
          `id, reporter_id, target_type, target_id, group_id, reason, detail,
           status, resolved_by, resolved_at, created_at,
           reporter:profiles!content_reports_reporter_id_fkey(id, nickname, avatar_url)`,
          { count: "exact" }
        )
        .in("group_id", groupIds)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, count, error } = await query;

      if (error) {
        return jsonResponse(
          { error: safeErrorMessage(error, "获取举报列表失败") },
          { status: 500 }
        );
      }

      return jsonResponse({
        data: (data ?? []) as unknown as ContentReport[],
        hasMore: offset + limit < (count ?? 0),
      });
    }

    // 指定 groupId：校验 admin 身份
    const admin = await isGroupAdmin(supabase, groupId, user.id);
    if (!admin) {
      return jsonResponse(
        { error: "仅管理员可查看举报列表" },
        { status: 403 }
      );
    }

    let query = supabase
      .from("content_reports")
      .select(
        `id, reporter_id, target_type, target_id, group_id, reason, detail,
         status, resolved_by, resolved_at, created_at,
         reporter:profiles!content_reports_reporter_id_fkey(id, nickname, avatar_url)`,
        { count: "exact" }
      )
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, count, error } = await query;

    if (error) {
      return jsonResponse(
        { error: safeErrorMessage(error, "获取举报列表失败") },
        { status: 500 }
      );
    }

    return jsonResponse({
      data: (data ?? []) as unknown as ContentReport[],
      hasMore: offset + limit < (count ?? 0),
    });
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
 * POST /api/reports — 创建举报
 * body: { targetType, targetId, groupId, reason, detail? }
 * 校验 reporter 是圈子成员。
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();

    const body = (await request.json()) as CreateReportBody;

    // 参数校验
    if (
      !body.groupId ||
      !isUuid(body.groupId) ||
      !body.targetId ||
      !isUuid(body.targetId) ||
      !VALID_TARGET_TYPES.includes(body.targetType) ||
      !VALID_REASONS.includes(body.reason)
    ) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验 reporter 是圈子成员
    const member = await isGroupMember(supabase, body.groupId, user.id);
    if (!member) {
      return jsonResponse(
        { error: "你不是该圈子成员，无权举报" },
        { status: 403 }
      );
    }

    // detail 可选，最长 1000 字符
    const detail =
      typeof body.detail === "string" && body.detail.trim()
        ? body.detail.trim().slice(0, 1000)
        : null;

    const { data: report, error } = await supabase
      .from("content_reports")
      .insert({
        reporter_id: user.id,
        target_type: body.targetType,
        target_id: body.targetId,
        group_id: body.groupId,
        reason: body.reason,
        detail,
      })
      .select(
        `id, reporter_id, target_type, target_id, group_id, reason, detail,
         status, resolved_by, resolved_at, created_at,
         reporter:profiles!content_reports_reporter_id_fkey(id, nickname, avatar_url)`
      )
      .single();

    if (error || !report) {
      return jsonResponse(
        { error: safeErrorMessage(error, "创建举报失败") },
        { status: 500 }
      );
    }

    return jsonResponse({ data: report as unknown as ContentReport }, { status: 201 });
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
