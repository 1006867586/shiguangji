"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

interface UseAuthReturn {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

// 模块级单例:避免每次渲染都重建 Supabase client(createBrowserClient 内部会
// 重新读取 cookies + 注册 auth 监听,反复创建会浪费资源并可能引发监听泄漏)
let supabaseClient: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabaseClient) supabaseClient = createClient();
  return supabaseClient;
}

export function useAuth(): UseAuthReturn {
  const supabase = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, nickname, avatar_url, created_at")
        .eq("id", user.id)
        .maybeSingle();
      setProfile(
        p ?? {
          id: user.id,
          nickname: user.email?.split("@")[0] ?? "用户",
          avatar_url: null,
          created_at: null,
        }
      );
    } else {
      setProfile(null);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadProfile();

    // 仅在关键事件触发时重载 profile:
    //   SIGNED_IN / SIGNED_OUT / USER_UPDATED → 用户身份或资料可能变化,需重载
    //   TOKEN_REFRESHED → 仅 access_token 续期,身份未变,跳过避免无谓请求与闪烁
    //   INITIAL_SESSION → 首次加载,loadProfile() 已经覆盖
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED"
      ) {
        loadProfile();
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [loadProfile, supabase]);

  // signOut 不在此手动 set 状态,避免与 onAuthStateChange(SIGNED_OUT) 触发的
  // loadProfile 重复写入造成竞态/闪烁;让单一来源 onAuthStateChange 统一清理
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  return { user, profile, loading, refresh: loadProfile, signOut };
}
