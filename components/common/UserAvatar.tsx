import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Profile } from "@/types";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  profile?: Pick<Profile, "nickname" | "avatar_url"> | null;
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  /** 头像框环色（hex）：传入时在头像边缘绘制一圈装饰框 */
  frameColor?: string | null;
}

/** 带文字 fallback 的用户头像 ；（可选）支持头像框装饰 */
export function UserAvatar({
  profile,
  src,
  name,
  size = 40,
  className,
  frameColor,
}: UserAvatarProps) {
  // http → https 升级：避免 HTTPS 页面加载 HTTP 图片触发 Mixed Content
  // QQ 头像等第三方 CDN 的 http URL 会被浏览器自动阻止
  const rawSrc = src ?? profile?.avatar_url ?? null;
  const finalSrc =
    rawSrc && rawSrc.startsWith("http://") ? rawSrc.replace("http://", "https://") : rawSrc;
  const finalName = name ?? profile?.nickname ?? "用户";
  const initials = finalName.slice(0, 1).toUpperCase();
  const ringWidth = Math.max(2, Math.round(size * 0.05));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <Avatar
        className={cn("h-full w-full", className)}
        style={{ width: size, height: size }}
      >
        {finalSrc ? <AvatarImage src={finalSrc} alt={finalName} /> : null}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      {frameColor ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            boxShadow: `inset 0 0 0 ${ringWidth}px ${frameColor}, 0 0 0 1px rgba(0,0,0,0.06)`,
          }}
        />
      ) : null}
    </div>
  );
}
