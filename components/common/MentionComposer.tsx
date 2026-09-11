"use client";

// ============================================================
// MentionComposer — 带 @提及联想选择的复合输入框
// 输入 @ 时弹出同圈子成员下拉，选中介入 @昵称 ；支持键盘导航。
// Enter（无 Shift）在未打开选择器时触发 onSubmit。
// ============================================================

import { useRef, useState } from "react";
import { UserAvatar } from "@/components/common/UserAvatar";
import type { GroupMember } from "@/types";

const TRIGGER = "@";
const MAX_NAME = 30;

interface MentionComposerProps {
  value: string;
  onChange: (v: string) => void;
  /** 同圈子成员列表，用于 @ 联想 */
  members: GroupMember[];
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  /** Enter（无 Shift、未选入）时回调；传入表示「发送/提交」语义 */
  onSubmit?: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** 内部 textarea 的 ref（供外部聚焦 / 插入文本后定位光标） */
  taRef?: React.Ref<HTMLTextAreaElement>;
}

export function MentionComposer({
  value,
  onChange,
  members,
  placeholder,
  rows = 1,
  maxLength = 500,
  onSubmit,
  disabled = false,
  className = "",
  ariaLabel,
  taRef,
}: MentionComposerProps) {
  const taRefInternal = useRef<HTMLTextAreaElement | null>(
    null
  ) as React.MutableRefObject<HTMLTextAreaElement | null>;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const candidates = open
    ? members
        .filter((m) => {
          const nick = m.profile?.nickname?.toLowerCase() ?? "";
          return (!query || nick.startsWith(query.toLowerCase())) && nick.length > 0;
        })
        .slice(0, 6)
    : [];

  /** 探测光标前是否正在输入 @昵称 */
  const detectMention = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const idx = before.lastIndexOf(TRIGGER);
    if (idx < 0) return null;
    const prefix = before.slice(0, idx);
    // 触发词必须位于行首或空白后，才是真正想 @ 人
    if (prefix && !/\s$/.test(prefix)) return null;
    const after = before.slice(idx + 1);
    if (/\s/.test(after)) return null; // 已含空白，视为结束输入
    if (after.length >= MAX_NAME) return null;
    return after;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    const caret = e.target.selectionStart ?? v.length;
    onChange(v);
    const m = detectMention(v, caret);
    if (m !== null) {
      setQuery(m);
      setOpen(true);
      setHighlight(0);
    } else {
      setOpen(false);
    }
  };

  const choose = (member: GroupMember) => {
    const nick = member.profile?.nickname;
    if (!nick) return;
    const ta = taRefInternal.current;
    const caret = ta?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const idx = before.lastIndexOf(TRIGGER);
    const prefix = idx >= 0 ? value.slice(0, idx) : before;
    const suffix = value.slice(caret);
    const next = `${prefix}@${nick} ${suffix}`;
    onChange(next);
    requestAnimationFrame(() => {
      ta?.focus();
      const pos = (`${prefix}@${nick} `).length;
      ta?.setSelectionRange(pos, pos);
    });
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && candidates.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) =>
          e.key === "ArrowDown"
            ? (h + 1) % candidates.length
            : (h - 1 + candidates.length) % candidates.length
        );
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        choose(candidates[highlight] ?? candidates[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !open) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <textarea
        ref={(el) => {
          taRefInternal.current = el;
          if (typeof taRef === "function") taRef(el);
          else if (taRef)
            (taRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
        }}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        aria-label={ariaLabel}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {open && candidates.length > 0 ? (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg">
          {candidates.map((m, i) => (
            <button
              key={m.user_id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                choose(m);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                i === highlight ? "bg-primary/10" : "hover:bg-muted"
              }`}
            >
              <UserAvatar profile={m.profile} size={20} />
              <span className="truncate">{m.profile?.nickname ?? "用户"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}