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
  Bookmark,
  Smile,
  Pin,
  Flag,
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/common/UserAvatar";
import { NameBadges } from "@/components/profile/NameBadges";
import { PhotoGrid } from "@/components/activity/PhotoGrid";
import {
  ExternalLinkCard,
  ExternalLinkCardCompact,
} from "@/components/activity/ExternalLinkCard";
import { CommentSection } from "./CommentSection";
import { ReactionPicker } from "./ReactionPicker";
import { ReactionBar } from "./ReactionBar";
import { RatingStars } from "@/components/activity/RatingStars";
import { TagEditor } from "@/components/activity/TagEditor";
import { RsvpControl } from "@/components/activity/RsvpControl";
import { SplitBill } from "@/components/activity/SplitBill";
import { EditActivityDialog } from "@/components/activity/EditActivityDialog";
import { RepostDialog } from "@/components/activity/RepostDialog";
import { ExternalShareSheet } from "@/components/activity/ExternalShareSheet";
import { useComments, toggleLike, deleteActivity } from "@/hooks/useActivity";
import { useIsFavorited } from "@/hooks/useFavorites";
import { useReactions } from "@/hooks/useReactions";
import { togglePin } from "@/hooks/usePin";
import { fetcher } from "@/lib/fetcher";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { Activity, ReactionEmoji, ReportReason } from "@/types";

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
  onReposted?: () => void;
  onUpdated?: (activity: Activity) => void;
  defaultExpandComments?: boolean;
  groupId?: string;
  /** 是否将活动正文与链接卡片点击跳转到详情页（动态页默认 true，详情页应传 false 以保留链接外部跳转） */
  linkToDetail?: boolean;
  /** 当前用户是否圈子管理员，用于显示置顶菜单项 */
  isAdmin?: boolean;
  /** 是否显示高级功能（RSVP / 分账 / 标签编辑），详情页传 true */
  showAdvanced?: boolean;
}

export function FeedCard({
  activity,
  currentUserId,
  onLiked,
  onDeleted,
  onReposted,
  onUpdated,
  defaultExpandComments = false,
  groupId,
  linkToDetail = true,
  isAdmin = false,
  showAdvanced = false,
}: FeedCardProps) {
  const [liked, setLiked] = useState(activity.is_liked);
  const [likeCount, setLikeCount] = useState(activity.like_count);
  /** 点赞粒子触发器：每次点赞 +1，0 表示无粒子 */
  const [burst, setBurst] = useState(0);
  /** 删除退出动画：true 时触发 card-exit，动画结束再调用 onDeleted */
  const [removing, setRemoving] = useState(false);
  const [showComments, setShowComments] = useState(defaultExpandComments);
  const [showEdit, setShowEdit] = useState(false);
  const [showRepost, setShowRepost] = useState(false);
  const [showExternalShare, setShowExternalShare] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [pinned, setPinned] = useState(activity.is_pinned ?? false);
  const [pinning, setPinning] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 收藏状态（乐观更新 + 失败回滚由 hook 内部处理）
  const { favorited, toggle: toggleFav } = useIsFavorited(
    activity.id,
    activity.is_favorited ?? false
  );
  // 反应状态（与 ReactionBar 共享同一 SWR 缓存）
  const { toggle: toggleReaction } = useReactions(activity.id);

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

  const handleReaction = async (emoji: ReactionEmoji) => {
    try {
      await toggleReaction(emoji);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const handleFavorite = async () => {
    try {
      await toggleFav();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const handleTogglePin = async () => {
    setPinning(true);
    const prev = pinned;
    setPinned(!prev); // 乐观更新
    try {
      const res = await togglePin(activity.id);
      setPinned(res.pinned);
      toast.success(res.pinned ? "已置顶" : "已取消置顶");
    } catch (e) {
      setPinned(prev); // 回滚
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setPinning(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("确定删除这条动态吗？删除后无法恢复。")) return;
    try {
      await deleteActivity(activity.id);
      toast.success("已删除");
      // 触发退出动画，动画结束再通知父组件移除
      setRemoving(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleRepost = () => {
    setShowRepost(true);
  };

  const handleExternalShare = () => {
    setShowExternalShare(true);
  };

  // 是否展示评分（仅当已有评分数据时）
  const hasRating =
    (activity.average_rating != null && activity.average_rating > 0) ||
    (activity.rating_count != null && activity.rating_count > 0);

  return (
    <article
      className={cn(
        "moment-card animate-slide-up-fade",
        removing && "animate-card-exit origin-center"
      )}
      onAnimationEnd={
        removing
          ? () => {
              onDeleted?.(activity.id);
            }
          : undefined
      }
    >
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
            <NameBadges achievements={activity.author.achievements ?? []} />
            {activity.type === "repost" ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat2 className="h-3 w-3" aria-hidden="true" />
                转发了
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground/80">
            {formatRelativeTime(activity.created_at)}
            {pinned ? (
              <Badge
                variant="secondary"
                className="gap-0.5 px-1.5 py-0 text-[10px]"
              >
                <Pin className="h-2.5 w-2.5" aria-hidden="true" />
                置顶
              </Badge>
            ) : null}
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
            <DropdownMenuItem onClick={handleExternalShare}>
              <Share2 className="h-4 w-4" /> 站外分享
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
            {isAdmin ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleTogglePin}
                  disabled={pinning}
                >
                  <Pin className="h-4 w-4" /> {pinned ? "取消置顶" : "置顶"}
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowReport(true)}
              className="text-destructive focus:text-destructive"
            >
              <Flag className="h-4 w-4" /> 举报
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 转发引用 */}
      {activity.repost_of ? (
        <div className="mt-3 rounded-xl border-l-2 border-primary/70 bg-muted/50 py-2.5 pl-3 pr-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Repeat2 className="h-3 w-3" aria-hidden="true" />
            <span className="font-medium text-foreground">
              @{activity.repost_of.author.nickname}
            </span>
            <NameBadges
              achievements={activity.repost_of.author.achievements ?? []}
            />
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

      {/* 标签编辑（仅详情页） */}
      {showAdvanced ? (
        <div className="mt-3">
          <TagEditor activityId={activity.id} initialTags={activity.tags} />
        </div>
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
        {/* 表情反应选择器 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowReactionPicker((v) => !v)}
            aria-label="选择表情反应"
            aria-expanded={showReactionPicker}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]",
              showReactionPicker && "text-primary"
            )}
          >
            <Smile className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">表情</span>
          </button>
          {showReactionPicker ? (
            <ReactionPicker
              onPick={handleReaction}
              onClose={() => setShowReactionPicker(false)}
            />
          ) : null}
        </div>
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
          onClick={handleRepost}
          aria-label="转发到圈子"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
        >
          <Repeat2 className="h-4 w-4" aria-hidden="true" />
          转发
        </button>
        {/* 右侧：收藏 + 照片数 */}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={handleFavorite}
            aria-pressed={favorited}
            aria-label={favorited ? "取消收藏" : "收藏"}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]",
              favorited && "text-primary"
            )}
          >
            <Bookmark
              className={cn("h-4 w-4", favorited && "fill-current")}
              aria-hidden="true"
            />
          </button>
          {activity.photo_count > 0 ? (
            <span
              className="flex items-center gap-1 rounded-full bg-muted/60 px-2 py-1 text-[11px] font-medium tabular-nums"
              aria-label={`共 ${activity.photo_count} 张照片`}
              title={`${activity.photo_count} 张照片`}
            >
              <Camera className="h-3 w-3" aria-hidden="true" />
              {activity.photo_count}
            </span>
          ) : null}
        </div>
      </div>

      {/* 反应展示条 */}
      <ReactionBar
        activityId={activity.id}
        initialSummary={activity.reactions}
      />

      {/* 评分（紧凑模式，仅当有评分时） */}
      {hasRating ? (
        <div className="mt-2">
          <RatingStars
            activityId={activity.id}
            compact
            initialAverage={activity.average_rating ?? undefined}
            initialCount={activity.rating_count}
            initialMyScore={activity.my_rating ?? null}
          />
        </div>
      ) : null}

      {/* 高级功能：RSVP / 分账（仅详情页） */}
      {showAdvanced ? (
        <div className="mt-3 space-y-3">
          <RsvpControl activityId={activity.id} />
          {groupId ? (
            <SplitBill
              activityId={activity.id}
              groupId={groupId}
              currentUserId={currentUserId}
            />
          ) : null}
        </div>
      ) : null}

      {/* 评论区：条件挂载 + 淡入（评论按需懒加载，见 useComments） */}
      {showComments ? (
        <div className="animate-fade-in">
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
        </div>
      ) : null}

      {/* 编辑弹窗 */}
      <EditActivityDialog
        activity={activity}
        open={showEdit}
        onOpenChange={setShowEdit}
        onUpdated={handleUpdated}
      />

      {/* 转发弹窗（站内转发到其他圈子） */}
      <RepostDialog
        activity={activity}
        open={showRepost}
        onOpenChange={setShowRepost}
        onReposted={onReposted}
      />

      {/* 站外分享 */}
      <ExternalShareSheet
        activity={activity}
        open={showExternalShare}
        onOpenChange={setShowExternalShare}
      />

      {/* 举报弹窗 */}
      <ReportDialog
        open={showReport}
        onOpenChange={setShowReport}
        activityId={activity.id}
        groupId={activity.group_id}
      />
    </article>
  );
}

/** 举报原因选项 */
const REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "垃圾信息" },
  { value: "abuse", label: "辱骂攻击" },
  { value: "porn", label: "色情低俗" },
  { value: "illegal", label: "违法违规" },
  { value: "other", label: "其他" },
];

/** 举报内容弹窗 */
function ReportDialog({
  open,
  onOpenChange,
  activityId,
  groupId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activityId: string;
  groupId: string;
}) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await fetcher("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          targetType: "activity",
          targetId: activityId,
          groupId,
          reason,
          detail: detail.trim() || undefined,
        }),
      });
      toast.success("举报已提交，我们会尽快处理");
      setDetail("");
      setReason("spam");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>举报内容</DialogTitle>
          <DialogDescription>
            选择举报原因，我们会尽快审核处理。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            {REASON_OPTIONS.map((r) => (
              <Button
                key={r.value}
                type="button"
                variant={reason === r.value ? "default" : "outline"}
                size="sm"
                className="h-8"
                onClick={() => setReason(r.value)}
                disabled={submitting}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <Textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="补充说明（可选）"
            maxLength={500}
            rows={3}
            disabled={submitting}
          />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button onClick={submit} disabled={submitting}>
            提交举报
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
