"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { useRating } from "@/hooks/useRating";
import { cn } from "@/lib/utils";

interface RatingStarsProps {
  activityId: string;
  /** 紧凑模式：仅显示星星 + 平均分，不展示评分人数文案 */
  compact?: boolean;
  /** 初始平均分（来自 Activity 字段，避免首屏空白） */
  initialAverage?: number;
  initialCount?: number;
  initialMyScore?: number | null;
}

/**
 * RatingStars — 5 星评分组件。
 * 点击星星打分（1-5），再次点击自己的评分则取消。
 * 乐观更新由 useRating 内部处理，失败时 toast 提示并回滚。
 */
export function RatingStars({
  activityId,
  compact = false,
  initialAverage,
  initialCount,
  initialMyScore,
}: RatingStarsProps) {
  const { myScore, average, count, rate, remove } = useRating(activityId);
  const [hover, setHover] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 首屏优先使用 SWR 数据，未加载时回退到 initial 值
  const displayAverage = average ?? initialAverage ?? 0;
  const displayCount = count ?? initialCount ?? 0;
  const displayMyScore = myScore ?? initialMyScore ?? null;

  // 悬停时预览，否则显示自己的评分（若有），否则显示平均分四舍五入
  const previewScore =
    hover ?? displayMyScore ?? Math.round(displayAverage);

  const handleRate = async (score: number) => {
    setSubmitting(true);
    try {
      if (displayMyScore === score) {
        await remove();
        toast.success("已取消评分");
      } else {
        await rate(score);
        toast.success("评分成功");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "评分失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="flex items-center gap-0.5"
        role="radiogroup"
        aria-label="评分"
      >
        {[1, 2, 3, 4, 5].map((s) => {
          const active = s <= previewScore;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={displayMyScore === s}
              aria-label={`${s} 星`}
              disabled={submitting}
              onMouseEnter={() => setHover(s)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleRate(s)}
              className="rounded p-0.5 transition-transform hover:scale-110 active:scale-95 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <Star
                className={cn(
                  "h-4 w-4",
                  active
                    ? "fill-amber-400 text-amber-400"
                    : "fill-transparent text-muted-foreground"
                )}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">
        <span className="font-medium tabular-nums text-foreground">
          {displayAverage.toFixed(1)}
        </span>
        {!compact && displayCount > 0 ? (
          <span> · {displayCount} 人评分</span>
        ) : null}
      </span>
    </div>
  );
}
