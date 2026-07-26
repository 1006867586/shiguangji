"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useUnreadCount } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

interface NotificationBellProps {
  className?: string;
}

/** 通知铃铛：显示未读数 badge，点击进入通知中心 */
export function NotificationBell({ className }: NotificationBellProps) {
  const { count } = useUnreadCount();

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `通知（${count} 条未读）` : "通知"}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Bell className="h-5 w-5" />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
