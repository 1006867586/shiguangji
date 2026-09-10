// ============================================================
// RichText — 正文渲染：保留换行 + 高亮 @提及
// 可服务端/客户端复用（纯展示组件，无交互、无副作用）。
// ============================================================

import { MENTION_REGEX } from "@/lib/mention";

interface RichTextProps {
  text: string | null | undefined;
  className?: string;
}

/**
 * 将正文按 @提及切分渲染：
 *  - 保留换行与空白（whitespace-pre-wrap）
 *  - @昵称 用主题色高亮
 */
export function RichText({ text, className = "" }: RichTextProps) {
  if (!text) return null;

  // String.split 配合带捕获组的全局正则：偶数下标为纯文本，奇数下标为 @ 捕获的昵称
  const parts = text.split(MENTION_REGEX);

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((part, idx) =>
        idx % 2 === 1 ? (
          <span key={idx} className="font-medium text-primary">
            @{part}
          </span>
        ) : (
          part
        )
      )}
    </span>
  );
}

// 兼容导出名：正文/评论均用 RichText 高亮提及
export { RichText as MentionText };