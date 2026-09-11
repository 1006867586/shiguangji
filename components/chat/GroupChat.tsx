"use client";

// ============================================================
// GroupChat — 圈子聊天界面：消息列表 + 实时收发 + 图片 + @提及
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ImagePlus, Loader2, Search, SearchX, SendHorizontal, X, SmilePlus, Megaphone, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/common/UserAvatar";
import { MentionComposer } from "@/components/common/MentionComposer";
import { RichText } from "@/components/common/RichText";
import { UserProfileCard } from "@/components/common/UserProfileCard";
import { PollCard } from "@/components/chat/PollCard";
import { PollComposer } from "@/components/chat/PollComposer";
import { buildMentionUserMap } from "@/lib/mention";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { useGroupChat } from "@/hooks/useGroupChat";
import { useUpload } from "@/hooks/useUpload";
import { markChatRead } from "@/hooks/useChatUnread";
import type { GroupMessage, GroupPoll, MentionUser } from "@/types";

interface GroupChatProps {
  groupId: string;
  groupName: string;
  announcement?: string | null;
  currentUserId: string;
}

export function GroupChat({
  groupId,
  groupName,
  announcement,
  currentUserId,
}: GroupChatProps) {
  const { members } = useGroupMembers(groupId);
  const mentionUserMap = useMemo(() => buildMentionUserMap(members), [members]);
  const [mentionUser, setMentionUser] = useState<MentionUser | null>(null);
  /** 搜索关键词（非空即在「搜索模式」下拉取命中消息） */
  const [searchQuery, setSearchQuery] = useState("");
  const {
    messages,
    hasMore,
    loadingInitial,
    loadingOlder,
    loadOlder,
    sendMessage,
    toggleReaction,
    patchPoll,
    reload,
  } = useGroupChat(groupId, members, searchQuery);

  const { uploadFile, uploading } = useUpload();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  /** 正在被引用的消息（引用回复输入条） */
  const [replyTarget, setReplyTarget] = useState<GroupMessage | null>(null);
  /** 正在弹出表情选择器的消息 ID */
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  /** 搜索框是否展开 */
  const [searchOpen, setSearchOpen] = useState(false);
  /** emoji 快捷选择面板是否展开 */
  const [emojiOpen, setEmojiOpen] = useState(false);
  /** 投票/接龙创建面板是否展开 */
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const pollComposerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const latestIdRef = useRef<string | null>(null);

  // 打开 / 退出搜索时，重置已读时间线推进逻辑（避免搜索切换触发滚动）
  const isSearching = searchOpen && searchQuery.trim().length > 0;

  // 自动滚到底：仅当「最新一条」变化且非搜索模式时触发（加载历史/搜索不打断）
  useEffect(() => {
    if (isSearching) return;
    const latest = messages[messages.length - 1]?.id;
    if (!loadingInitial && messages.length > 0 && latest !== latestIdRef.current) {
      latestIdRef.current = latest;
      bottomRef.current?.scrollIntoView({ block: "end" });
      // 正在聊天页阅读 → 推进已读时间线（红点归零）
      markChatRead(groupId).catch(() => {});
    }
  }, [messages, loadingInitial, groupId, isSearching]);

  // 打开聊天页立即标记已读
  useEffect(() => {
    markChatRead(groupId).catch(() => {});
  }, [groupId]);

  // emoji 面板：点击外部关闭
  useEffect(() => {
    if (!emojiOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (
        emojiPanelRef.current &&
        !emojiPanelRef.current.contains(e.target as Node)
      ) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [emojiOpen]);

  /** 在光标处插入 emoji 并保持焦点 */
  const insertEmoji = (emoji: string) => {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? draft.length;
    const next = draft.slice(0, caret) + emoji + draft.slice(caret);
    setDraft(next);
    requestAnimationFrame(() => {
      ta?.focus();
      const pos = caret + emoji.length;
      ta?.setSelectionRange(pos, pos);
    });
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendMessage({
        content: text,
        replyToId: replyTarget?.id,
      });
      setDraft("");
      setReplyTarget(null);
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
      if (url)
        await sendMessage({
          imageUrl: url,
          replyToId: replyTarget?.id,
        });
      setReplyTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "图片发送失败");
    } finally {
      setSending(false);
    }
  };

  /** 处理表情回应切换（含出错提示） */
  const handleToggleReaction = async (messageId: string, emoji: string) => {
    setPickerFor(null);
    try {
      await toggleReaction(messageId, emoji);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
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
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="搜索聊天记录"
              title="搜索聊天记录"
              onClick={() => {
                setSearchOpen((v) => !v);
                if (!searchOpen) setSearchQuery("");
              }}
            >
              <Search className="h-5 w-5" />
            </Button>
          </div>
        </div>
        {/* 搜索框 */}
        {searchOpen ? (
          <div className="flex items-center gap-1 px-2 pb-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索聊天消息…"
                className="h-9 pl-8 pr-8"
                autoFocus
                aria-label="搜索聊天消息"
              />
              {searchQuery ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-9 w-9"
                  aria-label="清除搜索"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      {/* 公告横幅 */}
      {!isSearching && announcement ? (
        <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-primary bg-primary/5 border-b border-primary/10">
          <Megaphone className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{announcement}</p>
        </div>
      ) : null}

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {!isSearching && hasMore ? (
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
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            {isSearching ? (
              <>
                <SearchX className="h-8 w-8 text-muted-foreground/60" />
                <p className="text-xs text-muted-foreground">
                  没有找到与「{searchQuery.trim()}」相关的消息
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                还没有消息，说点什么吧
              </p>
            )}
          </div>
        ) : isSearching ? (
          <div className="space-y-2">
            <p className="px-1 text-[11px] text-muted-foreground">
              找到 {messages.length} 条相关消息（仅匹配文本内容）
            </p>
            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                isMine={msg.sender_id === currentUserId}
                groupId={groupId}
                currentUserId={currentUserId}
                mentionUserMap={mentionUserMap}
                onMentionClick={setMentionUser}
                onReply={() => setReplyTarget(msg)}
                onReaction={handleToggleReaction}
                onPollUpdated={patchPoll}
                pickerOpen={pickerFor === msg.id}
                onTogglePicker={() =>
                  setPickerFor((prev) => (prev === msg.id ? null : msg.id))
                }
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                isMine={msg.sender_id === currentUserId}
                groupId={groupId}
                currentUserId={currentUserId}
                mentionUserMap={mentionUserMap}
                onMentionClick={setMentionUser}
                onReply={() => setReplyTarget(msg)}
                onReaction={handleToggleReaction}
                onPollUpdated={patchPoll}
                pickerOpen={pickerFor === msg.id}
                onTogglePicker={() =>
                  setPickerFor((prev) => (prev === msg.id ? null : msg.id))
                }
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="sticky bottom-16 z-30 border-t border-border bg-background/95 p-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {replyTarget ? (
          <div className="mb-1.5 flex items-center gap-1 rounded-lg bg-muted/70 px-2 py-1.5 text-xs">
            <div className="min-w-0 flex-1">
              <span className="font-medium">
                {replyTarget.sender?.nickname ?? "用户"}
              </span>
              <span className="ml-1 text-muted-foreground">
                {replyTarget.type === "image"
                  ? "[图片]"
                  : replyTarget.content?.slice(0, 40)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 rounded-full"
              onClick={() => setReplyTarget(null)}
              aria-label="取消引用"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
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
          {/* 发起投票 / 接龙 */}
          <div ref={pollComposerRef} className="relative shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-9 w-9", pollComposerOpen && "bg-accent")}
              onClick={() => {
                setPollComposerOpen((v) => !v);
                setEmojiOpen(false);
              }}
              disabled={sending}
              aria-label="发起投票/接龙"
              aria-expanded={pollComposerOpen}
            >
              <ListChecks className="h-5 w-5" />
            </Button>
            {pollComposerOpen ? (
              <div className="absolute bottom-full left-0 z-30 mb-1 w-72">
                <PollComposer
                  groupId={groupId}
                  onCreate={(poll) => {
                    // 创建后由 Realtime/回包把承载消息插入列表；这里保持面板关闭即可
                    setPollComposerOpen(false);
                  }}
                  onClose={() => setPollComposerOpen(false)}
                />
              </div>
            ) : null}
          </div>
          {/* emoji 快捷选择 */}
          <div ref={emojiPanelRef} className="relative shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-9 w-9", emojiOpen && "bg-accent")}
              onClick={() => setEmojiOpen((v) => !v)}
              disabled={sending}
              aria-label="选择表情"
              aria-expanded={emojiOpen}
            >
              <SmilePlus className="h-5 w-5" />
            </Button>
            {emojiOpen ? (
              <div className="absolute bottom-full left-0 z-30 mb-1 w-64 overflow-hidden rounded-xl border border-border bg-popover p-2 shadow-lg">
                <div className="grid max-h-40 grid-cols-8 overflow-y-auto">
                  {QUICK_EMOJI_PANEL.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition-transform hover:scale-125 hover:bg-accent"
                      onClick={() => insertEmoji(e)}
                      aria-label={`插入 ${e}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
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
            taRef={taRef}
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

      {/* 点击消息中 @昵称 弹出的用户资料卡片 */}
      <UserProfileCard user={mentionUser} onClose={() => setMentionUser(null)} />
    </div>
  );
}

/* 常用表情快速选择 */
const QUICK_EMOJIS = ["👍", "😂", "❤️", "🎉", "🔥", "😮"];

/* 输入框 emoji 快捷选择面板 */
const QUICK_EMOJI_PANEL = [
  "😀", "😄", "😁", "😆", "😂", "🤣", "😊", "😍",
  "😘", "😜", "🤪", "😎", "🤩", "🥳", "😢", "😭",
  "😡", "🥺", "😳", "🤔", "🤗", "🤫", "😴", "🤤",
  "👍", "👎", "👌", "✌️", "🤞", "🤟", "👏", "🙌",
  "🤝", "🙏", "💪", "✊", "👊", "🫶", "👋", "🤙",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "💔", "💕",
  "💞", "💓", "💗", "💖", "💘", "💝", "💯", "✨",
  "🎉", "🎊", "🎂", "🎁", "🥳", "🔥", "⭐", "🌟",
  "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼",
  "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🙈",
  "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍑",
  "🍕", "🍔", "🍟", "🌭", "🍿", "🧀", "🍗", "🍖",
  "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🎱", "🏓",
  "🎮", "🎲", "🧩", "🎨", "🎭", "🎤", "🎧", "🎬",
  "✅", "❌", "❓", "❗", "💡", "📌", "📍", "🗑️",
  "🔒", "🔓", "🔑", "🚀", "✈️", "⏰", "📱", "💻",
];

function ReplyPreview({ msg }: { msg: GroupMessage }) {
  if (!msg.reply_to_id || !msg.reply_preview) return null;
  return (
    <div className="mb-0.5 flex items-center gap-1 rounded-md bg-black/5 px-2 py-1 text-xs opacity-80">
      <span className="max-w-40 truncate font-medium">
        {msg.reply_sender?.nickname ?? "用户"}
      </span>
      <span className="truncate text-inherit">回复</span>
      <span className="truncate text-inherit">{msg.reply_preview}</span>
    </div>
  );
}

function ReactionBar({
  msg,
  isMine,
  onReaction,
}: {
  msg: GroupMessage;
  isMine: boolean;
  onReaction: (messageId: string, emoji: string) => void;
}) {
  const reactions = msg.reactions ?? [];
  if (reactions.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", isMine ? "justify-end" : "")}>
      {reactions.map((r) => (
        <Button
          key={r.emoji}
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 gap-0.5 rounded-full px-2 text-xs",
            r.reactedByMe
              ? "bg-primary/10 text-primary"
              : "hover:bg-accent"
          )}
          onClick={() => onReaction(msg.id, r.emoji)}
        >
          <span>{r.emoji}</span>
          <span className="text-[11px]">{r.count}</span>
        </Button>
      ))}
    </div>
  );
}

function ChatBubble({
  msg,
  isMine,
  groupId,
  currentUserId,
  mentionUserMap,
  onMentionClick,
  onReply,
  onReaction,
  onPollUpdated,
  pickerOpen,
  onTogglePicker,
}: {
  msg: GroupMessage;
  isMine: boolean;
  groupId: string;
  currentUserId: string;
  mentionUserMap: Record<string, MentionUser>;
  onMentionClick: (user: MentionUser) => void;
  onReply: () => void;
  onReaction: (messageId: string, emoji: string) => void;
  onPollUpdated: (messageId: string, poll: GroupPoll) => void;
  pickerOpen: boolean;
  onTogglePicker: () => void;
}) {
  const showReplyCtrl = msg.type === "text" || Boolean(msg.content);

  return (
    <div className="group relative">
      {/* 悬停操作条：引用 + 表情 */}
      <div
        className={cn(
          "absolute -top-3 right-0 z-20 flex items-center gap-0.5 rounded-full border bg-background p-0.5 shadow-sm",
          "opacity-0 transition-opacity group-hover:opacity-100",
          isMine ? "" : "right-auto left-0"
        )}
      >
        {showReplyCtrl ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full"
            onClick={onReply}
            aria-label="引用回复"
            title="引用回复"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M3 17l6-6-6-6" />
              <path d="M21 7v5a3 3 0 0 1-3 3H7" />
            </svg>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-full"
          onClick={onTogglePicker}
          aria-label="添加表情回应"
          title="表情回应"
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </Button>
        {pickerOpen ? (
          <div className="absolute right-0 top-full z-30 mt-1 flex items-center gap-0.5 rounded-full border bg-background p-1 shadow-lg">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="h-7 w-7 rounded-full text-base transition-transform hover:scale-125"
                onClick={() => onReaction(msg.id, e)}
                aria-label={`回应 ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {isMine ? (
        <div className="flex justify-end">
          <div className="flex max-w-[78%] flex-col items-end gap-0.5">
            <ReplyPreview msg={msg} />
            {msg.poll ? (
              <PollCard
                groupId={groupId}
                poll={msg.poll}
                currentUserId={currentUserId}
                onUpdated={(poll) => onPollUpdated(msg.id, poll)}
              />
            ) : msg.type === "image" && msg.image_url ? (
              <img
                src={msg.image_url}
                alt="聊天图片"
                className="h-40 w-40 rounded-xl object-cover"
                loading="lazy"
              />
            ) : (
              <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                <RichText
                  text={msg.content}
                  mentionClassName="text-primary-foreground"
                  userMap={mentionUserMap}
                  onMentionClick={onMentionClick}
                />
              </div>
            )}
            <ReactionBar msg={msg} isMine onReaction={onReaction} />
            <span className="text-[10px] text-muted-foreground">
              {formatRelativeTime(msg.created_at)}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <UserAvatar profile={msg.sender ?? null} size={32} className="mt-0.5 shrink-0" frameColor={msg.sender?.frameColor} />
          <div className="max-w-[78%]">
            <p className="mb-0.5 text-[11px] text-muted-foreground">
              {msg.sender?.nickname ?? "用户"}
            </p>
            <ReplyPreview msg={msg} />
            {msg.poll ? (
              <PollCard
                groupId={groupId}
                poll={msg.poll}
                currentUserId={currentUserId}
                onUpdated={(poll) => onPollUpdated(msg.id, poll)}
              />
            ) : msg.type === "image" && msg.image_url ? (
              <img
                src={msg.image_url}
                alt="聊天图片"
                className="h-40 w-40 rounded-xl object-cover"
                loading="lazy"
              />
            ) : (
              <div className={cn("whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm")}>
                <RichText
                  text={msg.content}
                  userMap={mentionUserMap}
                  onMentionClick={onMentionClick}
                />
              </div>
            )}
            <ReactionBar msg={msg} isMine={false} onReaction={onReaction} />
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {formatRelativeTime(msg.created_at)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}