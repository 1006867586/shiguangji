"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";
import type {
  ContentReport,
  CreateReportBody,
  ReportStatus,
  ResolveReportBody,
} from "@/types";

/** 举报列表响应（与 API 返回结构一致） */
interface ReportsListResponse {
  data: ContentReport[];
  hasMore: boolean;
}

/**
 * useReports — SWR 拉取举报列表。
 * - 传入 groupId 时拉取指定圈子的举报（需 admin 权限）；
 * - 不传 groupId 时拉取当前用户作为 admin 的所有圈子举报。
 * - status 可过滤状态（pending/resolved/dismissed）。
 */
export function useReports(
  groupId?: string | null,
  status?: ReportStatus | null
) {
  const params = new URLSearchParams();
  if (groupId) params.set("groupId", groupId);
  if (status) params.set("status", status);
  const query = params.toString();

  const { data, error, mutate, isLoading } = useSWR<ReportsListResponse>(
    `/api/reports${query ? `?${query}` : ""}`,
    (url: string) => fetcher<ReportsListResponse>(url),
    { revalidateOnFocus: false }
  );

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    reports: data?.data ?? [],
    hasMore: data?.hasMore ?? false,
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    reload,
  };
}

/** useReport — SWR 拉取单个举报详情（举报者本人或圈子 admin） */
export function useReport(reportId: string | null) {
  const { data, error, mutate, isLoading } = useSWR<ContentReport>(
    reportId ? `/api/reports/${reportId}` : null,
    (url: string) => fetchData<ContentReport>(url),
    { revalidateOnFocus: false }
  );

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    report: data ?? null,
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    reload,
  };
}

/** createReport — 创建举报（独立函数） */
export async function createReport(
  body: CreateReportBody
): Promise<ContentReport> {
  return fetchData<ContentReport>("/api/reports", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** resolveReport — 处理举报（仅 admin），status 为 resolved 或 dismissed */
export async function resolveReport(
  reportId: string,
  status: ResolveReportBody["status"]
): Promise<ContentReport> {
  return fetchData<ContentReport>(`/api/reports/${reportId}`, {
    method: "PATCH",
    body: JSON.stringify({ status } satisfies ResolveReportBody),
  });
}
