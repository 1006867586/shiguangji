"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-lg font-semibold">出错了</h2>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset} size="sm">
        <RotateCcw className="h-4 w-4" />
        重试
      </Button>
    </div>
  );
}
