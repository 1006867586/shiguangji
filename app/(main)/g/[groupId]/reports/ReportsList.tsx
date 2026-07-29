"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, ShieldX, Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/common/UserAvatar";
import { EmptyState } from "@/components/common/EmptyState";
import { useReports, resolveReport } from "@/hooks/useReports";
import { formatRelativeTime } from "@/lib/utils";
import type {
  ContentReport,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from "@/types";

interface ReportsListProps {
  groupId: string;
}

const REASON_LABEL: Record<ReportReason, string> = {
  spam: "垃圾信息",
  abuse: "辱骂攻击",
  porn: "色情内容",
  illegal: "违法内容",
  other: "其他",
};

const TARGET_LABEL: Record<ReportTargetType, string> = {
  activity: "动态",
  comment: "评论",
  photo: "照片",
};

const STATUS_META: Record<
  ReportStatus,
  { text: string; variant: "default" | "secondary" | "outline" }
> = {
  pending: { text: "待处理", variant: "secondary" },
  resolved: { text: "已通过", variant: "default" },
  dismissed: { text: "已驳回", variant: "outline" },
};

/**
 * ReportsList — 客户端举报管理列表。
 * 展示举报信息并提供「通过 / 驳回」操作（仅 pending 状态可操作）。
 */
export function ReportsList({ groupId }: ReportsListProps) {
  const { reports, loading, error, reload } = useReports(groupId);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleResolve = async (
    report: ContentReport,
    status: "resolved" | "dismissed"
  ) => {
    const msg =
      status === "resolved"
        ? "确定通过此举报吗？将标记为已处理。"
        : "确定驳回此举报吗？";
    if (!confirm(msg)) return;
    setPendingId(report.id);
    try {
      await resolveReport(report.id, status);
      toast.success(status === "resolved" ? "已通过" : "已驳回");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setPendingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={<Flag className="h-10 w-10" />}
        title="暂无举报"
        description="圈子内没有被举报的内容"
      />
    );
  }

  return (
    <ul className="space-y-2 p-3">
      {reports.map((r) => {
        const status = STATUS_META[r.status];
        const isPending = r.status === "pending";
        const busy = pendingId === r.id;
        return (
          <li
            key={r.id}
            className="rounded-xl border border-border bg-card p-3"
          >
            <div className="flex items-center gap-2">
              <UserAvatar profile={r.reporter} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {r.reporter?.nickname ?? "未知用户"}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {TARGET_LABEL[r.target_type]}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {REASON_LABEL[r.reason]}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatRelativeTime(r.created_at)}
                </div>
              </div>
              <Badge variant={status.variant} className="text-[10px]">
                {status.text}
              </Badge>
            </div>

            {r.detail ? (
              <p className="mt-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm text-muted-foreground break-words">
                {r.detail}
              </p>
            ) : null}

            {isPending ? (
              <div className="mt-2.5 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleResolve(r, "resolved")}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  通过
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleResolve(r, "dismissed")}
                  disabled={busy}
                >
                  <ShieldX className="h-4 w-4" />
                  驳回
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
