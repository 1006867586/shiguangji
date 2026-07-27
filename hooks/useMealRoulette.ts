"use client";

import { useCallback, useEffect } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { fetchData, fetcher } from "@/lib/fetcher";
import type {
  CreateMealRouletteItemBody,
  ImportMealRouletteItemsBody,
  MealRouletteItem,
} from "@/types";

/** SWR key 工厂：隔离不同团体的候选池缓存 */
const keyOf = (groupId: string) =>
  `/api/groups/${groupId}/meal-roulette` as const;

interface UseMealRouletteReturn {
  items: MealRouletteItem[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** 单条新增 */
  add: (input: CreateMealRouletteItemBody) => Promise<MealRouletteItem>;
  /** 批量导入（从收藏夹导入），返回 { inserted, duplicated } */
  importMany: (
    input: ImportMealRouletteItemsBody
  ) => Promise<{ inserted: number; duplicated: number }>;
  /** 删除单条 */
  remove: (itemId: string) => Promise<void>;
}

/**
 * useMealRoulette — 团体级「今天吃什么」候选池。
 * SWR 拉取 + Supabase Realtime 订阅（成员增添/删除实时同步）。
 */
export function useMealRoulette(
  groupId: string | null | undefined
): UseMealRouletteReturn {
  const key = groupId ? keyOf(groupId) : null;

  const { data, error, mutate, isLoading } = useSWR<{ data: MealRouletteItem[] }>(
    key,
    (url: string) => fetcher(url),
    { revalidateOnFocus: false }
  );

  // Realtime:监听本团体候选池变更，变更后直接重拉（数据量小，简单可靠）
  useEffect(() => {
    if (!groupId) return;
    const supabase = createClient();
    const channel = supabase.channel(`meal-roulette-${groupId}`);
    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meal_roulette_items",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          mutate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, mutate]);

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const add = useCallback(
    async (input: CreateMealRouletteItemBody) => {
      const item = await fetchData<MealRouletteItem>(keyOf(groupId!), {
        method: "POST",
        body: JSON.stringify(input),
      });
      await mutate();
      return item;
    },
    [groupId, mutate]
  );

  const importMany = useCallback(
    async (input: ImportMealRouletteItemsBody) => {
      const res = await fetchData<{ inserted: number; duplicated: number }>(
        keyOf(groupId!),
        {
          method: "POST",
          body: JSON.stringify(input),
        }
      );
      await mutate();
      return { inserted: res.inserted, duplicated: res.duplicated };
    },
    [groupId, mutate]
  );

  const remove = useCallback(
    async (itemId: string) => {
      // 乐观删除
      const prev = data?.data;
      await mutate(
        { data: (prev ?? []).filter((i) => i.id !== itemId) },
        { revalidate: false }
      );
      try {
        await fetcher<{ success: boolean }>(
          `${keyOf(groupId!)}?itemId=${itemId}`,
          { method: "DELETE" }
        );
      } catch (e) {
        await mutate({ data: prev ?? [] }, { revalidate: false });
        throw e;
      }
    },
    [data, groupId, mutate]
  );

  return {
    items: data?.data ?? [],
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    reload,
    add,
    importMany,
    remove,
  };
}

/** 从候选数组里随机抽一个索引 */
export function pickRandomIndex(length: number): number {
  if (length <= 0) return -1;
  return Math.floor(Math.random() * length);
}
