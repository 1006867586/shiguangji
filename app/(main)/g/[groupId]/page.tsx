import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  ChevronLeft,
  Plus,
  Settings as SettingsIcon,
  BarChart3,
  Users as UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GroupSelector } from "@/components/group/GroupSelector";
import { FeedList } from "@/components/feed/FeedList";
import { InviteCodeButton } from "@/components/group/InviteCodeButton";
import { createServerClient, getCurrentUser } from "@/lib/supabase/server";
import { getServerGroups } from "@/lib/server-data";
import type { Group } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ groupId: string }> };

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { groupId } = await params;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("groups")
    .select("name")
    .eq("id", groupId)
    .maybeSingle();
  return { title: data?.name ?? "圈子" };
}

export default async function GroupFeedPage({ params }: Params) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/g/${groupId}`)}`);
  }

  const supabase = await createServerClient();

  // 校验圈子存在且用户是成员；与 getServerGroups 无依赖，并行执行（groups 供 GroupSelector 使用，此处不直接消费）
  const [membershipRes] = await Promise.all([
    supabase
      .from("group_members")
      .select("role, group:groups!inner(*)")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle(),
    getServerGroups(),
  ]);

  const membership = membershipRes.data;
  if (!membership) {
    notFound();
  }

  const group = membership.group as unknown as Group;
  const isAdmin = membership.role === "admin";

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center justify-between px-1">
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="h-9 w-9">
              <Link href="/" aria-label="返回">
                <ChevronLeft className="h-5 w-5" />
              </Link>
            </Button>
            <GroupSelector currentGroupId={groupId} />
          </div>
          <div className="flex items-center gap-1">
            <InviteCodeButton code={group.invite_code} />
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label="圈子管理"
                >
                  <SettingsIcon className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/g/${groupId}/stats`}>
                    <BarChart3 className="h-4 w-4" /> 圈子统计
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/g/${groupId}/members`}>
                    <UsersIcon className="h-4 w-4" /> 成员管理
                  </Link>
                </DropdownMenuItem>
                {isAdmin ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/g/${groupId}/settings`}>
                      <SettingsIcon className="h-4 w-4" /> 圈子设置
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {isAdmin ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/g/${groupId}/reports`}>
                      <SettingsIcon className="h-4 w-4" /> 举报管理
                    </Link>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {group.description ? (
        <div className="border-b border-border/60 bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground break-words whitespace-pre-wrap">
          {group.description}
        </div>
      ) : null}

      <div className="px-3 pt-3">
        <FeedList groupId={groupId} currentUserId={user.id} />
      </div>
    </>
  );
}
