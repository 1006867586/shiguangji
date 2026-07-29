import type { ReactNode } from "react";
import { MainNav } from "@/components/layout/MainNav";
import { GroupSelector } from "@/components/group/GroupSelector";
import { APP_NAME, APP_NAME_EN } from "@/lib/constants";

interface MainShellProps {
  children: ReactNode;
  /** 顶部标题 */
  title?: string;
  /** 是否显示圈子选择器 */
  showGroupSelector?: boolean;
  currentGroupId?: string;
  /** 右上角操作 */
  rightAction?: ReactNode;
  /** 是否显示底部导航 */
  showNav?: boolean;
}

export function MainShell({
  children,
  title,
  showGroupSelector = false,
  currentGroupId,
  rightAction,
  showNav = true,
}: MainShellProps) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        跳到主内容
      </a>
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center justify-between px-2">
        <div className="flex items-center gap-1">
          {showGroupSelector ? (
            <GroupSelector currentGroupId={currentGroupId} />
          ) : title ? (
            <h1 className="px-2 text-base font-semibold tracking-tight">
              {title}
            </h1>
          ) : (
            <div className="flex items-baseline gap-2 px-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {APP_NAME}
              </h1>
              <span className="editorial-dot" aria-hidden="true" />
              <span className="font-display text-[11px] italic text-muted-foreground">
                {APP_NAME_EN}
              </span>
            </div>
          )}
        </div>
        {rightAction}
        </div>
      </header>

      <main id="main-content" className="flex-1 pb-20 focus:outline-none">
        {children}
      </main>

      {showNav ? <MainNav /> : null}
    </div>
  );
}
