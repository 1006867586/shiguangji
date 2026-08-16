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
  /** 点击中心 GO（同小程序交互：点 GO 即转） */
  onGoClick?: () => void;
}

// 设计稿 6 色（与小程序端一致）：火锅/日料/烧烤/川菜/粤菜/西餐
const SLICE_COLORS = [
  "#FF6B3D", // 火锅 橙红
  "#FFA040", // 日料 橙
  "#FF8C42", // 烧烤 橙
  "#F25C7A", // 川菜 粉
  "#3DC2B8", // 粤菜 青
  "#4A4AE8", // 西餐 紫
];

/** hex → rgb 字符串（如 "255,107,61"） */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const v = parseInt(
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h,
    16
  );
  return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
}

/** 向白色混合 amt（0~1），同小程序 lighten：扇区中心偏亮 */
function lighten(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const v = parseInt(
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h,
    16
  );
  const r = Math.round(((v >> 16) & 255) + (255 - ((v >> 16) & 255)) * amt);
  const g = Math.round(((v >> 8) & 255) + (255 - ((v >> 8) & 255)) * amt);
  const b = Math.round((v & 255) + (255 - (v & 255)) * amt);
  return `rgb(${r},${g},${b})`;
}

/**
 * RouletteWheel — SVG 转盘（样式对齐小程序端）。
 * - 扇区同色系渐变（中心亮、边缘基础色）、6 色设计稿配色、白色描边
 * - 中心珊瑚渐变 GO 按钮（可点击，旋转中显示 …）
 * - 顶部圆头指针
 * - 动画：父组件控制 spinning/rotation，CSS transition 完成旋转
 */
export function RouletteWheel({
  labels,
  spinning,
  winnerIndex,
  rotation,
  onGoClick,
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
      const tx = cx + r * 0.62 * Math.cos(midRad);
      const ty = cy + r * 0.62 * Math.sin(midRad);
      const base = SLICE_COLORS[i % SLICE_COLORS.length];
      return {
        d,
        base,
        text: labels[i],
        tx,
        ty,
        midDeg,
        gradId: `wheel-grad-${i}`,
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

  const goR = 26;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* 顶部圆头指针 */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 z-10 -translate-x-1/2 flex flex-col items-center"
        style={{ top: -18 }}
      >
        <div
          className="rounded-full"
          style={{
            width: 9,
            height: 9,
            background: "hsl(var(--primary))",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }}
        />
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "14px solid hsl(var(--primary))",
            filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.25))",
          }}
        />
      </div>

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
        <defs>
          {/* 扇区同色系渐变：中心亮 → 边缘基础色（同小程序 lighten 0.4） */}
          {slices.map((s) => (
            <linearGradient
              key={s.gradId}
              id={s.gradId}
              gradientUnits="userSpaceOnUse"
              x1={cx}
              y1={cy}
              x2={s.tx}
              y2={s.ty}
            >
              <stop offset="0%" stopColor={lighten(s.base, 0.4)} />
              <stop offset="100%" stopColor={s.base} />
            </linearGradient>
          ))}
          {/* 中心 GO 珊瑚渐变 */}
          <linearGradient
            id="wheel-go-grad"
            gradientUnits="userSpaceOnUse"
            x1={cx - goR}
            y1={cy - goR}
            x2={cx + goR}
            y2={cy + goR}
          >
            <stop offset="0%" stopColor="#ff8c42" />
            <stop offset="100%" stopColor="#ff6b35" />
          </linearGradient>
        </defs>

        {slices.map((s, i) => (
          <g key={i}>
            <path
              d={s.d}
              fill={`url(#${s.gradId})`}
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
              fontWeight={700}
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

        {/* 中心 GO（同小程序：珊瑚渐变圆 + 白字，点击触发旋转） */}
        <g
          onClick={onGoClick}
          style={{
            cursor: onGoClick ? "pointer" : "default",
          }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={goR}
            fill="url(#wheel-go-grad)"
            stroke="white"
            strokeWidth={2}
            style={{
              filter: "drop-shadow(0 2px 6px rgba(255,107,53,0.45))",
            }}
          />
          <text
            x={cx}
            y={cy}
            fill="white"
            fontSize={16}
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {spinning ? "…" : "GO"}
          </text>
        </g>
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
