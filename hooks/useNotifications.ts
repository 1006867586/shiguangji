"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";
import type { AppNotification } from "@/types";

interface NotificationsResponse {
  data: AppNotification[];
  next_cursor: string | null;
}

/** 获取通知列表（SWR + cursor 分页） */
export function useNotifications(opts?: { unreadOnly?: boolean }) {
  const unreadOnly = opts?.unreadOnly ?? false;
  const limit = 30;
  const query = `limit=${limit}${unreadOnly ? "&unreadOnly=true" : ""}`;

  // 首屏由 SWR 拉取；后续页用 appended 维护，避免污染缓存
  const { data, error, mutate, isLoading } = useSWR<NotificationsResponse>(
    `/api/notifications?${query}`,
    (url: string) => fetcher<NotificationsResponse>(url),
    { revalidateOnFocus: false }
  );

  // 分页追加项（loadMore 加载的后续页）
  const [appended, setAppended] = useState<AppNotification[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  // 下一页 cursor：初始由 SWR data.next_cursor 决定，loadMore 后由响应更新
  const cursorRef = useRef<string | null>(data?.next_cursor ?? null);

  // 首屏数据变化（刷新或 unreadOnly 切换）时重置 cursor 与追加项
  useEffect(() => {
    cursorRef.current = data?.next_cursor ?? null;
    setAppended([]);
  }, [data?.next_cursor, unreadOnly]);

  const notifications = useMemo<AppNotification[]>(
    () => [...(data?.data ?? []), ...appended],
    [data, appended]
  );

  const hasMore = Boolean(cursorRef.current);

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetcher<NotificationsResponse>(
        `/api/notifications?cursor=${encodeURIComponent(cursor)}&${query}`
      );
      setAppended((prev) => [...prev, ...res.data]);
      cursorRef.current = res.next_cursor;
    } catch (e) {
      // 错误向上抛，由调用方决定是否 toast；此处不污染主列表的 error 状态
      setLoadingMore(false);
      throw e;
    }
    setLoadingMore(false);
  }, [query, loadingMore]);

  return {
    notifications,
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    reload,
    hasMore,
    loadMore,
  };
}

/** 获取未读通知数（SWR） */
export function useUnreadCount() {
  const { data, mutate } = useSWR<{ count: number }>(
    "/api/notifications/unread-count",
    (url: string) => fetchData<{ count: number }>(url),
    { revalidateOnFocus: false }
  );

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    count: data?.count ?? 0,
    reload,
  };
}

/** 标记全部通知为已读 */
export async function markAllRead() {
  return fetcher<{ success: boolean }>("/api/notifications/read-all", {
    method: "POST",
  });
}

/** 标记指定通知为已读 */
export async function markRead(id: string) {
  return fetcher<{ success: boolean }>(`/api/notifications/${id}/read`, {
    method: "POST",
  });
}
