/** 餐饮动态卡片的骨架屏：用于 FeedList / 详情页加载态 */
export function FeedCardSkeleton() {
  return (
    <div className="moment-card" aria-hidden="true" aria-busy="true">
      {/* 头部 */}
      <div className="flex items-start gap-3">
        <div className="skeleton skeleton-circle h-11 w-11 shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton skeleton-text w-24" />
          <div className="skeleton skeleton-text w-16 opacity-70" />
        </div>
      </div>

      {/* 正文 */}
      <div className="mt-3 space-y-1.5">
        <div className="skeleton skeleton-text w-full" />
        <div className="skeleton skeleton-text w-5/6" />
        <div className="skeleton skeleton-text w-2/3" />
      </div>

      {/* 链接卡片占位 */}
      <div className="mt-3 flex gap-3 rounded-xl border border-border/70 bg-muted/40 p-2">
        <div className="skeleton h-20 w-20 shrink-0" />
        <div className="flex flex-1 flex-col justify-center gap-1.5">
          <div className="skeleton skeleton-text w-16 opacity-70" />
          <div className="skeleton skeleton-text w-full" />
          <div className="skeleton skeleton-text w-3/4" />
          <div className="skeleton skeleton-text w-1/2 opacity-70" />
        </div>
      </div>

      {/* 操作栏 */}
      <div className="mt-3.5 flex items-center gap-2 border-t border-border/40 pt-2.5">
        <div className="skeleton skeleton-text w-14" />
        <div className="skeleton skeleton-text w-14" />
        <div className="skeleton skeleton-text w-12" />
      </div>
    </div>
  );
}

/** 多张骨架卡列表 */
export function FeedCardSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <FeedCardSkeleton />
        </div>
      ))}
    </div>
  );
}
