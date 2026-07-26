"use client";

import { useCallback } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";
import type { Tag } from "@/types";

/**
 * useGroupTags — 获取团体标签列表（SWR 自动去重/竞态抑制/缓存）
 */
export function useGroupTags(groupId: string | null) {
  const { data, error, mutate, isLoading } = useSWR<Tag[]>(
    groupId ? `/api/groups/${groupId}/tags` : null,
    (url: string) => fetchData<Tag[]>(url),
    { revalidateOnFocus: false }
  );

  /** 创建标签（若已存在则后端返回现有），成功后更新本地缓存 */
  const createTag = useCallback(
    async (name: string): Promise<Tag> => {
      const created = await fetchData<Tag>(
        `/api/groups/${groupId}/tags`,
        {
          method: "POST",
          body: JSON.stringify({ name }),
        }
      );
      mutate(
        (cur) => {
          const prev = cur ?? [];
          return prev.some((t) => t.id === created.id) ? prev : [...prev, created];
        },
        { revalidate: false }
      );
      return created;
    },
    [groupId, mutate]
  );

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    tags: data ?? [],
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    createTag,
    reload,
  };
}

/**
 * useActivityTags — 获取活动当前标签（SWR）
 */
export function useActivityTags(activityId: string | null) {
  const { data, error, mutate, isLoading } = useSWR<Tag[]>(
    activityId ? `/api/activities/${activityId}/tags` : null,
    (url: string) => fetchData<Tag[]>(url),
    { revalidateOnFocus: false }
  );

  const setTags = useCallback(
    (value: Tag[] | ((prev: Tag[]) => Tag[])) => {
      mutate(
        (cur) => {
          const prev = cur ?? [];
          return typeof value === "function"
            ? (value as (p: Tag[]) => Tag[])(prev)
            : value;
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
    tags: data ?? [],
    setTags,
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    reload,
  };
}

/**
 * setActivityTags — 替换活动的标签（PUT）
 * @param activityId 活动 ID
 * @param tagNames 标签名称数组（自动查找/创建）
 */
export async function setActivityTags(
  activityId: string,
  tagNames: string[]
): Promise<Tag[]> {
  const tags = await fetchData<Tag[]>(
    `/api/activities/${activityId}/tags`,
    {
      method: "PUT",
      body: JSON.stringify({ tagNames }),
    }
  );
  // 同步本地缓存，避免后续重新拉取
  await globalMutate(`/api/activities/${activityId}/tags`, tags, false);
  return tags;
}

/**
 * clearActivityTags — 清除活动的所有标签（DELETE）
 */
export async function clearActivityTags(
  activityId: string
): Promise<{ success: boolean }> {
  const result = await fetcher<{ success: boolean }>(
    `/api/activities/${activityId}/tags`,
    { method: "DELETE" }
  );
  await globalMutate(`/api/activities/${activityId}/tags`, [], false);
  return result;
}
