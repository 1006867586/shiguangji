"use client";

import { useCallback, useRef, useState } from "react";
import { fetcher } from "@/lib/fetcher";
import type { Activity, FeedResponse } from "@/types";

interface UseFeedOptions {
  groupId: string;
  limit?: number;
}

interface UseFeedReturn {
  activities: Activity[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  /** 实时新增到顶部（realtime 推送用） */
  prependActivity: (a: Activity) => void;
  /** 局部更新某条活动 */
  updateActivity: (id: string, patch: Partial<Activity>) => void;
  removeActivity: (id: string) => void;
  /** 增量更新某活动计数（评论/照片/点赞） */
  bumpCount: (
    id: string,
    field: "photo_count" | "comment_count" | "like_count",
    delta: number
  ) => void;
}

export function useFeed({ groupId, limit = 20 }: UseFeedOptions): UseFeedReturn {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);
  const [hasMore, setHasMore] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher<FeedResponse>(
        `/api/feed?groupId=${groupId}&limit=${limit}`
      );
      setActivities(res.data);
      cursorRef.current = res.next_cursor;
      hasMoreRef.current = Boolean(res.next_cursor);
      setHasMore(hasMoreRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [groupId, limit]);

  const loadMore = useCallback(async () => {
    if (!hasMoreRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetcher<FeedResponse>(
        `/api/feed?groupId=${groupId}&cursor=${encodeURIComponent(
          cursorRef.current ?? ""
        )}&limit=${limit}`
      );
      setActivities((prev) => [...prev, ...res.data]);
      cursorRef.current = res.next_cursor;
      hasMoreRef.current = Boolean(res.next_cursor);
      setHasMore(hasMoreRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载更多失败");
    } finally {
      setLoadingMore(false);
    }
  }, [groupId, limit, loadingMore]);

  const prependActivity = useCallback((a: Activity) => {
    setActivities((prev) =>
      prev.some((x) => x.id === a.id) ? prev : [a, ...prev]
    );
  }, []);

  const updateActivity = useCallback(
    (id: string, patch: Partial<Activity>) => {
      setActivities((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
    },
    []
  );

  const removeActivity = useCallback((id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const bumpCount = useCallback(
    (
      id: string,
      field: "photo_count" | "comment_count" | "like_count",
      delta: number
    ) => {
      setActivities((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, [field]: Math.max(0, a[field] + delta) } : a
        )
      );
    },
    []
  );

  return {
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
  };
}
