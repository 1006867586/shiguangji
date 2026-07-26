"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2, Search as SearchIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { FeedCard } from "@/components/feed/FeedCard";
import { useSearch } from "@/hooks/useSearch";
import { useAuthContext } from "@/lib/auth-context";

export function SearchResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get("groupId") ?? undefined;
  const { profile } = useAuthContext();
  const currentUserId = profile?.id;

  // 初始 query 来自 ?q=，便于从外部带关键词跳入
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { results, loading, loadingMore, error, hasMore, loadMore } = useSearch(
    query,
    { groupId }
  );

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  const handleLoadMore = async () => {
    try {
      await loadMore();
    } catch {
      // 错误已由 useSearch 的 error 暴露，这里吞掉防止 unhandled rejection
    }
  };

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <Link href="/" aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="relative flex-1">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索动态、地点、标签…"
              className="h-9 rounded-full pl-9 pr-8"
              enterKeyHint="search"
              autoComplete="off"
              aria-label="搜索"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="清空"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground touch-manipulation"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
        {groupId ? (
          <div className="flex items-center gap-1.5 px-3 pb-1.5 text-xs text-muted-foreground">
            <span>在当前团体内搜索</span>
            <button
              type="button"
              onClick={() => router.push("/search")}
              className="text-primary hover:underline"
            >
              全部
            </button>
          </div>
        ) : null}
      </header>

      {!hasQuery ? (
        <EmptyState
          icon={<SearchIcon className="h-10 w-10" />}
          title="搜索动态"
          description="输入关键词，查找动态、地点或标签内容"
        />
      ) : loading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-3 py-3">
              <div className="flex gap-3">
                <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2 py-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
              <Skeleton className="mt-3 h-16 w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="搜索失败"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={() => router.refresh()}>
              重试
            </Button>
          }
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<SearchIcon className="h-10 w-10" />}
          title="未找到相关动态"
          description={`没有与「${trimmed}」相关的动态`}
        />
      ) : (
        <div>
          {results.map((a) => (
            <FeedCard
              key={a.id}
              activity={a}
              currentUserId={currentUserId}
              linkToDetail
            />
          ))}

          {hasMore ? (
            <div className="p-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={loadingMore}
                onClick={handleLoadMore}
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "加载更多"
                )}
              </Button>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-muted-foreground">
              没有更多了
            </div>
          )}
        </div>
      )}
    </div>
  );
}
