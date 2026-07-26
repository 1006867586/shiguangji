"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";
import type { Activity } from "@/types";

/** useFavorites 返回值 */
interface UseFavoritesReturn {
  favorites: Activity[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * useFavorites — SWR 拉取当前用户的收藏列表。
 * 仅返回首屏数据，分页加载由调用方自行 fetch（与 useFeed 模式一致）。
 */
export function useFavorites(initialData?: Activity[]): UseFavoritesReturn {
  const { data, error, mutate, isLoading } = useSWR<{ data: Activity[]; next_cursor: string | null }>(
    "/api/favorites",
    (url: string) => fetcher(url),
    {
      fallbackData: initialData ? { data: initialData, next_cursor: null } : undefined,
      revalidateOnFocus: false,
    }
  );

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    favorites: data?.data ?? [],
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    reload,
  };
}

/** useIsFavorited 返回值 */
interface UseIsFavoritedReturn {
  favorited: boolean;
  toggle: () => Promise<void>;
}

/**
 * useIsFavorited — 单条活动的本地收藏状态管理（无需 SWR）。
 * 初始值由调用方从 Activity.is_favorited 传入；toggle 会调用 API 并更新本地状态。
 */
export function useIsFavorited(
  activityId: string,
  initial: boolean
): UseIsFavoritedReturn {
  const [favorited, setFavorited] = useState<boolean>(initial);

  const toggle = useCallback(async () => {
    // 乐观更新：先翻转本地状态，失败后回滚
    const prev = favorited;
    setFavorited(!prev);
    try {
      await toggleFavorite(activityId);
    } catch (e) {
      setFavorited(prev);
      throw e;
    }
  }, [activityId, favorited]);

  return { favorited, toggle };
}

/** toggleFavorite — POST 收藏 toggle，返回 { favorited: boolean } */
export async function toggleFavorite(
  activityId: string
): Promise<{ favorited: boolean }> {
  return fetchData<{ favorited: boolean }>(
    `/api/activities/${activityId}/favorite`,
    { method: "POST" }
  );
}

/** removeFavorite — DELETE 取消收藏 */
export async function removeFavorite(activityId: string): Promise<void> {
  await fetcher<{ success: boolean }>(
    `/api/activities/${activityId}/favorite`,
    { method: "DELETE" }
  );
}
