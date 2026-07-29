import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupSelector } from "@/components/group/GroupSelector";
import { GroupFeedLoader } from "@/components/feed/GroupFeedLoader";
import { EmptyState } from "@/components/common/EmptyState";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { getServerGroups } from "@/lib/server-data";
import { APP_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata = { title: "动态" };

export default async function HomePage() {
  const { groups, userId } = await getServerGroups();

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center justify-between px-2">
          {groups.length > 0 ? (
            <GroupSelector
              initialGroups={groups}
              storageKey="lastGroupId"
            />
          ) : (
            <div className="flex items-baseline gap-2 px-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {APP_NAME}
              </h1>
              <span className="editorial-dot" aria-hidden="true" />
              <span className="font-display text-[11px] italic text-muted-foreground">
                est. 2026
              </span>
            </div>
          )}
          <div className="flex items-center gap-0.5">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-primary/10 hover:text-primary"
            >
              <Link href="/search" aria-label="搜索">
                <Search className="h-5 w-5" strokeWidth={2.2} />
              </Link>
            </Button>
            <NotificationBell />
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-primary/10 hover:text-primary"
            >
              <Link href="/new" aria-label="发起聚餐">
                <Plus className="h-5 w-5" strokeWidth={2.2} />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {groups.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="还没有加入任何圈子"
          description="创建一个圈子，邀请朋友一起记录聚餐时光"
          action={
            <div className="flex gap-2">
              <Button asChild size="sm">
                <Link href="/groups/new">创建圈子</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/join">加入圈子</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="px-3 pt-3">
          <GroupFeedLoader groups={groups} userId={userId ?? undefined} />
        </div>
      )}
    </>
  );
}
