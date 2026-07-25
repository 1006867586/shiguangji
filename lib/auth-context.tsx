"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: false,
  signOut: async () => {},
});

export function AuthProvider({
  user,
  profile,
  children,
}: {
  user: User | null;
  profile: Profile | null;
  children: ReactNode;
}) {
  // signOut 实现:用模块级 supabase client(惰性动态 import 避免打包膨胀)
  const signOut = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading: false, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}
