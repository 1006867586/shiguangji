"use client";

// ============================================================
// useChatUnread — 圈子聊天未读数：
//   - SWR 拉取服务端权威计数（last_read_at 之后、非本人的消息）
//   - Realtime 订阅新消息实时 +1（排除本人消息，避免双端/已读自增）
//   - markRead 标记已读：本地清零 + 更新 SWR 缓存 + POST 落库
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { createClient } from "@/lib/supabase/client";
import { fetchData } from "@/lib/fetcher";

const keyFor = (groupId: string) =>
  `/api/groups/${groupId}/messages/unread-count`;

interface UseChatUnread {
  /** 未读消息数 */
  unread: number;
  /** 标记已读（打开聊天页时调用） */
  markRead: () => Promise<void>;
  /** 重新拉取服务端计数 */
  refresh: () => Promise<void>;
}

export function useChatUnread(
  groupId: string | null,
  currentUserId: string
): UseChatUnread {
  // Realtime 期间的新消息增量：服务端计数 + 本地产增量 = 实时未读
  const [delta, setDelta] = useState(0);
  const userIdRef = useRef(currentUserId);
  userIdRef.current = currentUserId;

  const { data, mutate: revalidate } = useSWR<{ count: number }>(
    groupId ? keyFor(groupId) : null,
    (url: string) => fetchData<{ count: number }>(url),
    { revalidateOnFocus: false }
  );

  const unread = Math.max(0, (data?.count ?? 0) + delta);

  // Realtime：他人新消息 → 本地 +1（本人消息已在服务端计数排除，本地同样忽略）
  useEffect(() => {
    if (!groupId) return;
    const supabase = createClient();
    const suffix = Math.random().toString(36).slice(2, 8);
    const channel = supabase
      .channel(`chat-unread-${groupId}-${suffix}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const row = payload.new as { sender_id: string };
          if (row.sender_id !== userIdRef.current) {
            setDelta((d) => d + 1);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  /** 标记已读：本地清零 + 更新 SWR 缓存 + 落库（失败静默，下轮拉取自会校正） */
  const markRead = useCallback(async () => {
    if (!groupId) return;
    setDelta(0);
    await globalMutate(keyFor(groupId), { count: 0 }, { revalidate: false });
    try {
      await fetchData(`/api/groups/${groupId}/messages/read`, {
        method: "POST",
      });
    } catch {
      /* 静默：服务端未读会在下次 refresh 时拉取到真实值 */
    }
  }, [groupId]);

  const refresh = useCallback(async () => {
    setDelta(0);
    await revalidate();
  }, [revalidate]);

  return { unread, markRead, refresh };
}

/** 全局标记已读（供聊天页等非 badge 场景直接调用，同步清空各 badge 缓存） */
export async function markChatRead(groupId: string): Promise<void> {
  try {
    await fetchData(`/api/groups/${groupId}/messages/read`, {
      method: "POST",
    });
  } catch {
    /* 静默 */
  } finally {
    await globalMutate(keyFor(groupId), { count: 0 }, { revalidate: false });
  }
}
