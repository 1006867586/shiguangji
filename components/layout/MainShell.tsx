import type { ReactNode } from "react";
import { MainNav } from "@/components/layout/MainNav";
import { GroupSelector } from "@/components/group/GroupSelector";
import { APP_NAME } from "@/lib/constants";

interface MainShellProps {
  children: ReactNode;
  /** 顶部标题 */
  title?: string;
  /** 是否显示团体选择器 */
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
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-safe-t">
        <div className="flex h-14 items-center justify-between px-2">
          <div className="flex items-center gap-1">
            {showGroupSelector ? (
              <GroupSelector currentGroupId={currentGroupId} />
            ) : (
              <h1 className="px-2 text-lg font-semibold">
                {title ?? APP_NAME}
              </h1>
            )}
          </div>
          {rightAction}
        </div>
      </header>

      <main className="flex-1 pb-20">{children}</main>

      {showNav ? <MainNav /> : null}
    </div>
  );
}
