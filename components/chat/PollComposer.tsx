"use client";

// ============================================================
// PollComposer — 创建投票 / 接龙的表单（悬浮面板）
// 支持类型切换（投票=多选项；接龙=自由收集）、单选/多选
// ============================================================

import { useState } from "react";
import { ListChecks, ListPlus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { fetchData } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GroupPoll, GroupPollKind } from "@/types";

interface PollComposerProps {
  groupId: string;
  /** 创建成功后回调（返回承载该投票的聊天负载 poll） */
  onCreate?: (poll: GroupPoll) => void;
  onClose?: () => void;
}

const MAX_OPTIONS = 10;

export function PollComposer({ groupId, onCreate, onClose }: PollComposerProps) {
  const [kind, setKind] = useState<GroupPollKind>("poll");
  const [title, setTitle] = useState("");
  const [multiple, setMultiple] = useState(false);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [submitting, setSubmitting] = useState(false);

  const updateOption = (i: number, v: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, ""]);
  };

  const removeOption = (i: number) =>
    setOptions((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    const t = title.trim();
    if (!t) return toast.error("请输入标题");
    if (kind === "poll") {
      const filled = options.map((o) => o.trim()).filter((o) => o.length > 0);
      if (filled.length < 2) return toast.error("投票至少需要 2 个选项");
    }
    setSubmitting(true);
    try {
      const res = await fetchData<{ poll: GroupPoll }>(
        `/api/groups/${groupId}/polls`,
        {
          method: "POST",
          body: JSON.stringify({
            kind,
            title: t,
            multiple: kind === "poll" ? multiple : false,
            options: kind === "poll" ? options : [],
          }),
        }
      );
      onCreate?.(res.poll);
      onClose?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">发起投票 / 接龙</p>
        {onClose ? (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {/* 类型切换 */}
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(["poll", "rollcall"] as GroupPollKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors",
              kind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {k === "poll" ? (
              <ListChecks className="h-3.5 w-3.5" />
            ) : (
              <ListPlus className="h-3.5 w-3.5" />
            )}
            {k === "poll" ? "投票" : "接龙"}
          </button>
        ))}
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={kind === "poll" ? "投票标题，如：今晚去吃哪家？" : "接龙标题，如：周末聚餐报名"}
        maxLength={60}
        className="mb-2 h-9 text-sm"
      />

      {kind === "poll" ? (
        <>
          <div className="space-y-1.5">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  value={o}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`选项 ${i + 1}`}
                  maxLength={40}
                  className="h-8 flex-1 text-sm"
                />
                {options.length > 2 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => removeOption(i)}
                    aria-label="删除选项"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          {options.length < MAX_OPTIONS ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1.5 h-7 px-2 text-xs text-primary"
              onClick={addOption}
            >
              <Plus className="h-3.5 w-3.5" /> 添加选项
            </Button>
          ) : null}

          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={multiple}
              onChange={(e) => setMultiple(e.target.checked)}
              className="accent-primary"
            />
            允许多选
          </label>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          接龙让成员依次报名并附带一句内容，适合聚餐、活动召集。
        </p>
      )}

      <Button
        size="sm"
        className="mt-3 h-9 w-full"
        disabled={submitting}
        onClick={submit}
      >
        {submitting ? "创建中…" : "发布"}
      </Button>
    </div>
  );
}