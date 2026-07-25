import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MainNav } from "@/components/layout/MainNav";
import { getCurrentUser } from "@/lib/supabase/server";

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

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-background">
      <main className="flex-1 pb-20">{children}</main>
      <MainNav />
    </div>
  );
}
