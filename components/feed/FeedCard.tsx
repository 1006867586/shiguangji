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
    <article className="moment-card animate-slide-up">
      {/* 头部 */}
      <div className="flex items-start gap-3">
        <Link href={`/profile`}>
          <UserAvatar profile={activity.author} size={44} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href="/profile"
              className="truncate text-sm font-semibold text-foreground hover:underline"
            >
              {activity.author.nickname}
            </Link>
            {activity.type === "repost" ? (
              <span className="text-xs text-muted-foreground">分享了</span>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatRelativeTime(activity.created_at)}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="h-4 w-4" /> 分享
            </DropdownMenuItem>
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
        <div className="mt-3 rounded-lg border-l-2 border-border bg-muted/30 py-2 pl-3 pr-2">
          <div className="text-xs text-muted-foreground">
            @{activity.repost_of.author.nickname}
          </div>
          {activity.repost_of.content ? (
            <p className="mt-0.5 line-clamp-3 text-sm text-foreground">
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
            className="mt-2 block rounded-md text-foreground transition-colors hover:bg-muted/40"
          >
            <p className="whitespace-pre-wrap break-words px-1 py-0.5 text-[15px] leading-relaxed">
              {activity.content}
            </p>
          </Link>
        ) : (
          <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
            {activity.content}
          </p>
        )
      ) : null}

      {/* 外部链接卡片 */}
      {activity.external_link ? (
        <div className="mt-2">
          <ExternalLinkCard link={activity.external_link} internalHref={detailHref} />
        </div>
      ) : null}

      {/* 照片网格 */}
      {activity.photos.length > 0 ? (
        <PhotoGrid
          photos={activity.photos}
          className="mt-3"
          onPhotoClick={() => {
            // 点击照片默认跳转详情页查看大图
          }}
        />
      ) : null}

      {/* 操作栏 */}
      <div className="mt-3 flex items-center gap-1 text-muted-foreground">
        <button
          type="button"
          onClick={handleLike}
          disabled={pending}
          className={cn(
            "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted",
            liked && "text-orange-500"
          )}
        >
          <Heart
            className={cn("h-4 w-4", liked && "fill-current")}
          />
          {likeCount > 0 ? likeCount : "点赞"}
        </button>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted"
        >
          <MessageCircle className="h-4 w-4" />
          {activity.comment_count > 0 ? activity.comment_count : "评论"}
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted"
        >
          <Share2 className="h-4 w-4" />
          分享
        </button>
        <span className="ml-auto text-xs">
          {activity.photo_count > 0 ? `📷 ${activity.photo_count}` : ""}
        </span>
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
