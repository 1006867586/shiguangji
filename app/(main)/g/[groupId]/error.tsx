"use client";

import { useEffect } from "react";
import { UtensilsCrossed, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 pt-safe-t pb-20 text-center">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-1 ring-primary/20"
        aria-hidden="true"
      >
        <UtensilsCrossed className="h-8 w-8" strokeWidth={2.2} />
      </div>
      <h2 className="font-display text-lg font-semibold tracking-tight">出错了</h2>
      <p className="text-sm text-muted-foreground">
        {error.message || "发生未知错误，请稍后重试"}
      </p>
      {error.digest ? (
        <p className="text-[11px] text-muted-foreground/70">
          错误码：{error.digest}
        </p>
      ) : null}
      <Button onClick={reset} size="sm" className="shadow-sm touch-manipulation active:scale-[0.97]">
        <RotateCcw className="h-4 w-4" />
        重试
      </Button>
    </div>
  );
}
