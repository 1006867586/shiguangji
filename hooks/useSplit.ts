"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";
import type { ActivitySplit, CreateSplitBody, UUID } from "@/types";

/** useSplit 返回值 */
interface UseSplitReturn {
  split: ActivitySplit | null;
  loading: boolean;
  error: string | null;
  /** 创建分账（activityId 由 hook 上下文提供） */
  create: (
    body: Omit<CreateSplitBody, "activityId" | "groupId">
  ) => Promise<ActivitySplit>;
  /** 更新分账（仅创建者） */
  update: (body: {
    title?: string;
    totalAmount?: number;
    status?: "open" | "settled";
  }) => Promise<ActivitySplit>;
  /** 删除分账（仅创建者） */
  remove: () => Promise<void>;
  /** 标记参与者支付状态（创建者可改任意人，自己可改自己） */
  markPaid: (userId: UUID, paid: boolean) => Promise<{ paid: boolean }>;
  reload: () => Promise<void>;
}

/**
 * useSplit — SWR 拉取活动分账（含参与者），并提供增删改与支付标记。
 * 创建 / 更新后乐观写入缓存，标记支付后重新拉取以同步服务端状态。
 */
export function useSplit(activityId: string | null): UseSplitReturn {
  const { data, error, mutate, isLoading } = useSWR<ActivitySplit | null>(
    activityId ? `/api/activities/${activityId}/split` : null,
    (url: string) => fetchData<ActivitySplit | null>(url),
    { revalidateOnFocus: false }
  );

  const create = useCallback(
    async (body: Omit<CreateSplitBody, "activityId" | "groupId">) => {
      const created = await createSplit(activityId as string, body);
      await mutate(created, { revalidate: false });
      return created;
    },
    [activityId, mutate]
  );

  const update = useCallback(
    async (body: {
      title?: string;
      totalAmount?: number;
      status?: "open" | "settled";
    }) => {
      if (!data?.id) throw new Error("分账不存在");
      const updated = await updateSplit(data.id, body);
      await mutate(updated, { revalidate: false });
      return updated;
    },
    [data, mutate]
  );

  const remove = useCallback(async () => {
    if (!data?.id) throw new Error("分账不存在");
    await deleteSplit(data.id);
    await mutate(null, { revalidate: false });
  }, [data, mutate]);

  const markPaid = useCallback(
    async (userId: UUID, paid: boolean) => {
      if (!data?.id) throw new Error("分账不存在");
      const res = await markSplitParticipantPaid(data.id, userId, paid);
      await mutate();
      return res;
    },
    [data, mutate]
  );

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    split: data ?? null,
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    create,
    update,
    remove,
    markPaid,
    reload,
  };
}

/** createSplit — 创建分账（独立函数） */
export async function createSplit(
  activityId: string,
  body: Omit<CreateSplitBody, "activityId" | "groupId">
): Promise<ActivitySplit> {
  return fetchData<ActivitySplit>(`/api/activities/${activityId}/split`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** updateSplit — 更新分账（仅创建者） */
export async function updateSplit(
  splitId: string,
  body: { title?: string; totalAmount?: number; status?: "open" | "settled" }
): Promise<ActivitySplit> {
  return fetchData<ActivitySplit>(`/api/splits/${splitId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** deleteSplit — 删除分账（仅创建者） */
export async function deleteSplit(splitId: string): Promise<{ success: boolean }> {
  return fetcher<{ success: boolean }>(`/api/splits/${splitId}`, {
    method: "DELETE",
  });
}

/** markSplitParticipantPaid — 标记参与者支付状态 */
export async function markSplitParticipantPaid(
  splitId: string,
  userId: UUID,
  paid: boolean
): Promise<{ paid: boolean }> {
  return fetchData<{ paid: boolean }>(
    `/api/splits/${splitId}/participants/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ paid }),
    }
  );
}
