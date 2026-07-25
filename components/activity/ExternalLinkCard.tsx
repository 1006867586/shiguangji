import Image from "next/image";
import Link from "next/link";
import { MapPin, Star, ExternalLink, Utensils, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ExternalLink as ExternalLinkType } from "@/types";

interface ExternalLinkCardProps {
  link: ExternalLinkType;
  compact?: boolean;
  /** 内部跳转路径：若提供则使用 Next.js Link 跳转该路径（如动态页点击进入详情页），否则按外部链接在新标签打开 */
  internalHref?: string;
}

const PLATFORM_LABEL: Record<string, string> = {
  dianping: "大众点评",
  meituan: "美团",
  other: "外部链接",
};

/** 美团/点评链接卡片：封面图、标题、评分、地址 */
export function ExternalLinkCard({ link, compact = false, internalHref }: ExternalLinkCardProps) {
  if (!link || (!link.title && !link.url)) return null;

  const cardClassName =
    "group flex items-stretch gap-3 overflow-hidden rounded-lg border border-border bg-muted/40 p-2 transition-colors hover:bg-muted";

  const inner = (
    <>
      <div
        className={`relative shrink-0 overflow-hidden rounded-md bg-muted ${
          compact ? "h-14 w-14" : "h-20 w-20"
        }`}
      >
        {link.coverImage ? (
          <Image
            src={link.coverImage}
            alt={link.title || ""}
            fill
            sizes="80px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Utensils className="h-6 w-6" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
            {PLATFORM_LABEL[link.platform] ?? "链接"}
          </Badge>
          {link.rating ? (
            <span className="flex items-center gap-0.5 text-xs font-medium text-orange-500">
              <Star className="h-3 w-3 fill-current" />
              {link.rating.toFixed(1)}
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm font-medium text-foreground">
          {link.title || link.url}
        </p>
        {link.address ? (
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{link.address}</span>
          </p>
        ) : null}
        {link.phone ? (
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate">{link.phone}</span>
          </p>
        ) : null}
        {link.price ? (
          <p className="text-xs text-muted-foreground">{link.price}</p>
        ) : null}
      </div>

      <ExternalLink className="h-4 w-4 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </>
  );

  // 动态页：点击卡片进入活动详情页（内部跳转）
  if (internalHref) {
    return (
      <Link href={internalHref} className={cardClassName} aria-label="查看活动详情">
        {inner}
      </Link>
    );
  }

  // 详情页：点击卡片在新标签打开外部链接
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cardClassName}
    >
      {inner}
    </a>
  );
}

/** 紧凑版（用于转发引用） */
export function ExternalLinkCardCompact({ link }: { link: ExternalLinkType }) {
  return <ExternalLinkCard link={link} compact />;
}

/** 仅展示平台标识（用于纯文字 fallback） */
export function LinkPlatformBadge({ link }: { link: ExternalLinkType }) {
  return (
    <Link
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
    >
      <ExternalLink className="h-3 w-3" />
      {PLATFORM_LABEL[link.platform] ?? "查看链接"}
    </Link>
  );
}
