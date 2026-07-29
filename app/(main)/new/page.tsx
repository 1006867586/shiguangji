import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityForm } from "@/components/activity/ActivityForm";
import { EmptyState } from "@/components/common/EmptyState";
import { getServerGroups } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export const metadata = { title: "发布动态" };

export default async function NewActivityPage() {
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
          <h1 className="font-display text-lg font-semibold tracking-tight">发起聚餐</h1>
        </div>
      </header>

      <div className="p-4">
        {groups.length === 0 ? (
          <EmptyState
            title="请先加入或创建圈子"
            description="发起聚餐需要先有一个圈子"
          />
        ) : (
          <ActivityForm groups={groups} />
        )}
      </div>
    </div>
  );
}
