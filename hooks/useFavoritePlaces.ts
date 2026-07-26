"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";
import type {
  CreateFavoritePlacesBody,
  FavoritePlace,
  FavoritePlatform,
  ParsedFavoritesScreenshot,
} from "@/types";

// ============================================================
// useFavoritePlaces — 当前用户的店铺收藏列表
// ============================================================

interface UseFavoritePlacesReturn {
  places: FavoritePlace[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** 批量入库（去重由后端处理），返回 { inserted, duplicated } */
  addMany: (input: CreateFavoritePlacesBody) => Promise<{
    inserted: number;
    duplicated: number;
  }>;
  remove: (id: string) => Promise<void>;
}

export function useFavoritePlaces(): UseFavoritePlacesReturn {
  const { data, error, mutate, isLoading } = useSWR<{ data: FavoritePlace[] }>(
    "/api/favorite-places",
    (url: string) => fetcher(url),
    { revalidateOnFocus: false }
  );

  const reload = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const addMany = useCallback(
    async (input: CreateFavoritePlacesBody) => {
      const res = await fetchData<{
        inserted: number;
        duplicated: number;
      }>("/api/favorite-places", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await mutate();
      return { inserted: res.inserted, duplicated: res.duplicated };
    },
    [mutate]
  );

  const remove = useCallback(
    async (id: string) => {
      // 乐观删除
      const prev = data?.data;
      await mutate(
        { data: (prev ?? []).filter((p) => p.id !== id) },
        { revalidate: false }
      );
      try {
        await fetcher<{ success: boolean }>(`/api/favorite-places/${id}`, {
          method: "DELETE",
        });
      } catch (e) {
        // 回滚
        await mutate({ data: prev ?? [] }, { revalidate: false });
        throw e;
      }
    },
    [data, mutate]
  );

  return {
    places: data?.data ?? [],
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "加载失败"
      : null,
    reload,
    addMany,
    remove,
  };
}

// ============================================================
// useAiParseFavorites — 识别收藏夹截图（多家店）
// ============================================================

interface UseAiParseFavoritesReturn {
  parse: (
    imageUrl: string,
    platform?: FavoritePlatform
  ) => Promise<ParsedFavoritesScreenshot>;
  loading: boolean;
  error: string | null;
}

export function useAiParseFavorites(): UseAiParseFavoritesReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parse = useCallback(
    async (
      imageUrl: string,
      platform?: FavoritePlatform
    ): Promise<ParsedFavoritesScreenshot> => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchData<ParsedFavoritesScreenshot>(
          "/api/ai/parse-favorites-screenshot",
          {
            method: "POST",
            body: JSON.stringify({ imageUrl, platform }),
          }
        );
        return data;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "截图识别失败";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { parse, loading, error };
}
