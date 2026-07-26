import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-20 text-center animate-fade-in",
        className
      )}
    >
      {icon ? (
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/8 text-primary ring-1 ring-primary/10">
          <div className="scale-110">{icon}</div>
        </div>
      ) : null}
      <h2 className="font-display text-lg font-semibold text-foreground">
        {title}
      </h2>
      {description ? (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
