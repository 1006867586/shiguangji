"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Activity, FeedResponse } from "@/types";

interface UseFeedOptions {
  groupId: string;
  limit?: number;
  /** 服务端预取的首屏数据,作为 SWR fallback 避免首次加载闪烁 */
  initialActivities?: Activity[];
}

interface UseFeedReturn {
  activities: Activity[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  /** 实时新增到顶部(realtime 推送用) */
  prependActivity: (a: Activity) => void;
  /** 局部更新某条活动 */
  updateActivity: (id: string, patch: Partial<Activity>) => void;
  removeActivity: (id: string) => void;
  /** 增量更新某活动计数(评论/照片/点赞) */
  bumpCount: (
    id: string,
    field: "photo_count" | "comment_count" | "like_count",
    delta: number
  ) => void;
}

export function useFeed({
  groupId,
  limit = 20,
  initialActivities,
}: UseFeedOptions): UseFeedReturn {
  // SWR fallback:用服务端预取数据构造一份 FeedResponse(无 cursor,后续由 SWR revalidate 补全)
  const fallback = useMemo<FeedResponse>(
    () => ({ data: initialActivities ?? [], next_cursor: null }),
    [initialActivities]
  );

  // SWR 自动去重 + 竞态抑制 + 缓存;revalidateOnFocus 关闭避免频繁后台请求
  const { data, error, mutate, isLoading } = useSWR<FeedResponse>(
    groupId ? `/api/feed?groupId=${groupId}&limit=${limit}` : null,
    (url: string) => fetcher<FeedResponse>(url),
    { fallbackData: fallback, revalidateOnFocus: false }
  );

  // 分页追加项(loadMore 加载的后续页),与 SWR 首屏数据分开维护避免污染缓存
  const [appended, setAppended] = useState<Activity[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  // 下一页 cursor:初始由 SWR data.next_cursor 决定,loadMore 后由响应更新
  const cursorRef = useRef<string | null>(data?.next_cursor ?? null);

  // 首屏数据变化(刷新或 groupId 切换)时重置 cursor 与追加项
  // 注意依赖 next_cursor 字符串值而非 data 引用,这样本地 mutate(本地变更
  // 通常保留 next_cursor)不会误触发清空
  useEffect(() => {
    cursorRef.current = data?.next_cursor ?? null;
    setAppended([]);
  }, [data?.next_cursor, groupId]);

  const activities = useMemo<Activity[]>(
    () => [...(data?.data ?? []), ...appended],
    [data, appended]
  );

  const hasMore = Boolean(cursorRef.current);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    // 单源真值:仅依据 cursorRef 判断,不再使用 hasMore + loadingMore 双 ref
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetcher<FeedResponse>(
        `/api/feed?groupId=${groupId}&cursor=${encodeURIComponent(
          cursor
        )}&limit=${limit}`
      );
      setAppended((prev) => [...prev, ...res.data]);
      cursorRef.current = res.next_cursor;
    } catch (e) {
      // 错误向上抛,由调用方决定是否 toast;此处不污染主 feed 的 error 状态
      setLoadingMore(false);
      throw e;
    }
    setLoadingMore(false);
  }, [groupId, limit, loadingMore]);

  // 同时更新 SWR 缓存(首屏)与 appended(后续页),保证 realtime 变更覆盖已加载的全部活动
  const prependActivity = useCallback(
    (a: Activity) => {
      mutate(
        (cur) =>
          cur
            ? {
                ...cur,
                data: cur.data.some((x) => x.id === a.id)
                  ? cur.data
                  : [a, ...cur.data],
              }
            : cur,
        { revalidate: false }
      );
      setAppended((prev) =>
        prev.some((x) => x.id === a.id) ? prev : [a, ...prev]
      );
    },
    [mutate]
  );

  const updateActivity = useCallback(
    (id: string, patch: Partial<Activity>) => {
      mutate(
        (cur) =>
          cur
            ? {
                ...cur,
                data: cur.data.map((x) =>
                  x.id === id ? { ...x, ...patch } : x
                ),
              }
            : cur,
        { revalidate: false }
      );
      setAppended((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
      );
    },
    [mutate]
  );

  const removeActivity = useCallback(
    (id: string) => {
      mutate(
        (cur) =>
          cur
            ? { ...cur, data: cur.data.filter((x) => x.id !== id) }
            : cur,
        { revalidate: false }
      );
      setAppended((prev) => prev.filter((x) => x.id !== id));
    },
    [mutate]
  );

  const bumpCount = useCallback(
    (
      id: string,
      field: "photo_count" | "comment_count" | "like_count",
      delta: number
    ) => {
      mutate(
        (cur) =>
          cur
            ? {
                ...cur,
                data: cur.data.map((x) =>
                  x.id === id
                    ? { ...x, [field]: Math.max(0, x[field] + delta) }
                    : x
                ),
              }
            : cur,
        { revalidate: false }
      );
      setAppended((prev) =>
        prev.map((x) =>
          x.id === id ? { ...x, [field]: Math.max(0, x[field] + delta) } : x
        )
      );
    },
    [mutate]
  );

  return {
    activities,
    loading: isLoading,
    loadingMore,
    hasMore,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    loadMore,
    refresh,
    prependActivity,
    updateActivity,
    removeActivity,
    bumpCount,
  };
}
