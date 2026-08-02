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
  // http → https 升级：避免 HTTPS 页面加载 HTTP 图片触发 Mixed Content
  // QQ 头像等第三方 CDN 的 http URL 会被浏览器自动阻止
  const rawSrc = src ?? profile?.avatar_url ?? null;
  const finalSrc =
    rawSrc && rawSrc.startsWith("http://") ? rawSrc.replace("http://", "https://") : rawSrc;
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
