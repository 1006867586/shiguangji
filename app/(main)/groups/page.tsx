import Link from "next/link";
import { ChevronLeft, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { getServerGroups } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const { groups } = await getServerGroups();

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href="/" aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-base font-semibold">我的团体</h1>
        </div>
        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
          <Link href="/groups/new" aria-label="创建团体">
            <Plus className="h-5 w-5" />
          </Link>
        </Button>
      </header>

      {groups.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="还没有加入任何团体"
          description="创建一个团体或通过邀请码加入"
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
        <div className="space-y-2 p-3">
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`/g/${g.id}`}
              className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base font-semibold">{g.name}</h3>
                    {g.role === "admin" ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        管理员
                      </span>
                    ) : null}
                  </div>
                  {g.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {g.description}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    邀请码 <span className="font-mono">{g.invite_code}</span>
                  </p>
                </div>
                <span className="text-muted-foreground">›</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
