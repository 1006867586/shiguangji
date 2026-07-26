"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Heart,
  MessageCircle,
  Repeat2,
  MoreHorizontal,
  Trash2,
  Pencil,
  Share2,
  Camera,
  ExternalLink as ExternalLinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/common/UserAvatar";
import { PhotoGrid } from "@/components/activity/PhotoGrid";
import {
  ExternalLinkCard,
  ExternalLinkCardCompact,
} from "@/components/activity/ExternalLinkCard";
import { CommentSection } from "./CommentSection";
import { EditActivityDialog } from "@/components/activity/EditActivityDialog";
import { ShareDialog } from "@/components/activity/ShareDialog";
import { useComments, toggleLike, deleteActivity } from "@/hooks/useActivity";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { Activity } from "@/types";

/** 点赞朱砂粒子：8 个方向飞出，距离略有变化更自然 */
const HEART_PARTICLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  const dist = 18 + (i % 2) * 6;
  return {
    x: Math.round(Math.cos(angle) * dist),
    y: Math.round(Math.sin(angle) * dist),
    delay: i * 18,
  };
});

interface FeedCardProps {
  activity: Activity;
  currentUserId?: string;
  onLiked?: (id: string, liked: boolean, count: number) => void;
  onDeleted?: (id: string) => void;
  onShared?: () => void;
  onUpdated?: (activity: Activity) => void;
  defaultExpandComments?: boolean;
  groupId?: string;
  /** 是否将活动正文与链接卡片点击跳转到详情页（动态页默认 true，详情页应传 false 以保留链接外部跳转） */
  linkToDetail?: boolean;
}

export function FeedCard({
  activity,
  currentUserId,
  onLiked,
  onDeleted,
  onShared,
  onUpdated,
  defaultExpandComments = false,
  groupId,
  linkToDetail = true,
}: FeedCardProps) {
  const [liked, setLiked] = useState(activity.is_liked);
  const [likeCount, setLikeCount] = useState(activity.like_count);
  /** 点赞粒子触发器：每次点赞 +1，0 表示无粒子 */
  const [burst, setBurst] = useState(0);
  const [showComments, setShowComments] = useState(defaultExpandComments);
  const [showEdit, setShowEdit] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleUpdated = (updated: Activity) => {
    onUpdated?.(updated);
    // 父组件若未处理，则强制刷新服务端数据
    if (!onUpdated) {
      router.refresh();
    }
  };

  const { comments, addComment, removeComment } = useComments(
    showComments ? activity.id : null
  );

  const isMine = activity.author.id === currentUserId;

  // 动态页：点击正文/链接卡片进入详情页；详情页：不跳转，链接卡片保持外部打开
  const detailHref = linkToDetail ? `/activity/${activity.id}` : undefined;

  const handleLike = () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    if (next) setBurst((b) => b + 1);
    onLiked?.(activity.id, next, likeCount + (next ? 1 : -1));
    startTransition(async () => {
      try {
        await toggleLike(activity.id);
      } catch (e) {
        // 回滚
        setLiked(!next);
        setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
        toast.error(e instanceof Error ? e.message : "操作失败");
      }
    });
  };

  const handleDelete = async () => {
    if (!confirm("确定删除这条动态吗？删除后无法恢复。")) return;
    try {
      await deleteActivity(activity.id);
      toast.success("已删除");
      onDeleted?.(activity.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleShare = () => {
    setShowShare(true);
  };

  return (
    <article className="moment-card animate-slide-up-fade">
      {/* 头部 */}
      <div className="flex items-start gap-3">
        <Link href={`/profile`} className="shrink-0">
          <UserAvatar profile={activity.author} size={44} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href="/profile"
              className="truncate text-[15px] font-semibold text-foreground hover:text-primary transition-colors"
            >
              {activity.author.nickname}
            </Link>
            {activity.type === "repost" ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat2 className="h-3 w-3" aria-hidden="true" />
                分享了
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground/80">
            {formatRelativeTime(activity.created_at)}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground/70 hover:text-foreground"
              aria-label="更多操作"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/activity/${activity.id}`}>
                <ExternalLinkIcon className="h-4 w-4" /> 查看详情
              </Link>
            </DropdownMenuItem>
            {isMine ? (
              <>
                <DropdownMenuSeparator />
                {activity.type === "original" ? (
                  <DropdownMenuItem onClick={() => setShowEdit(true)}>
                    <Pencil className="h-4 w-4" /> 编辑
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> 删除
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 分享引用 */}
      {activity.repost_of ? (
        <div className="mt-3 rounded-xl border-l-2 border-primary/70 bg-muted/50 py-2.5 pl-3 pr-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Repeat2 className="h-3 w-3" aria-hidden="true" />
            <span className="font-medium text-foreground">
              @{activity.repost_of.author.nickname}
            </span>
          </div>
          {activity.repost_of.content ? (
            <p className="mt-1 line-clamp-3 text-sm text-foreground/90">
              {activity.repost_of.content}
            </p>
          ) : null}
          {activity.repost_of.external_link ? (
            <div className="mt-2">
              <ExternalLinkCardCompact link={activity.repost_of.external_link} />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 文字内容 */}
      {activity.content ? (
        detailHref ? (
          <Link
            href={detailHref}
            className="mt-2.5 block rounded-lg text-foreground transition-colors hover:bg-muted/40"
          >
            <p className="whitespace-pre-wrap break-words px-1 py-0.5 text-[15px] leading-[1.7]">
              {activity.content}
            </p>
          </Link>
        ) : (
          <p className="mt-2.5 whitespace-pre-wrap break-words text-[15px] leading-[1.7] text-foreground">
            {activity.content}
          </p>
        )
      ) : null}

      {/* 外部链接卡片 */}
      {activity.external_link ? (
        <div className="mt-3">
          <ExternalLinkCard link={activity.external_link} internalHref={detailHref} />
        </div>
      ) : null}

      {/* 照片网格 */}
      {activity.photos.length > 0 ? (
        <PhotoGrid photos={activity.photos} className="mt-3" />
      ) : null}

      {/* 操作栏 */}
      <div className="mt-3.5 flex items-center gap-1 border-t border-border/40 pt-2.5 text-muted-foreground">
        <button
          type="button"
          onClick={handleLike}
          disabled={pending}
          aria-pressed={liked}
          aria-label={liked ? "取消点赞" : "点赞"}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]",
            liked && "text-primary"
          )}
        >
          <span className="relative inline-flex">
            <Heart
              className={cn(
                "h-4 w-4 transition-transform",
                liked && "scale-110 fill-current animate-heart-pop"
              )}
              aria-hidden="true"
            />
            {burst > 0 ? (
              <span
                key={burst}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
              >
                {HEART_PARTICLES.map((p, i) => (
                  <span
                    key={i}
                    className="heart-particle"
                    style={
                      {
                        "--burst-end": `translate(${p.x}px, ${p.y}px)`,
                        animationDelay: `${p.delay}ms`,
                      } as React.CSSProperties
                    }
                    onAnimationEnd={
                      i === 0 ? () => setBurst(0) : undefined
                    }
                  />
                ))}
              </span>
            ) : null}
          </span>
          {likeCount > 0 ? (
            <span className="tabular-nums">{likeCount}</span>
          ) : (
            "点赞"
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          aria-expanded={showComments}
          aria-label={`评论${activity.comment_count > 0 ? `，${activity.comment_count} 条` : ""}`}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]",
            showComments && "text-foreground bg-muted"
          )}
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          {activity.comment_count > 0 ? (
            <span className="tabular-nums">{activity.comment_count}</span>
          ) : (
            "评论"
          )}
        </button>
        <button
          type="button"
          onClick={handleShare}
          aria-label="分享"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          分享
        </button>
        {activity.photo_count > 0 ? (
          <span
            className="ml-auto flex items-center gap-1 rounded-full bg-muted/60 px-2 py-1 text-[11px] font-medium tabular-nums"
            aria-label={`共 ${activity.photo_count} 张照片`}
            title={`${activity.photo_count} 张照片`}
          >
            <Camera className="h-3 w-3" aria-hidden="true" />
            {activity.photo_count}
          </span>
        ) : null}
      </div>

      {/* 评论区 */}
      {showComments ? (
        <CommentSection
          activityId={activity.id}
          comments={comments}
          currentUserId={currentUserId}
          onAdd={async (content, parentId) => {
            await addComment({ content, parentId });
          }}
          onDelete={removeComment}
          inline
        />
      ) : null}

      {/* 编辑弹窗 */}
      <EditActivityDialog
        activity={activity}
        open={showEdit}
        onOpenChange={setShowEdit}
        onUpdated={handleUpdated}
      />

      {/* 分享弹窗 */}
      <ShareDialog
        activity={activity}
        open={showShare}
        onOpenChange={setShowShare}
        onShared={onShared}
      />
    </article>
  );
}
