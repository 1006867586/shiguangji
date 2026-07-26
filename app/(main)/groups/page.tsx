import Link from "next/link";
import { ChevronLeft, Plus, Users, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/common/EmptyState";
import { getServerGroups } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export const metadata = { title: "我的团体" };

export default async function GroupsPage() {
  const { groups } = await getServerGroups();

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center justify-between px-1">
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="h-9 w-9">
              <Link href="/" aria-label="返回">
                <ChevronLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="font-display text-lg font-semibold tracking-tight">我的团体</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-primary/10 hover:text-primary">
                <Plus className="h-5 w-5" strokeWidth={2.2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/groups/new">
                  <Plus className="h-4 w-4" /> 创建团体
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/join">
                  <LogIn className="h-4 w-4" /> 加入团体
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {groups.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="还没有加入任何团体"
          description="创建一个团体或通过邀请码加入"
          action={
            <div className="flex gap-2">
              <Button asChild size="sm" className="shadow-sm">
                <Link href="/groups/new">创建团体</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/join">加入团体</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-2.5 p-3">
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`/g/${g.id}`}
              className="block rounded-2xl border border-border/70 bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-md motion-reduce:transform-none"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-display text-base font-semibold tracking-tight">{g.name}</h3>
                    {g.role === "admin" ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        管理员
                      </span>
                    ) : null}
                  </div>
                  {g.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {g.description}
                    </p>
                  ) : null}
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>邀请码</span>
                    <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono tracking-[0.2em] text-foreground">
                      {g.invite_code}
                    </span>
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
