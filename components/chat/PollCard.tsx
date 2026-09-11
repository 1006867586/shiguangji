"use client";

// ============================================================
// PollCard — 聊天内嵌的投票 / 接龙卡片
// 展示标题、选项得票/百分比，支持投票与接龙、实时更新
// ============================================================

import { memo, useState } from "react";
import { ListChecks, ListPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchData } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/common/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GroupPoll } from "@/types";

interface PollCardProps {
  groupId: string;
  poll: GroupPoll;
  /** 当前登录用户 id（用于区分本人操作） */
  currentUserId: string;
  /** 投票/参与成功后回调更新（由父级将新 loaded poll 写回） */
  onUpdated?: (poll: GroupPoll) => void;
}

function PollCardInner({ groupId, poll, currentUserId, onUpdated }: PollCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [rollcallText, setRollcallText] = useState(
    poll.rollcall_entries?.find((e) => e.user_id === currentUserId)?.content ?? ""
  );
  const isRolling = poll.rollcall_entries?.some((e) => e.user_id === currentUserId) ?? false;

  const pollOpen = poll.status === "open";

  const refresh = async () => {
    const res = await fetchData<{ poll: GroupPoll }>(
      `/api/groups/${groupId}/polls/${poll.id}`
    );
    onUpdated?.(res.poll);
  };

  /** 发起投票 / 参与接龙 */
  const submit = async (payload: Record<string, unknown>) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetchData<{ poll: GroupPoll }>(
        `/api/groups/${groupId}/polls/${poll.id}`,
        { method: "POST", body: JSON.stringify(payload) }
      );
      onUpdated?.(res.poll);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const totalVotes = poll.options.reduce((s, o) => s + (o.count ?? 0), 0);

  // ===== 接龙 / 自由参与 =====
  if (poll.kind === "rollcall") {
    const entries = poll.rollcall_entries ?? [];
    return (
      <div className="w-64 rounded-xl border border-border bg-background p-3 shadow-sm">
        <div className="flex items-start gap-2">
          <ListPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{poll.title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              已有 {entries.length} 人参与
            </p>
          </div>
        </div>

        {entries.length > 0 ? (
          <div className="mt-2 space-y-1">
            {entries.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-2 rounded-md bg-muted px-2 py-1"
              >
                <UserAvatar profile={e.participant ?? null} size={18} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {e.participant?.nickname ?? "用户"}
                </span>
                {e.content ? (
                  <span className="truncate text-[11px] text-muted-foreground">
                    {e.content}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">还没有人参与，快来接龙～</p>
        )}

        {pollOpen && (
          <div className="mt-2 flex items-center gap-1.5">
            <Input
              value={rollcallText}
              onChange={(e) => setRollcallText(e.target.value)}
              placeholder={isRolling ? "修改你的接龙内容…" : "说一句并参与接龙…"}
              maxLength={200}
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (rollcallText.trim())
                    submit({ content: rollcallText.trim() });
                  else if (isRolling) submit({ content: "" });
                }
              }}
              className="h-8 flex-1 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              disabled={submitting}
              onClick={() =>
                rollcallText.trim()
                  ? submit({ content: rollcallText.trim() })
                  : isRolling && submit({ content: "" })
              }
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isRolling ? (
                rollcallText.trim() ? "更新" : "退出"
              ) : (
                "参与"
              )}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ===== 投票 =====
  return (
    <div className="w-64 rounded-xl border border-border bg-background p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug">{poll.title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {poll.multiple ? "多选" : "单选"} · {poll.participant_count} 人参与
          </p>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        {poll.options.map((o) => {
          const pct = totalVotes > 0 ? Math.round(((o.count ?? 0) / totalVotes) * 100) : 0;
          return (
            <button
              key={o.id}
              type="button"
              disabled={!pollOpen || submitting}
              onClick={() => submit({ optionId: o.id, selected: !o.votedByMe })}
              className="relative w-full overflow-hidden rounded-lg border border-input bg-background text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                className="absolute inset-y-0 left-0 bg-primary/10 transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center justify-between px-2.5 py-1.5 text-xs">
                <span className="truncate">{o.label}</span>
                <span className="ml-1 shrink-0 font-medium text-muted-foreground">
                  {pct}% · {o.count}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {pollOpen && (
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          {submitting ? "投票中…" : poll.i_participated ? "已投票，可再点切换" : "点选选项即可投票"}
        </p>
      )}
    </div>
  );
}

export const PollCard = memo(PollCardInner);