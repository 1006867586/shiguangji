"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/common/UserAvatar";
import { repostActivity } from "@/hooks/useActivity";
import { fetchData } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import type { Activity, Group } from "@/types";

interface ShareDialogProps {
  activity: Activity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShared?: () => void;
}

export function ShareDialog({
  activity,
  open,
  onOpenChange,
  onShared,
}: ShareDialogProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetId, setTargetId] = useState<string>("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 打开时拉取用户已加入的团体，并排除原活动所在团体
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setTargetId("");
    setComment("");
    fetchData<Group[]>("/api/groups")
      .then((list) => {
        const filtered = list.filter((g) => g.id !== activity.group_id);
        setGroups(filtered);
        setTargetId(filtered[0]?.id ?? "");
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "获取团体列表失败");
        setGroups([]);
      })
      .finally(() => setLoading(false));
  }, [open, activity.group_id]);

  const handleShare = async () => {
    if (!targetId) {
      toast.error("请选择要分享到的团体");
      return;
    }
    setSubmitting(true);
    try {
      await repostActivity(activity.id, {
        groupId: targetId,
        comment: comment.trim() || undefined,
      });
      const target = groups.find((g) => g.id === targetId);
      toast.success(`已分享到「${target?.name ?? "团体"}」`);
      onShared?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分享失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" /> 分享到团体
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 原活动预览 */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserAvatar profile={activity.author} size={20} />
              <span>@{activity.author.nickname}</span>
            </div>
            {activity.content ? (
              <p className="mt-1.5 line-clamp-2 text-sm text-foreground">
                {activity.content}
              </p>
            ) : null}
          </div>

          {/* 目标团体选择 */}
          <div className="space-y-1.5">
            <Label htmlFor="share-target">分享到</Label>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : groups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                <Users className="mx-auto mb-2 h-6 w-6" />
                你还没有其他可分享的团体
                <p className="mt-1 text-xs">
                  请先加入或创建另一个团体
                </p>
              </div>
            ) : (
              <div className="space-y-1.5" id="share-target">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setTargetId(g.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                      targetId === g.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    {g.avatar_url ? (
                      <Image
                        src={g.avatar_url}
                        alt={g.name}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Users className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {g.name}
                      </div>
                      {g.description ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {g.description}
                        </div>
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "h-4 w-4 rounded-full border-2",
                        targetId === g.id
                          ? "border-primary bg-primary"
                          : "border-border"
                      )}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 附言 */}
          <div className="space-y-1.5">
            <Label htmlFor="share-comment">附言（可选）</Label>
            <Textarea
              id="share-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="说说你想分享的理由…"
              rows={3}
              maxLength={500}
            />
            <div className="text-right text-xs text-muted-foreground">
              {comment.length}/500
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            onClick={handleShare}
            disabled={submitting || loading || groups.length === 0}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            分享
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
