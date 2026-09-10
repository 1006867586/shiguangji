import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecorPanel } from "@/components/profile/DecorPanel";
import {
  getServerDecor,
  getServerProfile,
} from "@/lib/server-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "我的装扮" };

export default async function ProfileDecorPage() {
  const profile = await getServerProfile();
  if (!profile) {
    redirect("/login?redirect=%2Fprofile%2Fdecor");
  }

  const decor = await getServerDecor();
  if (!decor) {
    redirect("/login?redirect=%2Fprofile%2Fdecor");
  }

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href="/profile" aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            我的装扮
          </h1>
        </div>
      </header>

      <DecorPanel
        initialData={decor}
        profile={{
          nickname: profile.nickname,
          avatar_url: profile.avatar_url,
        }}
      />
    </div>
  );
}