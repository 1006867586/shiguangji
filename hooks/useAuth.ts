"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  const loadProfile = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;

    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    setUser(u);
    if (u) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, nickname, avatar_url, created_at")
        .eq("id", u.id)
        .maybeSingle();
      setProfile(
        p ?? {
          id: u.id,
          nickname: u.email?.split("@")[0] ?? "用户",
          avatar_url: null,
          created_at: null,
        }
      );
    } else {
      setProfile(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // 每次 mount 创建全新 client,确保从当前 cookies 读取会话
    // (避免模块级单例在 QQ 登录跳转后持有过期内存状态)
    const supabase = createClient();
    supabaseRef.current = supabase;

    // 强制从 cookies 同步会话:getUser() 会检查并刷新存储的 session
    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      // 若内存中无会话但 cookies 有,尝试 refresh 从存储恢复
      if (!u) {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session) {
          // refresh 成功,supabase 内部已同步 session,重新取 user
          const { data: userData } = await supabase.auth.getUser();
          setUser(userData.user);
        } else {
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }
      }
      await loadProfile();
    });

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
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    await supabase.auth.signOut();
    // 硬跳转确保中间件能正确识别已登出状态(避免会话被中间件复活)
    window.location.href = "/login";
  }, []);

  return { user, profile, loading, refresh: loadProfile, signOut };
}
