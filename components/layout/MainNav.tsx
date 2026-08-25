"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Plus, User, Users, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "动态", icon: Home },
  { href: "/meal-roulette", label: "吃什么", icon: UtensilsCrossed },
  { href: "/new", label: "发起", icon: Plus, center: true },
  { href: "/groups", label: "圈子", icon: Users },
  { href: "/profile", label: "我", icon: User },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主导航"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 pb-safe"
      )}
    >
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname?.startsWith(item.href);
          const Icon = item.icon;
          const isCenter = item.center;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-md",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
                isCenter && "relative"
              )}
            >
              {isCenter ? (
                <span className="absolute -top-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-90 hover:scale-105">
                  <Icon className="h-5 w-5" strokeWidth={2.4} />
                </span>
              ) : (
                <Icon
                  className={cn("h-5 w-5", active && "fill-primary/15")}
                  strokeWidth={active ? 2.4 : 2}
                  aria-hidden="true"
                />
              )}
              <span className={cn(isCenter && "mt-6")}>{item.label}</span>
              {active && !isCenter ? (
                <span
                  aria-hidden="true"
                  className="absolute top-1 h-1 w-1 rounded-full bg-primary"
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
