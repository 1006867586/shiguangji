import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 pt-safe-t pb-20 text-center">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg"
        aria-hidden="true"
      >
        <UtensilsCrossed className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold">飨刻</h1>
      <p className="text-sm text-muted-foreground">
        页面不存在或已被移除
      </p>
      <Button asChild className="touch-manipulation active:scale-[0.97]">
        <Link href="/">回到首页</Link>
      </Button>
    </div>
  );
}
