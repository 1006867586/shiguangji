"use client";

import { Coins, Flame, UtensilsCrossed, Trophy } from "lucide-react";
import type {
  Achievement,
  AchievementRuleType,
  UserGamification,
} from "@/types";

interface Props {
  gamification: UserGamification | null;
  achievements: Achievement[];
}

/** 各规则类型对应「还差 X 顿/天/个」的单位文案 */
const RULE_UNIT: Record<AchievementRuleType, string> = {
  meals_this_week: "顿",
  total_meals: "顿",
  streak: "天",
  circles_joined: "个圈子",
  activities_created: "个",
};

function currentValue(rule: AchievementRuleType, g: UserGamification | null): number {
  if (!g) return 0;
  switch (rule) {
    case "meals_this_week":
      return g.meals_this_week;
    case "total_meals":
      return g.total_meals;
    case "streak":
      return g.streak_count;
    case "circles_joined":
      return g.circles_joined;
    case "activities_created":
      return g.activities_created;
  }
}

export function AchievementsPanel({ gamification, achievements }: Props) {
  const stats = [
    {
      icon: <Coins className="h-5 w-5 text-amber-500" />,
      label: "积分",
      value: gamification?.points ?? 0,
    },
    {
      icon: <Flame className="h-5 w-5 text-orange-500" />,
      label: "连续打卡",
      value: `${gamification?.streak_count ?? 0} 天`,
    },
    {
      icon: <UtensilsCrossed className="h-5 w-5 text-primary" />,
      label: "本周吃了",
      value: `${gamification?.meals_this_week ?? 0} 顿`,
    },
  ];

  return (
    <div className="mt-2 border-t border-border/60 p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
        <Trophy className="h-4 w-4 text-primary" />
        成就 &amp; 积分
      </h2>

      {/* 概览数字 */}
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border/70 bg-card px-2 py-3 text-center shadow-xs"
          >
            <div className="mb-1 flex justify-center">{s.icon}</div>
            <p className="text-base font-bold tabular-nums">{s.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 徽章网格 */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {achievements.map((a) => {
          const cur = currentValue(a.rule_type, gamification);
          const remaining = a.threshold - cur;
          return (
            <div
              key={a.id}
              className={
                "rounded-xl border px-3 py-2.5 transition-colors " +
                (a.unlocked
                  ? "border-primary/40 bg-primary/10"
                  : "border-border/70 bg-card opacity-80")
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className={
                    "text-xl leading-none " + (a.unlocked ? "" : "grayscale opacity-50")
                  }
                  aria-hidden="true"
                >
                  {a.icon}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{a.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {a.unlocked
                      ? "已获得"
                      : `还差 ${Math.max(remaining, 0)} ${RULE_UNIT[a.rule_type]}`}
                  </p>
                </div>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                {a.description}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        参加聚餐计为打卡 · 发动态、加入圈子也累计积分
      </p>
    </div>
  );
}
