"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";
import type { ReactionEmoji, ReactionSummary } from "@/types";

/** useReactions 返回值 */
interface UseReactionsReturn {
  summary: ReactionSummary | null;
  loading: boolean;
  error: string | null;
  /** 切换反应（同 emoji → toggle off；不同 emoji → 替换） */
  toggle: (emoji: ReactionEmoji) => Promise<{ reacted: boolean; emoji: ReactionEmoji }>;
  /** 删除指定 emoji 的反应 */
  remove: (emoji: ReactionEmoji) => Promise<void>;
  reload: () => Promise<void>;
}

/** 空汇总，用于初始化 */
function emptySummary(): ReactionSummary {
  return {
    like: 0,
    love: 0,
    haha: 0,
    wow: 0,
    sad: 0,
    angry: 0,
    my_reaction: null,
  };
}

/**
 * useReactions — SWR 拉取活动反应汇总，并提供 toggle/remove。
 * toggle 后会乐观更新本地缓存。
 */
export function useReactions(activityId: string | null): UseReactionsReturn {
  const { data, error, mutate, isLoading } = useSWR<ReactionSummary>(
    activityId ? `/api/activities/${activityId}/reactions` : null,
    (url: string) => fetchData<ReactionSummary>(url),
    { revalidateOnFocus: false }
  );

  const toggle = useCallback(
    async (emoji: ReactionEmoji) => {
      // 乐观更新：先按预期结果更新本地缓存，失败后由 mutate 回滚
      mutate(
        (cur) => {
          const prev = cur ?? emptySummary();
          const next: ReactionSummary = { ...prev };
          // 当前用户已有反应
          if (prev.my_reaction === emoji) {
            // 同 emoji → toggle off
            next[emoji] = Math.max(0, prev[emoji] - 1);
            next.my_reaction = null;
          } else if (prev.my_reaction) {
            // 不同 emoji → 替换：旧的 -1，新的 +1
            next[prev.my_reaction] = Math.max(0, prev[prev.my_reaction] - 1);
            next[emoji] = prev[emoji] + 1;
            next.my_reaction = emoji;
          } else {
            // 无反应 → 新增
            next[emoji] = prev[emoji] + 1;
            next.my_reaction = emoji;
          }
          return next;
        },
        { revalidate: false }
      );

      try {
        const res = await toggleReaction(activityId as string, emoji);
        // 服务端为权威，但仍保留乐观更新避免闪烁；如需精确可调用 mutate()
        return res;
      } catch (e) {
        // 失败 → 重新拉取以回滚
        await mutate();
        throw e;
      }
    },
    [activityId, mutate]
  );

  const remove = useCallback(
    async (emoji: ReactionEmoji) => {
      // 乐观更新
      mutate(
        (cur) => {
          const prev = cur ?? emptySummary();
          if (prev.my_reaction !== emoji) return prev;
          return {
            ...prev,
            [emoji]: Math.max(0, prev[emoji] - 1),
            my_reaction: null,
          };
        },
        { revalidate: false }
      );

      try {
        await fetcher<{ success: boolean }>(
          `/api/activities/${activityId}/reactions/${emoji}`,
          { method: "DELETE" }
        );
      } catch (e) {
        await mutate();
        throw e;
      }
    },
    [activityId, mutate]
  );

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    summary: data ?? null,
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    toggle,
    remove,
    reload,
  };
}

/** toggleReaction — POST 添加/切换反应 */
export async function toggleReaction(
  activityId: string,
  emoji: ReactionEmoji
): Promise<{ reacted: boolean; emoji: ReactionEmoji }> {
  return fetchData<{ reacted: boolean; emoji: ReactionEmoji }>(
    `/api/activities/${activityId}/reactions`,
    {
      method: "POST",
      body: JSON.stringify({ emoji }),
    }
  );
}
