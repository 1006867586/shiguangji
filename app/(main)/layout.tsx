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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        跳到主内容
      </a>
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-background">
        <main id="main-content" className="flex-1 pb-20 focus:outline-none">
          {children}
        </main>
        <MainNav />
      </div>
    </AuthProvider>
  );
}
