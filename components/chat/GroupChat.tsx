"use client";

// ============================================================
// GroupChat — 圈子聊天界面：消息列表 + 实时收发 + 图片 + @提及
// ============================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ImagePlus, Loader2, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/common/UserAvatar";
import { MentionComposer } from "@/components/common/MentionComposer";
import { RichText } from "@/components/common/RichText";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { useGroupChat } from "@/hooks/useGroupChat";
import { useUpload } from "@/hooks/useUpload";
import { markChatRead } from "@/hooks/useChatUnread";
import type { GroupMessage } from "@/types";

interface GroupChatProps {
  groupId: string;
  groupName: string;
  currentUserId: string;
}

export function GroupChat({
  groupId,
  groupName,
  currentUserId,
}: GroupChatProps) {
  const { members } = useGroupMembers(groupId);
  const {
    messages,
    hasMore,
    loadingInitial,
    loadingOlder,
    loadOlder,
    sendMessage,
  } = useGroupChat(groupId, members);

  const { uploadFile, uploading } = useUpload();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const latestIdRef = useRef<string | null>(null);

  // 自动滚到底：仅当「最新一条」变化时触发（加载历史不打断）
  useEffect(() => {
    const latest = messages[messages.length - 1]?.id;
    if (!loadingInitial && messages.length > 0 && latest !== latestIdRef.current) {
      latestIdRef.current = latest;
      bottomRef.current?.scrollIntoView({ block: "end" });
      // 正在聊天页阅读 → 推进已读时间线（红点归零）
      markChatRead(groupId).catch(() => {});
    }
  }, [messages, loadingInitial, groupId]);

  // 打开聊天页立即标记已读
  useEffect(() => {
    markChatRead(groupId).catch(() => {});
  }, [groupId]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendMessage({ content: text });
      setDraft("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发送失败");
    } finally {
      setSending(false);
    }
  };

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSending(true);
    try {
      const url = await uploadFile(file, "image");
      if (url) await sendMessage({ imageUrl: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "图片发送失败");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col pb-16">
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href={`/g/${groupId}`} aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="min-w-0 truncate text-base font-semibold">{groupName}</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {members.length} 人
          </span>
        </div>
      </header>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {hasMore ? (
          <div className="mb-2 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs text-muted-foreground"
              onClick={loadOlder}
              disabled={loadingOlder}
            >
              {loadingOlder ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "加载更早的消息"
              )}
            </Button>
          </div>
        ) : null}

        {loadingInitial ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-8 w-48 rounded-lg" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            还没有消息，说点什么吧
          </p>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} msg={msg} isMine={msg.sender_id === currentUserId} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="sticky bottom-16 z-30 border-t border-border bg-background/95 p-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-end gap-1.5">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePickImage}
            aria-hidden="true"
            tabIndex={-1}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading || sending}
            aria-label="发送图片"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
          </Button>
          <MentionComposer
            value={draft}
            onChange={setDraft}
            members={members}
            placeholder="发消息，@ 提醒成员…"
            rows={1}
            maxLength={1000}
            onSubmit={handleSend}
            disabled={sending || uploading}
            className="min-w-0 flex-1"
            ariaLabel="聊天输入"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={sending || uploading || !draft.trim()}
            aria-label="发送"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg, isMine }: { msg: GroupMessage; isMine: boolean }) {
  if (isMine) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[78%] flex-col items-end gap-0.5">
          {msg.type === "image" && msg.image_url ? (
            <img
              src={msg.image_url}
              alt="聊天图片"
              className="h-40 w-40 rounded-xl object-cover"
              loading="lazy"
            />
          ) : (
            <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground">
              <RichText text={msg.content} mentionClassName="text-primary-foreground" />
            </div>
          )}
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(msg.created_at)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <UserAvatar profile={msg.sender ?? null} size={32} className="mt-0.5 shrink-0" />
      <div className="max-w-[78%]">
        <p className="mb-0.5 text-[11px] text-muted-foreground">
          {msg.sender?.nickname ?? "用户"}
        </p>
        {msg.type === "image" && msg.image_url ? (
          <img
            src={msg.image_url}
            alt="聊天图片"
            className="h-40 w-40 rounded-xl object-cover"
            loading="lazy"
          />
        ) : (
          <div className={cn("whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm")}>
            <RichText text={msg.content} />
          </div>
        )}
        <span className="mt-0.5 block text-[10px] text-muted-foreground">
          {formatRelativeTime(msg.created_at)}
        </span>
      </div>
    </div>
  );
}