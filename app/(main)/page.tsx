import Link from "next/link";
import { Home, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupSelector } from "@/components/group/GroupSelector";
import { FeedList } from "@/components/feed/FeedList";
import { EmptyState } from "@/components/common/EmptyState";
import { getServerGroups } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export const metadata = { title: "动态" };

export default async function HomePage() {
  const { groups, userId } = await getServerGroups();

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {groups.length > 0 ? (
          <GroupSelector currentGroupId={groups[0].id} />
        ) : (
          <h1 className="px-2 text-lg font-semibold">飨刻</h1>
        )}
        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
          <Link href="/new" aria-label="发起聚餐">
            <Plus className="h-5 w-5" />
          </Link>
        </Button>
      </header>

      {groups.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="还没有加入任何团体"
          description="创建一个团体，邀请朋友一起记录聚餐时光"
          action={
            <div className="flex gap-2">
              <Button asChild size="sm">
                <Link href="/groups/new">创建团体</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/join">加入团体</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <FeedList groupId={groups[0].id} currentUserId={userId ?? undefined} />
      )}
    </>
  );
}
