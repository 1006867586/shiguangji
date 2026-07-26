import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { createServerClient, getCurrentUser } from "@/lib/supabase/server";
import { GroupSettingsForm } from "./GroupSettingsForm";
import type { Group } from "@/types";

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
  return { title: data?.name ? `${data.name} · 设置` : "团体设置" };
}

export default async function GroupSettingsPage({ params }: Params) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/g/${groupId}/settings`)}`);
  }

  const supabase = await createServerClient();

  // 校验团体存在且当前用户为成员，同时取得角色与完整团体信息
  const { data: membership } = await supabase
    .from("group_members")
    .select("role, group:groups!inner(*)")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    notFound();
  }

  const group = membership.group as unknown as Group;
  const isAdmin = membership.role === "admin";

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href={`/g/${groupId}`} aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-base font-semibold">团体设置</h1>
        </div>
      </header>

      {isAdmin ? (
        <GroupSettingsForm group={group} />
      ) : (
        <EmptyState
          title="仅管理员可访问"
          description="你不是该团体的管理员，无法修改团体设置"
          action={
            <Button asChild size="sm">
              <Link href={`/g/${groupId}`}>返回团体</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
