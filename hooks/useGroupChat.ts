"use client";

// ============================================================
// useGroupChat — 圈子聊天：历史加载 / 发送 / Realtime 实时收发
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchData, fetcher } from "@/lib/fetcher";
import type {
  ChatMessagesResponse,
  GroupMessage,
  GroupMember,
  SendMessageBody,
} from "@/types";

interface UseGroupChat {
  messages: GroupMessage[];
  hasMore: boolean;
  loadingInitial: boolean;
  loadingOlder: boolean;
  /** 加载更早的历史消息 */
  loadOlder: () => Promise<void>;
  /** 发送文本 / 图片消息 */
  sendMessage: (body: SendMessageBody) => Promise<GroupMessage>;
}

/** 前缀匹配去重：聊天可能同时由 POST 回包 + Realtime 投递，保证只出现一次 */
function dedupe<M extends { id: string }>(list: M[], seen: Set<string>): M[] {
  const out: M[] = [];
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function useGroupChat(
  groupId: string | null,
  members: GroupMember[]
): UseGroupChat {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const seen = useRef<Set<string>>(new Set());
  const cursor = useRef<string | null>(null);
  const membersRef = useRef(members);
  membersRef.current = members;

  const resolveSender = useCallback((senderId: string) => {
    const m = membersRef.current.find((x) => x.user_id === senderId);
    return m?.profile ?? null;
  }, []);

  /** 追加一条（去重后放末尾） */
  const appendMessage = useCallback((msg: GroupMessage) => {
    setMessages((prev) => dedupe([...prev, msg], seen.current));
  }, []);

  // 初始加载 + Realtime
  useEffect(() => {
    if (!groupId) return;
    seen.current = new Set();
    setMessages([]);
    setLoadingInitial(true);

    let active = true;
    const supabase = createClient();

    fetchData<ChatMessagesResponse>(`/api/groups/${groupId}/messages?limit=50`)
      .then((res) => {
        if (!active) return;
        setMessages(dedupe(res.data, seen.current));
        cursor.current = res.next_cursor;
        setHasMore(res.has_more);
      })
      .catch(() => {
        /* 顶部用户可见错误由组件提示 */
      })
      .finally(() => active && setLoadingInitial(false));

    const suffix = Math.random().toString(36).slice(2, 8);
    const channel = supabase
      .channel(`chat-${groupId}-${suffix}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const row = payload.new as GroupMessage;
          appendMessage({
            ...row,
            sender: resolveSender(row.sender_id),
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [groupId, appendMessage, resolveSender]);

  /** 加载更早历史 */
  const loadOlder = useCallback(async () => {
    if (!groupId || !cursor.current) return;
    setLoadingOlder(true);
    try {
      const res = await fetchData<ChatMessagesResponse>(
        `/api/groups/${groupId}/messages?before=${encodeURIComponent(cursor.current)}&limit=50`
      );
      setMessages((prev) => {
        const older = dedupe(res.data, seen.current);
        return dedupe([...older, ...prev], seen.current);
      });
      cursor.current = res.next_cursor;
      setHasMore(res.has_more);
    } finally {
      setLoadingOlder(false);
    }
  }, [groupId]);

  /** 发送消息（POST 后由返回结果入列；Realtime 投递自动去重） */
  const sendMessage = useCallback(
    async (body: SendMessageBody): Promise<GroupMessage> => {
      const msg = await fetchData<GroupMessage>(
        `/api/groups/${groupId}/messages`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
      appendMessage(msg);
      return msg;
    },
    [groupId, appendMessage]
  );

  return {
    messages,
    hasMore,
    loadingInitial,
    loadingOlder,
    loadOlder,
    sendMessage,
  };
}