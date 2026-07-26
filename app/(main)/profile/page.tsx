import Link from "next/link";
import { ChevronLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { getServerProfile, getServerGroups } from "@/lib/server-data";
import type { Group } from "@/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "个人资料" };

export default async function ProfilePage() {
  const [profile, { groups }] = await Promise.all([
    getServerProfile(),
    getServerGroups(),
  ]);

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href="/" aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="font-display text-lg font-semibold tracking-tight">个人中心</h1>
        </div>
      </header>

      {profile ? <ProfileEditor profile={profile} /> : null}

      <div className="mt-2 border-t border-border/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
            <Users className="h-4 w-4 text-primary" />
            我的团体
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {groups.length}
            </span>
          </h2>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link href="/groups">全部</Link>
          </Button>
        </div>
        <div className="space-y-2">
          {groups.slice(0, 5).map((g: Group) => (
            <Link
              key={g.id}
              href={`/g/${g.id}`}
              className="flex items-center justify-between rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-md motion-reduce:transform-none"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{g.name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {g.role === "admin" ? "管理员" : "成员"}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>邀请码</span>
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono tracking-[0.2em] text-foreground">
                    {g.invite_code}
                  </span>
                </p>
              </div>
              <span className="text-muted-foreground">›</span>
            </Link>
          ))}
          {groups.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              还未加入任何团体
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
