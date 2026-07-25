"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface SubscribeCallbacks<T> {
  onInsert?: (row: T) => void;
  onUpdate?: (row: T) => void;
  onDelete?: (row: Partial<T>) => void;
}

/**
 * 订阅某团体的 activities / activity_photos / comments 变更。
 * 返回 unsubscribe 函数。
 */
export function subscribeToGroup(
  groupId: string,
  callbacks: {
    onActivity?: SubscribeCallbacks<{ id: string; group_id: string }>;
    onPhoto?: SubscribeCallbacks<{
      id: string;
      activity_id: string;
      url: string;
    }>;
    onComment?: SubscribeCallbacks<{ id: string; activity_id: string }>;
    onLike?: SubscribeCallbacks<{ id: string; activity_id: string }>;
  }
) {
  const supabase = createClient();
  const channel = supabase.channel(`group-${groupId}`);

  if (callbacks.onActivity) {
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
          callbacks.onActivity?.onInsert?.(row);
        } else if (payload.eventType === "UPDATE") {
          callbacks.onActivity?.onUpdate?.(row);
        } else if (payload.eventType === "DELETE") {
          callbacks.onActivity?.onDelete?.(oldRow);
        }
      }
    );
  }

  if (callbacks.onPhoto) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "activity_photos" },
      (payload) => {
        const row = payload.new as { id: string; activity_id: string; url: string };
        const oldRow = payload.old as Partial<{ id: string; activity_id: string }>;
        if (payload.eventType === "INSERT") {
          callbacks.onPhoto?.onInsert?.(row);
        } else if (payload.eventType === "DELETE") {
          callbacks.onPhoto?.onDelete?.(oldRow);
        }
      }
    );
  }

  if (callbacks.onComment) {
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "comments" },
      (payload) => {
        const row = payload.new as { id: string; activity_id: string };
        callbacks.onComment?.onInsert?.(row);
      }
    );
  }

  if (callbacks.onLike) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "activity_likes" },
      (payload) => {
        const row = payload.new as { id: string; activity_id: string };
        const oldRow = payload.old as Partial<{ id: string; activity_id: string }>;
        if (payload.eventType === "INSERT") callbacks.onLike?.onInsert?.(row);
        else if (payload.eventType === "DELETE") callbacks.onLike?.onDelete?.(oldRow);
      }
    );
  }

  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * 便捷 hook：在组件挂载期间订阅，卸载时自动取消。
 */
export function useRealtimeGroup(
  groupId: string | null,
  callbacks: Parameters<typeof subscribeToGroup>[1]
) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!groupId) return;
    const unsubscribe = subscribeToGroup(groupId, callbacksRef.current);
    return unsubscribe;
  }, [groupId]);
}
