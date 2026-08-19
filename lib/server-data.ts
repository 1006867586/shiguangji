import { createServerClient, getCurrentUser } from "./supabase/server";
import type { Group, GamificationResponse, UserGamification, Achievement } from "@/types";

/** 获取当前用户加入的圈子（服务端） */
export async function getServerGroups(): Promise<
  { groups: Group[]; userId: string | null }
> {
  const user = await getCurrentUser();
  if (!user) return { groups: [], userId: null };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("group_members")
    .select("role, group:groups!inner(*)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  if (error) {
    console.error("获取用户圈子失败:", error.message);
    return { groups: [], userId: user.id };
  }

  const groups = (data ?? []).map((m) => {
    const g = m.group as unknown as Group;
    return { ...g, role: m.role };
  });

  return { groups, userId: user.id };
}

/** 获取当前用户资料（服务端） */
export async function getServerProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url, created_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("获取用户资料失败:", error.message);
    return null;
  }
  return data;
}

/** 获取当前用户的积分 / 成就 / 打卡数据（服务端，幂等重算） */
export async function getServerGamification(): Promise<GamificationResponse> {
  const user = await getCurrentUser();
  if (!user) return { gamification: null, achievements: [] };
  const supabase = await createServerClient();

  // 重算（触发式：会补算积分/连续打卡/成就并推送解锁通知）
  const { error: reErr } = await supabase.rpc("recalc_gamification", {
    p_user_id: user.id,
  });
  if (reErr) console.error("recalc_gamification 失败:", reErr.message);

  const { data: g } = await supabase
    .from("user_gamification")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: achs } = await supabase
    .from("achievements")
    .select("id, key, name, description, icon, rule_type, threshold, sort_order")
    .order("sort_order");

  const { data: ua } = await supabase
    .from("user_achievements")
    .select("achievement_id, unlocked_at")
    .eq("user_id", user.id);

  const unlockedMap = new Map<string, string | null>(
    (ua ?? []).map((x) => [x.achievement_id as string, x.unlocked_at as string | null])
  );

  const achievements: Achievement[] = (achs ?? []).map((a) => ({
    ...(a as unknown as Achievement),
    unlocked: unlockedMap.has(a.id as string),
    unlocked_at: unlockedMap.get(a.id as string) ?? null,
  }));

  return { gamification: (g as unknown as UserGamification) ?? null, achievements };
}
