"use client";

import { useState } from "react";
import { MessageSquare, Trash2, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/common/UserAvatar";
import { formatRelativeTime } from "@/lib/utils";
import type { Comment } from "@/types";

interface CommentSectionProps {
  activityId: string;
  comments: Comment[];
  currentUserId?: string;
  onAdd: (content: string, parentId?: string) => Promise<void>;
  onDelete?: (commentId: string) => Promise<void>;
  inline?: boolean;
  /** 是否默认展开输入框（详情页） */
  defaultShowInput?: boolean;
  /** 评论加载中（懒加载时避免误判空评论） */
  loading?: boolean;
}

export function CommentSection({
  activityId: _activityId,
  comments,
  currentUserId,
  onAdd,
  onDelete,
  inline = false,
  defaultShowInput = false,
  loading = false,
}: CommentSectionProps) {
  const [showInput, setShowInput] = useState(defaultShowInput);
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const text = content.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      await onAdd(text, replyTo?.id);
      setContent("");
      setReplyTo(null);
      if (!defaultShowInput) setShowInput(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={inline ? "" : "mt-3 rounded-lg bg-muted/40 p-3"}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          评论 {loading ? "" : comments.length > 0 ? `(${comments.length})` : ""}
        </div>
        {!defaultShowInput ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setShowInput((v) => !v)}
          >
            {showInput ? "取消" : "写评论"}
          </Button>
        ) : null}
      </div>

      <div className="space-y-3">
        {comments.map((c) => (
          <div key={c.id} className="space-y-2">
            <CommentItem
              comment={c}
              currentUserId={currentUserId}
              onReply={() => {
                setReplyTo(c);
                setShowInput(true);
              }}
              onDelete={() => onDelete?.(c.id)}
            />
            {c.replies && c.replies.length > 0 ? (
              <div className="ml-8 space-y-2 border-l border-border pl-3">
                {c.replies.map((r) => (
                  <CommentItem
                    key={r.id}
                    comment={r}
                    isReply
                    currentUserId={currentUserId}
                    onReply={() => {
                      setReplyTo(c);
                      setShowInput(true);
                    }}
                    onDelete={() => onDelete?.(r.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {comments.length === 0 && !showInput ? (
          <p className="py-2 text-center text-xs text-muted-foreground">
            {loading ? "加载评论中…" : "还没有评论，来抢沙发"}
          </p>
        ) : null}
      </div>

      {showInput ? (
        <div className="mt-3 space-y-2">
          {replyTo ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CornerDownRight className="h-3 w-3" aria-hidden="true" />
              回复 <span className="font-medium text-foreground">{replyTo.author?.nickname}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1 text-xs"
                onClick={() => setReplyTo(null)}
              >
                取消回复
              </Button>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={replyTo ? `回复 ${replyTo.author?.nickname}…` : "写下你的评论…"}
              aria-label={replyTo ? `回复 ${replyTo.author?.nickname}` : "写下你的评论"}
              name="comment"
              autoComplete="off"
              spellCheck
              maxLength={500}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              disabled={submitting}
            />
            <Button
              size="sm"
              onClick={submit}
              disabled={submitting || !content.trim()}
              className="touch-manipulation active:scale-[0.97]"
            >
              发送
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Enter 发送，Shift+Enter 换行
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CommentItem({
  comment,
  currentUserId,
  isReply = false,
  onReply,
  onDelete,
}: {
  comment: Comment;
  currentUserId?: string;
  isReply?: boolean;
  onReply: () => void;
  onDelete: () => void;
}) {
  const isMine = comment.author_id === currentUserId;
  return (
    <div className="flex gap-2">
      <UserAvatar
        profile={comment.author}
        size={isReply ? 24 : 28}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {comment.author?.nickname ?? "用户"}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(comment.created_at)}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-foreground whitespace-pre-wrap break-words">
          {comment.content}
        </p>
        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            onClick={onReply}
            aria-label={`回复 ${comment.author?.nickname ?? "用户"}`}
            className="text-xs text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-1 -mx-1 touch-manipulation"
          >
            回复
          </button>
          {isMine ? (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-destructive rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-1 -mx-1 touch-manipulation"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              删除
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
