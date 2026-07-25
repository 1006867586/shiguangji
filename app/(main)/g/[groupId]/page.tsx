import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft, Plus, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  return { title: data?.name ?? "团体" };
}

export default async function GroupFeedPage({ params }: Params) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/g/${groupId}`)}`);
  }

  const supabase = await createServerClient();

  // 校验团体存在且用户是成员；与 getServerGroups 无依赖，并行执行
  const [membershipRes, { groups }] = await Promise.all([
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

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-safe-t">
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
            <Button asChild variant="ghost" size="icon" className="h-9 w-9">
              <Link href="/new" aria-label="发起聚餐">
                <Plus className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {group.description ? (
        <div className="border-b border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          {group.description}
        </div>
      ) : null}

      <FeedList groupId={groupId} currentUserId={user.id} />
    </>
  );
}
