"use client";

import { Loader2, Heart } from "lucide-react";
import { FeedCard } from "@/components/feed/FeedCard";
import { EmptyState } from "@/components/common/EmptyState";
import { useFavorites } from "@/hooks/useFavorites";

interface FavoritesListProps {
  currentUserId: string;
}

/**
 * FavoritesList — 客户端收藏列表。
 * 通过 useFavorites 拉取当前用户收藏的活动，使用 FeedCard 展示。
 */
export function FavoritesList({ currentUserId }: FavoritesListProps) {
  const { favorites, loading, error, reload } = useFavorites();

  if (loading) {
    return (
      <div className="flex justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<Heart className="h-10 w-10" />}
        title="加载失败"
        description={error}
      />
    );
  }

  if (favorites.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="h-10 w-10" />}
        title="还没有收藏任何动态"
        description="在动态详情页点击收藏，方便日后查看"
      />
    );
  }

  return (
    <div>
      {favorites.map((activity) => (
        <FeedCard
          key={activity.id}
          activity={activity}
          currentUserId={currentUserId}
          linkToDetail
          onDeleted={() => {
            // 删除后重新拉取，保持列表同步
            reload();
          }}
        />
      ))}
    </div>
  );
}
