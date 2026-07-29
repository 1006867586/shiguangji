import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createServerClient, getCurrentUser } from "@/lib/supabase/server";
import { MembersList } from "./MembersList";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ groupId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { groupId } = await params;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("groups")
    .select("name")
    .eq("id", groupId)
    .maybeSingle();
  return { title: data?.name ? `${data.name} · 成员管理` : "成员管理" };
}

export default async function GroupMembersPage({ params }: Params) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/g/${groupId}/members`)}`);
  }

  const supabase = await createServerClient();

  // 校验圈子存在且当前用户为成员，同时取得当前用户角色
  const { data: membership } = await supabase
    .from("group_members")
    .select("role, group:groups!inner(id, name)")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    notFound();
  }

  const group = membership.group as unknown as { id: string; name: string };
  const currentRole = membership.role as "admin" | "member";

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href={`/g/${groupId}`} aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="min-w-0 truncate text-base font-semibold">
            {group.name}
            <span className="text-muted-foreground"> · 成员管理</span>
          </h1>
        </div>
      </header>

      <MembersList
        groupId={groupId}
        currentUserId={user.id}
        currentRole={currentRole}
      />
    </div>
  );
}
