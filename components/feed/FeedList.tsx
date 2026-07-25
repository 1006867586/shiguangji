"use client";

import { useEffect, useRef } from "react";
import { Loader2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { FeedCard } from "./FeedCard";
import { useFeed } from "@/hooks/useFeed";
import { useRealtimeGroup } from "@/hooks/useRealtime";
import { fetchData } from "@/lib/fetcher";
import type { Activity, Group } from "@/types";

interface FeedListProps {
  groupId: string;
  currentUserId?: string;
  /** realtime 推送新活动时拉取完整数据 */
  onActivityChange?: () => void;
}

export function FeedList({ groupId, currentUserId }: FeedListProps) {
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
  } = useFeed({ groupId });

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 首次加载
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 无限滚动
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  // Realtime 订阅
  useRealtimeGroup(groupId, {
    onActivity: {
      onInsert: async (row) => {
        // 新活动：拉取完整数据后置顶
        try {
          const a = await fetchData<Activity>(`/api/activities/${row.id}`);
          prependActivity(a);
        } catch {
          // 忽略：可能是权限未同步
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
      <div className="flex justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
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
          <Button asChild size="sm">
            <a href="/new">发起聚餐</a>
          </Button>
        }
      />
    );
  }

  return (
    <div>
      {activities.map((a) => (
        <FeedCard
          key={a.id}
          activity={a}
          currentUserId={currentUserId}
          groupId={groupId}
          onLiked={(id, liked, count) =>
            updateActivity(id, { is_liked: liked, like_count: count })
          }
          onDeleted={removeActivity}
          onShared={refresh}
        />
      ))}

      <div ref={sentinelRef} className="h-1" />

      {loadingMore ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : null}

      {!hasMore && activities.length > 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          没有更多了
        </div>
      ) : null}
    </div>
  );
}

/** 服务端预取首屏数据后传入（可选）。 */
export type { Activity, Group };
