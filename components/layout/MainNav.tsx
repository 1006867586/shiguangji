"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Plus, User, Users, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "动态", icon: Home },
  { href: "/meal-roulette", label: "吃什么", icon: UtensilsCrossed },
  { href: "/new", label: "发起", icon: Plus, center: true },
  { href: "/groups", label: "团体", icon: Users },
  { href: "/profile", label: "我", icon: User },
];

export function MainNav() {
  const pathname = usePathname();
  // 滚动方向感知：下滑隐藏、上滑显示，顶部始终显示
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const threshold = 8; // 小幅抖动忽略
    const topBuffer = 80; // 顶部 80px 内不隐藏

    const update = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      if (y < topBuffer) {
        setHidden(false);
      } else if (Math.abs(delta) > threshold) {
        setHidden(delta > 0); // 下滑隐藏，上滑显示
        lastY = y;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 路由切换时重置为显示
  useEffect(() => {
    setHidden(false);
  }, [pathname]);

  return (
    <nav
      aria-label="主导航"
      aria-hidden={hidden}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 pb-safe transition-transform duration-300 ease-out motion-reduce:transition-none",
        hidden ? "translate-y-full" : "translate-y-0"
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
              tabIndex={hidden ? -1 : undefined}
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
