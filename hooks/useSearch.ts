"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { Activity } from "@/types";

interface UseSearchOptions {
  groupId?: string;
  tag?: string;
  limit?: number;
  /** 防抖延时（毫秒），默认 300 */
  debounceMs?: number;
}

interface SearchResponse {
  data: Activity[];
  next_cursor: string | null;
}

interface UseSearchReturn {
  results: Activity[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

/** 构造搜索请求的 query string */
function buildQueryString(opts: {
  q: string;
  groupId?: string;
  tag?: string;
  limit: number;
  cursor?: string;
}): string {
  const params = new URLSearchParams();
  params.set("q", opts.q);
  if (opts.groupId) params.set("groupId", opts.groupId);
  if (opts.tag) params.set("tag", opts.tag);
  params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  return params.toString();
}

/**
 * useSearch — SWR 防抖搜索
 * - 通过 setTimeout 对 query 做防抖，避免每次击键触发请求
 * - 返回首屏结果 + loadMore 分页（基于 created_at 游标）
 */
export function useSearch(
  query: string,
  opts: UseSearchOptions = {}
): UseSearchReturn {
  const { groupId, tag, limit = DEFAULT_PAGE_SIZE, debounceMs = 300 } = opts;

  // 防抖：每次 query 变化后等待 debounceMs 再更新 debouncedQuery
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(t);
  }, [query, debounceMs]);

  const trimmedQuery = debouncedQuery.trim();
  const shouldSearch = trimmedQuery.length > 0;

  // SWR key：query 为空时不发请求
  const swrKey = shouldSearch
    ? `/api/search?${buildQueryString({
        q: trimmedQuery,
        groupId,
        tag,
        limit,
      })}`
    : null;

  const { data, error, isLoading, mutate } = useSWR<SearchResponse>(
    swrKey,
    (url: string) => fetcher<SearchResponse>(url),
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  // 分页追加项
  const [appended, setAppended] = useState<Activity[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<string | null>(data?.next_cursor ?? null);

  // 首屏 / 查询条件变化时重置分页
  useEffect(() => {
    cursorRef.current = data?.next_cursor ?? null;
    setAppended([]);
  }, [data?.next_cursor, trimmedQuery, groupId, tag, limit]);

  const results = useMemo<Activity[]>(
    () => [...(data?.data ?? []), ...appended],
    [data, appended]
  );

  const hasMore = Boolean(cursorRef.current);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor || loadingMore || !shouldSearch) return;
    setLoadingMore(true);
    try {
      const res = await fetcher<SearchResponse>(
        `/api/search?${buildQueryString({
          q: trimmedQuery,
          groupId,
          tag,
          limit,
          cursor,
        })}`
      );
      setAppended((prev) => [...prev, ...res.data]);
      cursorRef.current = res.next_cursor;
    } catch (e) {
      setLoadingMore(false);
      throw e;
    }
    setLoadingMore(false);
  }, [trimmedQuery, groupId, tag, limit, loadingMore, shouldSearch]);

  return {
    results,
    loading: isLoading,
    loadingMore,
    error: error
      ? error instanceof Error
        ? error.message
        : "搜索失败"
      : null,
    hasMore,
    loadMore,
    refresh,
  };
}
