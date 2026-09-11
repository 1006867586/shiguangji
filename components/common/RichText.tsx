"use client";

// ============================================================
// RichText — 正文渲染：保留换行 + 高亮 @提及（可点击）
// 传入 userMap + onMentionClick 后，命中的 @昵称 变为可点击按钮，
// 用于弹出用户资料卡片；未传则退化为纯高亮展示。
// ============================================================

import { MENTION_REGEX } from "@/lib/mention";
import type { MentionUser } from "@/types";

interface RichTextProps {
  text: string | null | undefined;
  className?: string;
  /** @昵称 高亮类，默认 text-primary；在特殊底色（如聊天气泡）内可覆盖 */
  mentionClassName?: string;
  /** 昵称(小写) → 用户信息 映射：传入后命中的 @昵称 变为可点击按钮 */
  userMap?: Record<string, MentionUser>;
  /** 点击 @昵称 回调（需与 userMap 配合） */
  onMentionClick?: (user: MentionUser) => void;
}

/**
 * 将正文按 @提及切分渲染：
 *  - 保留换行与空白（whitespace-pre-wrap）
 *  - @昵称 用主题色高亮；命中 userMap 且提供回调时可点击
 */
export function RichText({
  text,
  className = "",
  mentionClassName = "text-primary",
  userMap,
  onMentionClick,
}: RichTextProps) {
  if (!text) return null;

  // String.split 配合带捕获组的全局正则：偶数下标为纯文本，奇数下标为 @ 捕获的昵称
  const parts = text.split(MENTION_REGEX);

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((part, idx) => {
        if (idx % 2 === 0) return part;
        const user = userMap?.[part.toLowerCase()];
        if (user && onMentionClick) {
          return (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                // 阻止事件冒泡，避免触发外层 Link 跳转（动态正文 / 引用块）
                e.stopPropagation();
                e.preventDefault();
                onMentionClick(user);
              }}
              className={`cursor-pointer font-medium ${mentionClassName} hover:underline focus-visible:underline`}
            >
              @{part}
            </button>
          );
        }
        return (
          <span key={idx} className={`font-medium ${mentionClassName}`}>
            @{part}
          </span>
        );
      })}
    </span>
  );
}

// 兼容导出名：正文/评论均用 RichText 高亮提及
export { RichText as MentionText };
