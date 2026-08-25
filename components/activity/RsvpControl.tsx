"use client";

import { useState } from "react";
import { Check, HelpCircle, X, ChevronDown, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/common/UserAvatar";
import { useRsvp } from "@/hooks/useRsvp";
import { cn } from "@/lib/utils";
import type { RsvpStatus } from "@/types";

interface RsvpControlProps {
  activityId: string;
}

/** 三种状态对应的文案 / 图标 / 激活样式 */
const STATUS_CONFIG: Record<
  RsvpStatus,
  { label: string; icon: typeof Check; activeCls: string }
> = {
  attending: {
    label: "参加",
    icon: Check,
    activeCls:
      "border-transparent bg-emerald-500 text-white hover:bg-emerald-500/90",
  },
  maybe: {
    label: "也许",
    icon: HelpCircle,
    activeCls:
      "border-transparent bg-amber-500 text-white hover:bg-amber-500/90",
  },
  declined: {
    label: "不参加",
    icon: X,
    activeCls:
      "border-transparent bg-zinc-400 text-white hover:bg-zinc-400/90",
  },
};

const STATUS_ORDER: RsvpStatus[] = ["attending", "maybe", "declined"];

/**
 * RsvpControl — 活动出席报名组件。
 * 三个按钮（参加 / 也许 / 不参加），当前状态高亮，再次点击同状态则取消。
 * 展开后显示参加人员头像列表（前 5 个）。
 */
export function RsvpControl({ activityId }: RsvpControlProps) {
  const { summary, myStatus, setStatus, cancel } = useRsvp(activityId);
  const [submitting, setSubmitting] = useState<RsvpStatus | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleSet = async (status: RsvpStatus) => {
    // 同状态 → 取消报名
    if (myStatus === status) {
      setSubmitting(status);
      try {
        await cancel();
        toast.success("已取消报名");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失败");
      } finally {
        setSubmitting(null);
      }
      return;
    }
    setSubmitting(status);
    try {
      await setStatus(status);
      toast.success(`已标记为${STATUS_CONFIG[status].label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSubmitting(null);
    }
  };

  const attending = summary?.attending ?? 0;
  const maybe = summary?.maybe ?? 0;
  const declined = summary?.declined ?? 0;
  const attendees = summary?.attendees ?? [];
  const hasAnyResponse = attending + maybe + declined > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {STATUS_ORDER.map((status) => {
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          const active = myStatus === status;
          const isSubmitting = submitting === status;
          return (
            <Button
              key={status}
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              aria-pressed={active}
              onClick={() => handleSet(status)}
              className={cn(
                "h-8 gap-1 rounded-full px-3 text-xs touch-manipulation active:scale-[0.97]",
                active && cfg.activeCls
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {cfg.label}
            </Button>
          );
        })}
      </div>

      {/* 汇总 */}
      {hasAnyResponse ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 rounded hover:text-foreground touch-manipulation"
            aria-expanded={expanded}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-emerald-600 tabular-nums">参加 {attending}</span>
            <span className="text-amber-600 tabular-nums">也许 {maybe}</span>
            <span className="tabular-nums">不参加 {declined}</span>
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                expanded && "rotate-180"
              )}
              aria-hidden="true"
            />
          </button>
        </div>
      ) : null}

      {/* 参加人员名单（完整列出） */}
      {expanded && attendees.length > 0 ? (
        <div className="flex items-center gap-1">
          {attendees.map((p) => (
            <UserAvatar
              key={p.id}
              profile={p}
              size={28}
              className="ring-2 ring-emerald-500/40"
            />
          ))}
        </div>
      ) : null}

      {expanded && attendees.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无参加人员</p>
      ) : null}
    </div>
  );
}
