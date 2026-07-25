"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Profile } from "@/types";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  profile?: Pick<Profile, "nickname" | "avatar_url"> | null;
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

/** 带文字 fallback 的用户头像 */
export function UserAvatar({
  profile,
  src,
  name,
  size = 40,
  className,
}: UserAvatarProps) {
  const finalSrc = src ?? profile?.avatar_url ?? null;
  const finalName = name ?? profile?.nickname ?? "用户";
  const initials = finalName.slice(0, 1).toUpperCase();

  return (
    <Avatar
      className={cn(className)}
      style={{ width: size, height: size }}
    >
      {finalSrc ? <AvatarImage src={finalSrc} alt={finalName} /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
