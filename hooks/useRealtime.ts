"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface SubscribeCallbacks<T> {
  onInsert?: (row: T) => void;
  onUpdate?: (row: T) => void;
  onDelete?: (row: Partial<T>) => void;
}

interface SubscribeOptions {
  /**
   * 返回当前 feed 中的 activity id 集合,用于客户端过滤 photo/comment/like 事件。
   * photo/comment/like 表无 group_id 列,若不提供该 getter 则放行所有事件
   * (向后兼容,但会监听全表噪音)。
   */
  getActivityIds?: () => Set<string> | undefined;
  onActivity?: SubscribeCallbacks<{ id: string; group_id: string }>;
  onPhoto?: SubscribeCallbacks<{
    id: string;
    activity_id: string;
    url: string;
  }>;
  onComment?: SubscribeCallbacks<{ id: string; activity_id: string }>;
  onLike?: SubscribeCallbacks<{ id: string; activity_id: string }>;
}

const REALTIME_RETRY_MAX = 5;
const REALTIME_RETRY_MAX_DELAY = 8000;

/** 客户端过滤:仅处理属于当前 feed 的 activity 事件 */
function isActivityRelevant(
  getActivityIds: (() => Set<string> | undefined) | undefined,
  activityId: string | undefined,
): boolean {
  if (!activityId) return false;
  const ids = getActivityIds?.();
  if (!ids) return true; // 未提供集合时放行(向后兼容)
  return ids.has(activityId);
}

/**
 * 订阅某团体的 activities / activity_photos / comments 变更。
 * photo/comment/like 表无 group_id 列,通过 getActivityIds() 在客户端过滤,
 * 避免监听全表带来的跨群泄露与噪音。
 * 返回 unsubscribe 函数。
 */
export function subscribeToGroup(
  groupId: string,
  options: SubscribeOptions
) {
  const supabase = createClient();
  // 频道名加随机后缀,避免多组件实例(或 HMR)复用同名频道导致事件串扰
  const suffix = Math.random().toString(36).slice(2, 8);
  const channel = supabase.channel(`group-${groupId}-${suffix}`);

  if (options.onActivity) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "activities",
        filter: `group_id=eq.${groupId}`,
      },
      (payload) => {
        const row = payload.new as { id: string; group_id: string };
        const oldRow = payload.old as Partial<{ id: string; group_id: string }>;
        if (payload.eventType === "INSERT") {
          options.onActivity?.onInsert?.(row);
        } else if (payload.eventType === "UPDATE") {
          options.onActivity?.onUpdate?.(row);
        } else if (payload.eventType === "DELETE") {
          options.onActivity?.onDelete?.(oldRow);
        }
      }
    );
  }

  if (options.onPhoto) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "activity_photos" },
      (payload) => {
        const row = payload.new as {
          id: string;
          activity_id: string;
          url: string;
        };
        const oldRow = payload.old as Partial<{
          id: string;
          activity_id: string;
        }>;
        // DELETE 时 new 为空对象,需从 old 取 activity_id
        const activityId =
          payload.eventType === "DELETE" ? oldRow.activity_id : row.activity_id;
        if (!isActivityRelevant(options.getActivityIds, activityId)) return;
        if (payload.eventType === "INSERT") {
          options.onPhoto?.onInsert?.(row);
        } else if (payload.eventType === "DELETE") {
          options.onPhoto?.onDelete?.(oldRow);
        }
      }
    );
  }

  if (options.onComment) {
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "comments" },
      (payload) => {
        const row = payload.new as { id: string; activity_id: string };
        if (!isActivityRelevant(options.getActivityIds, row.activity_id)) return;
        options.onComment?.onInsert?.(row);
      }
    );
  }

  if (options.onLike) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "activity_likes" },
      (payload) => {
        const row = payload.new as { id: string; activity_id: string };
        const oldRow = payload.old as Partial<{
          id: string;
          activity_id: string;
        }>;
        const activityId =
          payload.eventType === "DELETE" ? oldRow.activity_id : row.activity_id;
        if (!isActivityRelevant(options.getActivityIds, activityId)) return;
        if (payload.eventType === "INSERT") options.onLike?.onInsert?.(row);
        else if (payload.eventType === "DELETE")
          options.onLike?.onDelete?.(oldRow);
      }
    );
  }

  // 退避重连:CHANNEL_ERROR / TIMED_OUT 时指数退避重试,上限 5 次
  let retryCount = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerReconnect = () => {
    if (retryCount >= REALTIME_RETRY_MAX) return;
    const delay = Math.min(
      1000 * Math.pow(2, retryCount),
      REALTIME_RETRY_MAX_DELAY
    );
    retryCount += 1;
    reconnectTimer = setTimeout(() => {
      // 重新触发订阅流程;原回调会在后续状态变化时再次触发
      channel.subscribe();
    }, delay);
  };

  channel.subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      triggerReconnect();
    } else if (status === "SUBSCRIBED") {
      retryCount = 0;
    }
  });

  return () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    supabase.removeChannel(channel);
  };
}

interface UseRealtimeGroupOptions
  extends Omit<SubscribeOptions, "getActivityIds"> {
  /**
   * 当前 feed 中的 activity id 集合,用于客户端过滤 photo/comment/like 事件。
   * 每次渲染可传入新 Set,hook 内部用 ref 保证订阅回调读取最新值。
   */
  activityIds?: Set<string>;
}

/**
 * 便捷 hook:在组件挂载期间订阅,卸载时自动取消。
 * 仅在 groupId 变化时重新订阅;callbacks / activityIds 通过 ref 始终读最新,
 * 避免 re-subscribe 抖动。
 */
export function useRealtimeGroup(
  groupId: string | null,
  options: UseRealtimeGroupOptions
) {
  const ref = useRef(options);
  ref.current = options;

  useEffect(() => {
    if (!groupId) return;
    // 包装 callbacks:每次回调触发时从 ref 读取最新值,确保 activityIds 过滤生效
    const unsubscribe = subscribeToGroup(groupId, {
      getActivityIds: () => ref.current.activityIds,
      onActivity: {
        onInsert: (row) => ref.current.onActivity?.onInsert?.(row),
        onUpdate: (row) => ref.current.onActivity?.onUpdate?.(row),
        onDelete: (row) => ref.current.onActivity?.onDelete?.(row),
      },
      onPhoto: {
        onInsert: (row) => ref.current.onPhoto?.onInsert?.(row),
        onDelete: (row) => ref.current.onPhoto?.onDelete?.(row),
      },
      onComment: {
        onInsert: (row) => ref.current.onComment?.onInsert?.(row),
      },
      onLike: {
        onInsert: (row) => ref.current.onLike?.onInsert?.(row),
        onDelete: (row) => ref.current.onLike?.onDelete?.(row),
      },
    });
    return unsubscribe;
  }, [groupId]);
}
