"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";
import type {
  Activity,
  Comment,
  CreateActivityBody,
  CreateCommentBody,
  UpdateActivityBody,
} from "@/types";

type SetStateAction<T> = T | ((prev: T) => T);

/** 获取单个活动详情(SWR 自动去重/竞态抑制/缓存) */
export function useActivity(activityId: string | null) {
  const { data, error, mutate, isLoading } = useSWR<Activity>(
    activityId ? `/api/activities/${activityId}` : null,
    (url: string) => fetchData<Activity>(url),
    { revalidateOnFocus: false }
  );

  // 兼容原 useState 风格 setter:接受值或 updater 函数;返回 null 时清除缓存
  const setActivity = useCallback(
    (value: SetStateAction<Activity | null>) => {
      mutate(
        (cur) => {
          const prev = cur ?? null;
          const next =
            typeof value === "function"
              ? (value as (p: Activity | null) => Activity | null)(prev)
              : value;
          return next === null ? undefined : next;
        },
        { revalidate: false }
      );
    },
    [mutate]
  );

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    activity: data ?? null,
    setActivity,
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    reload,
  };
}

/** 创建活动(原创或转发) */
export async function createActivity(
  body: CreateActivityBody & {
    parseLink?: boolean;
    linkUrl?: string;
  }
) {
  return fetchData<{ id: string }>("/api/activities", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** 删除活动 */
export async function deleteActivity(id: string) {
  return fetcher<{ success: boolean }>(`/api/activities/${id}`, {
    method: "DELETE",
  });
}

/** 编辑活动(仅作者,仅原创类型) */
export async function updateActivity(
  id: string,
  body: UpdateActivityBody
): Promise<Activity> {
  return fetchData<Activity>(`/api/activities/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** 点赞 / 取消点赞 */
export async function toggleLike(id: string): Promise<{ liked: boolean }> {
  return fetchData<{ liked: boolean }>(`/api/activities/${id}/like`, {
    method: "POST",
  });
}

/** 转发 */
export async function repostActivity(
  id: string,
  opts: { groupId?: string; comment?: string; content?: string }
) {
  return fetchData<{ id: string }>(`/api/activities/${id}/repost`, {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

/** 评论:获取 + 发表(SWR 提供去重/竞态抑制,新增 error 状态返回) */
export function useComments(activityId: string | null) {
  const { data, error, mutate, isLoading } = useSWR<Comment[]>(
    activityId ? `/api/activities/${activityId}/comments` : null,
    (url: string) => fetchData<Comment[]>(url),
    { revalidateOnFocus: false }
  );

  const setComments = useCallback(
    (value: SetStateAction<Comment[]>) => {
      mutate(
        (cur) => {
          const prev = cur ?? [];
          return typeof value === "function"
            ? (value as (p: Comment[]) => Comment[])(prev)
            : value;
        },
        { revalidate: false }
      );
    },
    [mutate]
  );

  const addComment = useCallback(
    async (body: CreateCommentBody) => {
      const created = await fetchData<Comment>(
        `/api/activities/${activityId}/comments`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
      mutate(
        (cur) => {
          const prev = cur ?? [];
          if (created.parent_id) {
            return prev.map((c) =>
              c.id === created.parent_id
                ? { ...c, replies: [...(c.replies ?? []), created] }
                : c
            );
          }
          return [...prev, created];
        },
        { revalidate: false }
      );
      return created;
    },
    [activityId, mutate]
  );

  const removeComment = useCallback(
    async (commentId: string) => {
      await fetcher(`/api/activities/${activityId}/comments/${commentId}`, {
        method: "DELETE",
      });
      mutate(
        (cur) => {
          const prev = cur ?? [];
          return prev
            .map((c) => ({
              ...c,
              replies: (c.replies ?? []).filter((r) => r.id !== commentId),
            }))
            .filter((c) => c.id !== commentId);
        },
        { revalidate: false }
      );
    },
    [activityId, mutate]
  );

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    comments: data ?? [],
    setComments,
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    addComment,
    removeComment,
    reload,
  };
}
