"use client";

import { useEffect, useMemo, useRef } from "react";
import { Loader2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { FeedCard } from "./FeedCard";
import { FeedCardSkeletonList } from "./FeedCardSkeleton";
import { useFeed } from "@/hooks/useFeed";
import { useRealtimeGroup } from "@/hooks/useRealtime";
import { fetchData } from "@/lib/fetcher";
import type { Activity, Group } from "@/types";

interface FeedListProps {
  groupId: string;
  currentUserId?: string;
  /** 服务端预取的首屏数据,作为 useFeed 的 SWR fallback */
  initialActivities?: Activity[];
  /** realtime 推送新活动时拉取完整数据 */
  onActivityChange?: () => void;
}

export function FeedList({
  groupId,
  currentUserId,
  initialActivities,
}: FeedListProps) {
  const {
    activities,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    prependActivity,
    updateActivity,
    removeActivity,
    bumpCount,
  } = useFeed({ groupId, initialActivities });

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 收集当前已加载的 activity id,供 realtime 客户端过滤使用
  // (photo/comment/like 表无 group_id,需在客户端按 activity_id 过滤避免跨群泄露)
  const activityIds = useMemo(
    () => new Set(activities.map((a) => a.id)),
    [activities]
  );

  // 无限滚动
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore().catch(() => {
            // loadMore 错误已由上层处理或忽略,这里防止 unhandled rejection
          });
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  // Realtime 订阅:activityIds 通过 ref 始终读最新,无需 re-subscribe
  useRealtimeGroup(groupId, {
    activityIds,
    onActivity: {
      onInsert: async (row) => {
        // 新活动:拉取完整数据后置顶
        try {
          const a = await fetchData<Activity>(`/api/activities/${row.id}`);
          prependActivity(a);
        } catch (e) {
          // 之前是静默吞掉,改为 warn 便于排查(权限未同步 / 活动被删等)
          console.warn("[FeedList] realtime 拉取新活动失败", row.id, e);
        }
      },
      onDelete: (row) => {
        if (row.id) removeActivity(row.id);
      },
    },
    onPhoto: {
      onInsert: (row) => bumpCount(row.activity_id, "photo_count", 1),
      onDelete: (row) => {
        if (row.activity_id) bumpCount(row.activity_id, "photo_count", -1);
      },
    },
    onComment: {
      onInsert: (row) => bumpCount(row.activity_id, "comment_count", 1),
    },
    onLike: {
      onInsert: (row) => bumpCount(row.activity_id, "like_count", 1),
      onDelete: (row) => {
        if (row.activity_id) bumpCount(row.activity_id, "like_count", -1);
      },
    },
  });

  if (loading) {
    return (
      <div className="pt-1">
        <FeedCardSkeletonList count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="加载失败"
        description={error}
        action={
          <Button variant="outline" size="sm" onClick={refresh}>
            重试
          </Button>
        }
      />
    );
  }

  if (activities.length === 0) {
    return (
      <EmptyState
        icon={<UtensilsCrossed className="h-10 w-10" />}
        title="还没有聚餐记录"
        description="发起第一次聚餐，开启你们的飨刻时刻"
        action={
          <Button asChild size="sm" className="shadow-sm">
            <a href="/new">发起聚餐</a>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {activities.map((a) => (
        <div
          key={a.id}
          className="content-visibility-auto overflow-hidden rounded-2xl"
          style={{ containIntrinsicSize: "320px" }}
        >
          <FeedCard
            activity={a}
            currentUserId={currentUserId}
            groupId={groupId}
            onLiked={(id, liked, count) =>
              updateActivity(id, { is_liked: liked, like_count: count })
            }
            onDeleted={removeActivity}
            onReposted={refresh}
          />
        </div>
      ))}

      <div ref={sentinelRef} className="h-1" />

      {loadingMore ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary/70" />
        </div>
      ) : null}

      {!hasMore && activities.length > 0 ? (
        <div className="py-8">
          <div className="ornament-divider text-[10px] uppercase tracking-[0.3em]">
            <span>已到尽头</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 服务端预取首屏数据后传入（可选）。 */
export type { Activity, Group };
