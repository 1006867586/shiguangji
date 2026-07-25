import { createServerClient, getCurrentUser } from "./supabase/server";
import type { Group } from "@/types";

/** 获取当前用户加入的团体（服务端） */
export async function getServerGroups(): Promise<
  { groups: Group[]; userId: string | null }
> {
  const user = await getCurrentUser();
  if (!user) return { groups: [], userId: null };

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("group_members")
    .select("role, group:groups!inner(*)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const groups = (data ?? []).map((m) => {
    const g = m.group as unknown as Group;
    return { ...g, role: m.role };
  });

  return { groups, userId: user.id };
}

/** 获取当前用户资料（服务端） */
export async function getServerProfile() {
  const { userId } = await getServerGroups();
  if (!userId) return null;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url, created_at")
    .eq("id", userId)
    .maybeSingle();
  return data;
}
