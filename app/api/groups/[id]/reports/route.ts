import { NextRequest } from "next/server";
import {
  createServerClient,
  requireUser,
  UnauthorizedError,
} from "@/lib/supabase/server";
import {
  jsonResponse,
  isUuid,
  safeErrorMessage,
  safeParseInt,
} from "@/lib/utils";
import type { ContentReport, ReportStatus } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES: ReportStatus[] = ["pending", "resolved", "dismissed"];

/**
 * GET /api/groups/[id]/reports — 获取团体所有举报
 * 仅团体 admin 可访问。支持 ?status=pending 过滤与分页。
 * 返回 { data: ContentReport[], hasMore: boolean }。
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const supabase = await createServerClient();
    const { id } = await params;

    if (!isUuid(id)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    // 校验当前用户为团体 admin
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
        { error: "仅管理员可查看举报列表" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = safeParseInt(searchParams.get("limit"), 20, 100);
    const offset = safeParseInt(searchParams.get("offset"), 0, 10000);

    if (status && !VALID_STATUSES.includes(status as ReportStatus)) {
      return jsonResponse({ error: "参数错误" }, { status: 400 });
    }

    let query = supabase
      .from("content_reports")
      .select(
        `id, reporter_id, target_type, target_id, group_id, reason, detail,
         status, resolved_by, resolved_at, created_at,
         reporter:profiles!content_reports_reporter_id_fkey(id, nickname, avatar_url)`,
        { count: "exact" }
      )
      .eq("group_id", id)
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
