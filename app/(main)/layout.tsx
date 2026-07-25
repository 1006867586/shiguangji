import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MainNav } from "@/components/layout/MainNav";
import { AuthProvider } from "@/lib/auth-context";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServerProfile } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export default async function MainLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // 服务端预取 profile,注入 AuthProvider 供客户端组件消费,避免 props drilling
  const profile = await getServerProfile();

  return (
    <AuthProvider user={user} profile={profile}>
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-background">
        <main className="flex-1 pb-20">{children}</main>
        <MainNav />
      </div>
    </AuthProvider>
  );
}
