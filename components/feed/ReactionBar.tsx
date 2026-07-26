"use client";

import { useState } from "react";
import { Smile } from "lucide-react";
import { toast } from "sonner";
import { useReactions } from "@/hooks/useReactions";
import { ReactionPicker, REACTION_LIST } from "./ReactionPicker";
import { cn } from "@/lib/utils";
import type { ReactionEmoji } from "@/types";

interface ReactionBarProps {
  activityId: string;
  /** 初始汇总（来自 Activity.reactions，避免首屏空白） */
  initialSummary?: import("@/types").ReactionSummary | null;
}

/**
 * ReactionBar — 反应展示条，显示在 FeedCard 操作栏下方。
 * 展示有反应的 emoji 及其计数，点击可快速切换；当前用户的反应高亮。
 * 末尾的笑脸按钮打开 ReactionPicker 选择其他表情。
 */
export function ReactionBar({ activityId, initialSummary }: ReactionBarProps) {
  const { summary, toggle } = useReactions(activityId);
  const [showPicker, setShowPicker] = useState(false);

  // 首屏回退到 initialSummary
  const data = summary ?? initialSummary ?? null;
  if (!data) return null;

  const items = REACTION_LIST.filter((r) => (data[r.value] ?? 0) > 0);
  // 既无任何反应、也非详情场景需要展示「+表情」入口时，不渲染
  const hasAnyReaction = items.length > 0;
  if (!hasAnyReaction && !showPicker) return null;

  const handlePick = async (emoji: ReactionEmoji) => {
    try {
      await toggle(emoji);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  return (
    <div className="relative mt-2 flex flex-wrap items-center gap-1.5">
      {items.map((r) => {
        const count = data[r.value] ?? 0;
        const active = data.my_reaction === r.value;
        return (
          <button
            key={r.value}
            type="button"
            onClick={() => handlePick(r.value)}
            aria-pressed={active}
            aria-label={`${r.label} ${count}，点击${active ? "取消" : "切换"}`}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors touch-manipulation active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/60 text-foreground hover:bg-muted"
            )}
          >
            <span aria-hidden="true" className="text-sm leading-none">
              {r.emoji}
            </span>
            <span className="tabular-nums">{count}</span>
          </button>
        );
      })}

      {/* 打开表情选择器 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          aria-label="选择表情反应"
          aria-expanded={showPicker}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted touch-manipulation active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            showPicker && "border-primary text-primary"
          )}
        >
          <Smile className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {showPicker ? (
          <ReactionPicker
            onPick={handlePick}
            onClose={() => setShowPicker(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
