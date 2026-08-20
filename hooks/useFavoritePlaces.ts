"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { fetchData, fetcher } from "@/lib/fetcher";
import type {
  CreateFavoritePlacesBody,
  FavoritePlace,
  FavoritePlatform,
  ParsedFavoritesScreenshot,
  UpdateFavoritePlaceBody,
} from "@/types";

// ============================================================
// useFavoritePlaces — 当前用户的店铺收藏列表
// ============================================================

interface UseFavoritePlacesReturn {
  places: FavoritePlace[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** 批量入库（去重由后端处理），返回 { inserted, duplicated, poiEnriched } */
  addMany: (input: CreateFavoritePlacesBody) => Promise<{
    inserted: number;
    duplicated: number;
    poiEnriched: {
      matched: number;
      unmatched: number;
      skipped: number;
      budgetExhausted: number;
    } | null;
  }>;
  remove: (id: string) => Promise<void>;
  /** 编辑单条店铺（乐观更新，失败回滚），返回更新后的完整数据 */
  updateOne: (
    id: string,
    body: UpdateFavoritePlaceBody
  ) => Promise<FavoritePlace>;
  /** 局部更新单条店铺（用于联网搜索补齐后回填 UI，避免整表重新拉取） */
  patchPlace: (id: string, patch: Partial<FavoritePlace>) => void;
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
        poiEnriched?: {
          matched: number;
          unmatched: number;
          skipped: number;
          budgetExhausted: number;
        } | null;
      }>("/api/favorite-places", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await mutate();
      return {
        inserted: res.inserted,
        duplicated: res.duplicated,
        poiEnriched: res.poiEnriched ?? null,
      };
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

  const updateOne = useCallback(
    async (id: string, body: UpdateFavoritePlaceBody) => {
      // 乐观更新
      const prev = data?.data;
      if (prev) {
        await mutate(
          {
            data: prev.map((p) =>
              p.id === id ? ({ ...p, ...body } as FavoritePlace) : p
            ),
          },
          { revalidate: false }
        );
      }
      try {
        const res = await fetcher<{ data: FavoritePlace }>(
          `/api/favorite-places/${id}`,
          { method: "PATCH", body: JSON.stringify(body) }
        );
        // 以服务端返回为准回填（含规范化后的 rating/空串转 null 等）
        await mutate(
          {
            data: (prev ?? []).map((p) =>
              p.id === id ? res.data : p
            ),
          },
          { revalidate: false }
        );
        return res.data;
      } catch (e) {
        // 回滚
        if (prev) await mutate({ data: prev }, { revalidate: false });
        throw e;
      }
    },
    [data, mutate]
  );

  const patchPlace = useCallback(
    (id: string, patch: Partial<FavoritePlace>) => {
      const prev = data?.data;
      if (!prev) return;
      mutate(
        {
          data: prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        },
        { revalidate: false }
      );
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
    updateOne,
    patchPlace,
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

// ============================================================
// useEnrichPlace — 高德 POI 联网补齐单条店铺信息（纯高德、不消耗 AI 配额）
// ============================================================

export interface EnrichedInfo {
  coverImageUrl: string | null;
  storeUrl: string | null;
  phone: string | null;
  address: string | null;
  category: string | null;
  rating: number | null;
  price: string | null;
}

interface EnrichResponse {
  data: FavoritePlace;
  enriched: EnrichedInfo;
  updatedFields?: string[];
  skipped?: boolean;
}

interface UseEnrichPlaceReturn {
  /** 正在补齐的 placeId 集合（用于 UI 单条 loading） */
  enrichingIds: Set<string>;
  /** 批量补齐时的整体进度 */
  batchProgress: { total: number; done: number; success: number; failed: number } | null;
  /** 补齐单条店铺。force=true 时强制重新搜索覆盖已有值 */
  enrichOne: (placeId: string, force?: boolean) => Promise<EnrichResponse>;
  /** 串行批量补齐，避免触发 API 速率限制。force=true 时强制覆盖 */
  enrichMany: (
    places: Array<Pick<FavoritePlace, "id">>,
    force?: boolean,
    onProgress?: (done: number, total: number) => void
  ) => Promise<void>;
  error: string | null;
}

export function useEnrichPlace(
  onPlaceUpdated?: (id: string, patch: Partial<FavoritePlace>) => void
): UseEnrichPlaceReturn {
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<
    UseEnrichPlaceReturn["batchProgress"]
  >(null);
  const [error, setError] = useState<string | null>(null);

  const enrichOne = useCallback(
    async (placeId: string, force = false): Promise<EnrichResponse> => {
      setEnrichingIds((prev) => new Set(prev).add(placeId));
      setError(null);
      try {
        const res = await fetcher<EnrichResponse>("/api/favorite-places/enrich", {
          method: "POST",
          body: JSON.stringify({ placeId, force }),
        });
        // 局部回填 UI
        if (onPlaceUpdated && res.data) {
          onPlaceUpdated(placeId, res.data);
        }
        return res;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "高德补齐失败";
        setError(msg);
        throw e;
      } finally {
        setEnrichingIds((prev) => {
          const next = new Set(prev);
          next.delete(placeId);
          return next;
        });
      }
    },
    [onPlaceUpdated]
  );

  const enrichMany = useCallback(
    async (
      places: Array<Pick<FavoritePlace, "id">>,
      force = false,
      onProgress?: (done: number, total: number) => void
    ): Promise<void> => {
      const total = places.length;
      if (total === 0) return;
      setBatchProgress({ total, done: 0, success: 0, failed: 0 });
      setError(null);
      let done = 0;
      let success = 0;
      let failed = 0;
      // 串行执行，避免并发触发高德 API QPS 限制
      for (const p of places) {
        try {
          await enrichOne(p.id, force);
          success += 1;
        } catch {
          failed += 1;
        }
        done += 1;
        setBatchProgress({ total, done, success, failed });
        onProgress?.(done, total);
        // 单条之间短暂停顿，给 API 一点喘息空间
        if (done < total) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      // 完成后清空进度（保留 1.5s 让 UI 显示最终状态）
      setTimeout(() => setBatchProgress(null), 1500);
    },
    [enrichOne]
  );

  return {
    enrichingIds,
    batchProgress,
    enrichOne,
    enrichMany,
    error,
  };
}
