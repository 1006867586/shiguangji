"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";

/** 评分汇总（对应 GET /api/activities/[id]/rating 的返回） */
interface RatingSummary {
  my_score: number | null;
  average: number;
  count: number;
}

/** useRating 返回值 */
interface UseRatingReturn {
  myScore: number | null;
  average: number;
  count: number;
  loading: boolean;
  error: string | null;
  /** 评分 / 更新评分 */
  rate: (score: number, comment?: string) => Promise<{ score: number }>;
  /** 删除自己的评分 */
  remove: () => Promise<void>;
  reload: () => Promise<void>;
}

/**
 * useRating — SWR 拉取活动评分汇总，并提供 rate/remove。
 * 变更后会重新拉取以同步平均分与评分人数。
 */
export function useRating(activityId: string | null): UseRatingReturn {
  const { data, error, mutate, isLoading } = useSWR<RatingSummary>(
    activityId ? `/api/activities/${activityId}/rating` : null,
    (url: string) => fetchData<RatingSummary>(url),
    { revalidateOnFocus: false }
  );

  const rate = useCallback(
    async (score: number, comment?: string) => {
      const res = await fetchData<{ score: number }>(
        `/api/activities/${activityId}/rating`,
        {
          method: "POST",
          body: JSON.stringify({ score, comment }),
        }
      );
      // 评分变更后重新拉取，保证 average/count 与服务端一致
      await mutate();
      return res;
    },
    [activityId, mutate]
  );

  const remove = useCallback(async () => {
    await fetcher<{ success: boolean }>(
      `/api/activities/${activityId}/rating`,
      { method: "DELETE" }
    );
    await mutate();
  }, [activityId, mutate]);

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    myScore: data?.my_score ?? null,
    average: data?.average ?? 0,
    count: data?.count ?? 0,
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    rate,
    remove,
    reload,
  };
}

/** rateActivity — 独立的评分函数（不依赖 hook 上下文） */
export async function rateActivity(
  activityId: string,
  score: number,
  comment?: string
): Promise<{ score: number }> {
  return fetchData<{ score: number }>(
    `/api/activities/${activityId}/rating`,
    {
      method: "POST",
      body: JSON.stringify({ score, comment }),
    }
  );
}
