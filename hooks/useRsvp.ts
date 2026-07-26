"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";
import type { RsvpStatus, RsvpSummary } from "@/types";

/** RSVP 接口返回（RsvpSummary + 当前用户状态） */
interface RsvpResponse extends RsvpSummary {
  my_status: RsvpStatus | null;
}

/** useRsvp 返回值 */
interface UseRsvpReturn {
  summary: RsvpSummary | null;
  myStatus: RsvpStatus | null;
  loading: boolean;
  error: string | null;
  /** 设置 / 更新 RSVP 状态 */
  setStatus: (status: RsvpStatus) => Promise<{ status: RsvpStatus }>;
  /** 取消自己的 RSVP */
  cancel: () => Promise<void>;
  reload: () => Promise<void>;
}

/**
 * useRsvp — SWR 拉取活动 RSVP 汇总，并提供 setStatus/cancel。
 * 变更后会重新拉取以同步计数与出席者列表。
 */
export function useRsvp(activityId: string | null): UseRsvpReturn {
  const { data, error, mutate, isLoading } = useSWR<RsvpResponse>(
    activityId ? `/api/activities/${activityId}/rsvp` : null,
    (url: string) => fetchData<RsvpResponse>(url),
    { revalidateOnFocus: false }
  );

  const setStatus = useCallback(
    async (status: RsvpStatus) => {
      const res = await fetchData<{ status: RsvpStatus }>(
        `/api/activities/${activityId}/rsvp`,
        {
          method: "POST",
          body: JSON.stringify({ status }),
        }
      );
      await mutate();
      return res;
    },
    [activityId, mutate]
  );

  const cancel = useCallback(async () => {
    await fetcher<{ success: boolean }>(
      `/api/activities/${activityId}/rsvp`,
      { method: "DELETE" }
    );
    await mutate();
  }, [activityId, mutate]);

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  // 从响应中拆分出 summary（剥离 my_status）
  const summary: RsvpSummary | null = data
    ? {
        attending: data.attending,
        maybe: data.maybe,
        declined: data.declined,
        attendees: data.attendees,
      }
    : null;

  return {
    summary,
    myStatus: data?.my_status ?? null,
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    setStatus,
    cancel,
    reload,
  };
}

/** setRsvpStatus — 独立的 RSVP 设置函数（不依赖 hook 上下文） */
export async function setRsvpStatus(
  activityId: string,
  status: RsvpStatus
): Promise<{ status: RsvpStatus }> {
  return fetchData<{ status: RsvpStatus }>(
    `/api/activities/${activityId}/rsvp`,
    {
      method: "POST",
      body: JSON.stringify({ status }),
    }
  );
}
