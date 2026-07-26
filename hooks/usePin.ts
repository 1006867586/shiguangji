"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";
import type { Activity } from "@/types";

/** usePinnedActivities 返回值 */
interface UsePinnedActivitiesReturn {
  pinnedActivities: Activity[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * usePinnedActivities — SWR 拉取团体置顶活动列表。
 * 调用方传入 groupId；groupId 为空时不发请求。
 */
export function usePinnedActivities(
  groupId: string | null,
  initialData?: Activity[]
): UsePinnedActivitiesReturn {
  const { data, error, mutate, isLoading } = useSWR<{ data: Activity[] }>(
    groupId ? `/api/groups/${groupId}/pins` : null,
    (url: string) => fetcher(url),
    {
      fallbackData: initialData ? { data: initialData } : undefined,
      revalidateOnFocus: false,
    }
  );

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    pinnedActivities: data?.data ?? [],
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    reload,
  };
}

/** togglePin — POST 置顶 toggle（已置顶则取消，未置顶则置顶），返回 { pinned: boolean } */
export async function togglePin(
  activityId: string
): Promise<{ pinned: boolean }> {
  return fetchData<{ pinned: boolean }>(`/api/activities/${activityId}/pin`, {
    method: "POST",
  });
}

/** unpin — DELETE 取消置顶 */
export async function unpin(activityId: string): Promise<void> {
  await fetcher<{ success: boolean }>(`/api/activities/${activityId}/pin`, {
    method: "DELETE",
  });
}
