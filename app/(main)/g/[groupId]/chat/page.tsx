import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createServerClient, getCurrentUser } from "@/lib/supabase/server";
import { GroupChat } from "@/components/chat/GroupChat";

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
  return { title: data?.name ? `${data.name} · 群聊` : "群聊" };
}

export default async function GroupChatPage({ params }: Params) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/g/${groupId}/chat`)}`);
  }

  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("group_members")
    .select("group:groups!inner(id, name)")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    notFound();
  }

  const group = membership.group as unknown as { id: string; name: string };

  return <GroupChat groupId={groupId} groupName={group.name} currentUserId={user.id} />;
}