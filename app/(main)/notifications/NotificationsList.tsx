"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, BellOff, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { UserAvatar } from "@/components/common/UserAvatar";
import {
  useNotifications,
  useUnreadCount,
  markAllRead,
  markRead,
} from "@/hooks/useNotifications";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { AppNotification, NotificationType } from "@/types";

/** 通知类型 → 操作描述（{actor} 由 actor 昵称替换） */
function describeNotification(
  type: NotificationType,
  actorName: string
): string {
  switch (type) {
    case "comment":
      return `${actorName} 评论了你的动态`;
    case "reply":
      return `${actorName} 回复了你的评论`;
    case "like":
      return `${actorName} 赞了你的动态`;
    case "repost":
      return `${actorName} 分享了你的动态`;
    case "mention":
      return `${actorName} 提到了你`;
    case "photo_added":
      return `${actorName} 补充了照片`;
    case "rsvp":
      return `${actorName} 报名了你的活动`;
    case "split":
      return `${actorName} 创建了账单分摊`;
    case "group_invite":
      return `${actorName} 邀请你加入团体`;
    case "report_resolved":
      return "你的举报已处理";
    case "system":
      return "系统通知";
    default:
      return "收到一条通知";
  }
}

/** 从通知 data 字段中提取内容预览片段 */
function extractPreview(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const candidates = ["preview", "content", "text", "summary", "detail"];
  for (const key of candidates) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function NotificationsList() {
  const { notifications, loading, error, reload, hasMore, loadMore } =
    useNotifications();
  const { reload: reloadUnread } = useUnreadCount();

  // 本地乐观标记已读集合：覆盖首屏与分页追加项，避免服务端回包延迟造成的蓝点闪烁
  const [locallyRead, setLocallyRead] = useState<Set<string>>(new Set());
  const [markingAll, startMarkAll] = useTransition();
  const [loadingMoreLocal, setLoadingMoreLocal] = useState(false);

  const nowIso = new Date().toISOString();
  const displayNotifications = notifications.map((n) =>
    locallyRead.has(n.id) && !n.read_at ? { ...n, read_at: nowIso } : n
  );
  const hasUnread = displayNotifications.some((n) => !n.read_at);

  const handleMarkAllRead = () => {
    const unreadIds = displayNotifications
      .filter((n) => !n.read_at)
      .map((n) => n.id);
    if (unreadIds.length === 0) return;

    startMarkAll(async () => {
      // 乐观：本地立即标记为已读
      setLocallyRead((prev) => {
        const next = new Set(prev);
        unreadIds.forEach((id) => next.add(id));
        return next;
      });
      try {
        await markAllRead();
        await Promise.all([reload(), reloadUnread()]);
        // 服务端已持久化 read_at，本地乐观集合保留以覆盖追加分页项
        toast.success("已全部标记为已读");
      } catch (e) {
        // 回滚本地乐观标记
        setLocallyRead((prev) => {
          const next = new Set(prev);
          unreadIds.forEach((id) => next.delete(id));
          return next;
        });
        toast.error(e instanceof Error ? e.message : "操作失败");
      }
    });
  };

  const handleClickNotification = (n: AppNotification) => {
    if (n.read_at || locallyRead.has(n.id)) return;
    // 乐观标记
    setLocallyRead((prev) => new Set(prev).add(n.id));
    markRead(n.id)
      .then(() => reloadUnread())
      .catch((e) => {
        setLocallyRead((prev) => {
          const next = new Set(prev);
          next.delete(n.id);
          return next;
        });
        toast.error(e instanceof Error ? e.message : "标记已读失败");
      });
  };

  const handleLoadMore = async () => {
    setLoadingMoreLocal(true);
    try {
      await loadMore();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载更多失败");
    } finally {
      setLoadingMoreLocal(false);
    }
  };

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-safe-t">
        <div className="flex h-14 items-center justify-between px-3">
          <h1 className="text-base font-semibold">通知</h1>
          {hasUnread ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-sm"
              disabled={markingAll}
              onClick={handleMarkAllRead}
            >
              <CheckCheck className="h-4 w-4" />
              {markingAll ? "处理中…" : "全部已读"}
            </Button>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-3 py-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="加载失败"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={() => reload()}>
              重试
            </Button>
          }
        />
      ) : displayNotifications.length === 0 ? (
        <EmptyState
          icon={<BellOff className="h-10 w-10" />}
          title="暂无通知"
          description="新的互动会在这里通知你"
        />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {displayNotifications.map((n) => {
              const actorName = n.actor?.nickname ?? "有人";
              const description = describeNotification(n.type, actorName);
              const preview = extractPreview(n.data);
              const unread = !n.read_at;
              const href = n.activity_id ? `/activity/${n.activity_id}` : null;

              const content = (
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <UserAvatar profile={n.actor ?? undefined} size={44} />
                    {unread ? (
                      <span
                        aria-label="未读"
                        className="absolute -left-1 top-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-foreground">
                      {description}
                    </p>
                    {preview ? (
                      <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
                        {preview}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatRelativeTime(n.created_at)}
                    </p>
                  </div>
                </div>
              );

              const rowClassName = cn(
                "block px-3 py-3 transition-colors",
                unread
                  ? "bg-primary/5 hover:bg-primary/10"
                  : "hover:bg-muted/40",
                href ? "cursor-pointer" : "cursor-default"
              );

              return (
                <li key={n.id}>
                  {href ? (
                    <Link
                      href={href}
                      className={rowClassName}
                      onClick={() => handleClickNotification(n)}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className={rowClassName}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>

          {hasMore ? (
            <div className="p-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={loadingMoreLocal}
                onClick={handleLoadMore}
              >
                {loadingMoreLocal ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "加载更多"
                )}
              </Button>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-muted-foreground">
              没有更多了
            </div>
          )}
        </>
      )}
    </div>
  );
}
