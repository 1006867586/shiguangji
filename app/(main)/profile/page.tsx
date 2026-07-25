import Link from "next/link";
import { ChevronLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { getServerProfile, getServerGroups } from "@/lib/server-data";
import type { Group } from "@/types";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await getServerProfile();
  const { groups } = await getServerGroups();

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border bg-background/95 px-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
          <Link href="/" aria-label="返回">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-base font-semibold">个人中心</h1>
      </header>

      {profile ? <ProfileEditor profile={profile} /> : null}

      <div className="mt-2 border-t border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <Users className="h-4 w-4" />
            我的团体 ({groups.length})
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
              className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{g.name}</p>
                <p className="text-xs text-muted-foreground">
                  {g.role === "admin" ? "管理员" : "成员"} · 邀请码 {g.invite_code}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">›</span>
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
