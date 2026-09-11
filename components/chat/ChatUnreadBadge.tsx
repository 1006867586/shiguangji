"use client";

// ============================================================
// ChatUnreadBadge — 圈子页头部聊天按钮 + 未读红点
// 通过 useChatUnread 拉取服务端计数并订阅 Realtime 实时 +1
// ============================================================

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatUnread } from "@/hooks/useChatUnread";

interface ChatUnreadBadgeProps {
  groupId: string;
  currentUserId: string;
}

export function ChatUnreadBadge({
  groupId,
  currentUserId,
}: ChatUnreadBadgeProps) {
  const { unread } = useChatUnread(groupId, currentUserId);

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative h-9 w-9 rounded-full hover:bg-primary/10 hover:text-primary"
      aria-label={unread > 0 ? `群聊（${unread} 条未读）` : "群聊"}
    >
      <Link href={`/g/${groupId}/chat`}>
        <MessageCircle className="h-5 w-5" strokeWidth={2.2} />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
