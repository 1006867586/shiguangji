"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Plus, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "动态", icon: Home },
  { href: "/new", label: "发起", icon: Plus },
  { href: "/groups", label: "团体", icon: Users },
  { href: "/profile", label: "我", icon: User },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-safe"
    >
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname?.startsWith(item.href);
          const Icon = item.icon;
          const isCenter = item.href === "/new";
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-md",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
                isCenter && "relative"
              )}
            >
              {isCenter ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-95">
                  <Icon className="h-5 w-5" />
                </span>
              ) : (
                <Icon
                  className={cn("h-5 w-5", active && "fill-current")}
                  aria-hidden="true"
                />
              )}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
