import Link from "next/link";
import { ChevronLeft, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { MealRouletteClient } from "@/components/meal-roulette/MealRouletteClient";
import { getServerGroups } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export const metadata = { title: "今天吃什么" };

export default async function MealRoulettePage() {
  const { groups } = await getServerGroups();

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href="/" aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            今天吃什么
          </h1>
        </div>
      </header>

      <div className="p-4">
        {groups.length === 0 ? (
          <EmptyState
            title="请先加入或创建团体"
            description="「今天吃什么」是团体共享的转盘候选池，需要先有一个团体"
          />
        ) : (
          <MealRouletteClient groups={groups} defaultGroupId={groups[0].id} />
        )}
      </div>
    </div>
  );
}
