"use client";

import { useEffect, useRef } from "react";
import type { ReactionEmoji } from "@/types";

/** 可选反应列表（emoji + 文案 + 类型） */
export const REACTION_LIST: {
  emoji: string;
  label: string;
  value: ReactionEmoji;
}[] = [
  { emoji: "👍", label: "赞", value: "like" },
  { emoji: "❤️", label: "爱心", value: "love" },
  { emoji: "😂", label: "哈哈", value: "haha" },
  { emoji: "😮", label: "惊讶", value: "wow" },
  { emoji: "😢", label: "难过", value: "sad" },
  { emoji: "😠", label: "愤怒", value: "angry" },
];

interface ReactionPickerProps {
  /** 选中某个 emoji 时触发 */
  onPick: (emoji: ReactionEmoji) => void;
  /** 关闭浮层时触发（点击外部 / Esc / 选中后） */
  onClose?: () => void;
}

/**
 * ReactionPicker — 浮动表情选择器。
 * 使用绝对定位浮层，点击外部或 Esc 关闭。父容器需 relative。
 */
export function ReactionPicker({ onPick, onClose }: ReactionPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose?.();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="选择表情反应"
      className="absolute bottom-full left-0 z-30 mb-2 flex items-center gap-0.5 rounded-full border border-border bg-popover p-1.5 shadow-lg"
    >
      {REACTION_LIST.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => {
            onPick(r.value);
            onClose?.();
          }}
          aria-label={r.label}
          className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-muted active:scale-95 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true">{r.emoji}</span>
        </button>
      ))}
    </div>
  );
}
