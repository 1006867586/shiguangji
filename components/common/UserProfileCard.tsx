"use client";

// ============================================================
// UserProfileCard — 点击 @昵称 弹出的用户资料卡片
// 展示头像（含头像框）+ 昵称 + 成就徽章 + 佩戴装扮徽章。
// ============================================================

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/common/UserAvatar";
import { NameBadges } from "@/components/profile/NameBadges";
import type { MentionUser } from "@/types";

interface UserProfileCardProps {
  /** 要展示的用户；null 时卡片关闭 */
  user: MentionUser | null;
  onClose: () => void;
}

export function UserProfileCard({ user, onClose }: UserProfileCardProps) {
  return (
    <Dialog
      open={Boolean(user)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-xs gap-5 pt-10">
        <DialogHeader className="sr-only">
          <DialogTitle>{user?.nickname ?? "用户资料"}</DialogTitle>
        </DialogHeader>
        {user ? (
          <div className="flex flex-col items-center gap-3">
            <UserAvatar
              profile={user}
              size={72}
              frameColor={user.frameColor ?? null}
            />
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-lg font-semibold text-foreground">
                {user.nickname}
              </span>
              <NameBadges achievements={user.achievements ?? []} />
            </div>
            {user.wornBadges && user.wornBadges.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {user.wornBadges.map((b) => (
                  <Badge
                    key={b.id}
                    variant="secondary"
                    className="gap-1 px-2 py-0.5 text-xs"
                    style={
                      b.color
                        ? {
                            backgroundColor: `${b.color}26`,
                            color: b.color,
                            borderColor: `${b.color}33`,
                          }
                        : undefined
                    }
                  >
                    {b.icon ? <span aria-hidden="true">{b.icon}</span> : null}
                    {b.name}
                  </Badge>
                ))}
              </div>
            ) : null}
            {user.achievements &&
            user.achievements.some((a) => a.unlocked) ? (
              <p className="text-xs text-muted-foreground">
                {user.achievements.filter((a) => a.unlocked).length} 个成就已解锁
              </p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
