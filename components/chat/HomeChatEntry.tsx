"use client";

// ============================================================
// HomeChatEntry — 首页动态页的群聊入口（跟随当前圈子）
// 首页为多圈子壳（GroupSelector 切换只发事件、URL 不变），
// 无法从 URL 得知当前圈子，故：
//   1) 初始读取 localStorage lastGroupId
//   2) 监听 group-change 事件随圈子切换实时更新
// 未读数复用 useChatUnread（SWR + Realtime 实时 +1）
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatUnread } from "@/hooks/useChatUnread";
import { STORAGE_KEYS } from "@/lib/constants";

interface HomeChatEntryProps {
  /** 当前用户 ID（用于排除本人消息计数） */
  userId?: string;
}

export function HomeChatEntry({ userId }: HomeChatEntryProps) {
  // 当前圈子 ID：初始读 localStorage，切换时由事件更新
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    const last = localStorage.getItem(STORAGE_KEYS.lastGroupId);
    if (last) setGroupId(last);

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ groupId: string }>).detail;
      if (detail?.groupId) setGroupId(detail.groupId);
    };
    window.addEventListener("group-change", handler);
    return () => window.removeEventListener("group-change", handler);
  }, []);

  const { unread } = useChatUnread(groupId, userId ?? "");
  const count = unread > 99 ? "99+" : `${unread}`;

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative h-9 w-9 rounded-full hover:bg-primary/10 hover:text-primary"
      aria-label={unread > 0 ? `群聊（${unread} 条未读）` : "群聊"}
    >
      <Link href={groupId ? `/g/${groupId}/chat` : "/groups/new"}>
        <MessageCircle className="h-5 w-5" strokeWidth={2.2} />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
          >
            {count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}