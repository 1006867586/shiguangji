"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface RouletteWheelProps {
  /** 候选标题列表 */
  labels: string[];
  /** 是否正在旋转 */
  spinning: boolean;
  /** 本次抽中的索引（旋转结束后由父组件设置，用于高亮） */
  winnerIndex: number | null;
  /** 旋转目标角度（度），父组件在开始旋转时计算并传入 */
  rotation: number;
}

// 扇形配色（循环使用）
const COLORS = [
  "#f97316",
  "#fb923c",
  "#fbbf24",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#ef4444",
];

/**
 * RouletteWheel — SVG 转盘。
 * - 父组件控制 `spinning` 与 `rotation`：开始旋转时把 rotation 设为目标角度，
 *   旋转动画由 CSS transition 实现；动画结束后父组件置 spinning=false 并设置 winnerIndex。
 * - 顶部有指针，旋转过程中扇形随之转动，停下后指针指向 winnerIndex。
 */
export function RouletteWheel({
  labels,
  spinning,
  winnerIndex,
  rotation,
}: RouletteWheelProps) {
  const n = labels.length;
  const slice = n > 0 ? 360 / n : 360;

  const [displayRotation, setDisplayRotation] = useState(rotation);
  useEffect(() => {
    setDisplayRotation(rotation);
  }, [rotation]);

  const size = 280;
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;

  const slices = useMemo(() => {
    if (n === 0) return [];
    return Array.from({ length: n }, (_, i) => {
      const startDeg = i * slice - 90; // 让第 0 份顶部居中
      const endDeg = startDeg + slice;
      const startRad = (startDeg * Math.PI) / 180;
      const endRad = (endDeg * Math.PI) / 180;
      const x1 = cx + r * Math.cos(startRad);
      const y1 = cy + r * Math.sin(startRad);
      const x2 = cx + r * Math.cos(endRad);
      const y2 = cy + r * Math.sin(endRad);
      const largeArc = slice > 180 ? 1 : 0;
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      const midDeg = startDeg + slice / 2;
      const midRad = (midDeg * Math.PI) / 180;
      const tx = cx + r * 0.6 * Math.cos(midRad);
      const ty = cy + r * 0.6 * Math.sin(midRad);
      return {
        d,
        color: COLORS[i % COLORS.length],
        text: labels[i],
        tx,
        ty,
        midDeg,
      };
    });
  }, [labels, slice, n, cx, cy, r]);

  if (n === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border-2 border-dashed border-border text-center text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        先添加几家店
        <br />
        再来转盘
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* 顶部指针 */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderTop: "18px solid hsl(var(--primary))",
          filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.25))",
        }}
      />
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn(
          "transition-transform",
          spinning ? "duration-[4000ms] ease-out" : "duration-0"
        )}
        style={{
          transform: `rotate(${displayRotation}deg)`,
          transitionTimingFunction: spinning
            ? "cubic-bezier(0.17, 0.67, 0.12, 0.99)"
            : undefined,
        }}
      >
        {slices.map((s, i) => (
          <g key={i}>
            <path
              d={s.d}
              fill={s.color}
              stroke="white"
              strokeWidth={2}
              opacity={
                winnerIndex !== null && !spinning
                  ? i === winnerIndex
                    ? 1
                    : 0.45
                  : 1
              }
            />
            <text
              x={s.tx}
              y={s.ty}
              fill="white"
              fontSize={n > 8 ? 11 : n > 5 ? 13 : 15}
              fontWeight={600}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${s.midDeg} ${s.tx} ${s.ty})`}
              style={{
                textShadow: "0 1px 2px rgba(0,0,0,0.35)",
                pointerEvents: "none",
              }}
            >
              {s.text.length > 6 ? `${s.text.slice(0, 6)}…` : s.text}
            </text>
          </g>
        ))}
        {/* 中心圆 */}
        <circle
          cx={cx}
          cy={cy}
          r={18}
          fill="white"
          style={{ stroke: "hsl(var(--border))" }}
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}

/**
 * 计算旋转角度：让指针（顶部）最终指向 winnerIndex 的扇形中心。
 * - 扇形中心在转盘坐标系中的角度 = winnerIndex * slice - 90 + slice/2
 * - 转盘旋转 R 度后，扇形中心实际指向 = 原角度 + R；希望它落在 -90（顶部）
 *   => R ≡ -(winnerIndex * slice + slice/2) (mod 360)
 */
export function calcRotation(
  winnerIndex: number,
  total: number,
  extraSpins = 5
): number {
  if (total <= 0) return 0;
  const slice = 360 / total;
  const target = -(winnerIndex * slice + slice / 2);
  const norm = ((target % 360) + 360) % 360;
  return 360 * extraSpins + norm;
}

/** 累加旋转角度：保证每次都比上次大，避免动画回退 */
export function useAccumulatedRotation() {
  const ref = useRef(0);
  const next = (winnerIndex: number, total: number) => {
    const base = calcRotation(winnerIndex, total);
    const prev = ref.current;
    let target = base;
    while (target <= prev + 360 * 2) {
      target += 360;
    }
    ref.current = target;
    return target;
  };
  const reset = () => {
    ref.current = 0;
  };
  return { next, reset };
}
