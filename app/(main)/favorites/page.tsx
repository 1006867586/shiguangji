import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/supabase/server";
import { FavoritesList } from "./FavoritesList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "我的收藏" };

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent("/favorites")}`);
  }

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href="/" aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-base font-semibold">我的收藏</h1>
        </div>
      </header>

      <FavoritesList currentUserId={user.id} />
    </div>
  );
}
