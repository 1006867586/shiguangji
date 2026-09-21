"use client";

import { useMemo } from "react";
import { ScrollText, Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getFoodAlmanac } from "@/lib/food-almanac";

/**
 * FoodAlmanacCard — 美食黄历卡片。
 *
 * 参照开源项目 qddidi/vue3-calendar 的黄历形态：展示真实农历/干支/生肖，
 * 再把「宜/忌」换成美食主题，由 getFoodAlmanac 按日期确定性生成。
 * 同一天刷新结果不变，方便截图与「今天吃什么」联动。
 */
export function FoodAlmanacCard() {
  // 只在首次渲染时取一次，避免跨天时中间态闪烁
  const almanac = useMemo(() => getFoodAlmanac(), []);

  return (
    <Card className="overflow-hidden border-amber-200/70 bg-gradient-to-br from-amber-50 via-background to-orange-50/60 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:via-background dark:to-orange-950/20">
      {/* 顶栏：标题 + 日期信息 */}
      <div className="border-b border-amber-200/50 px-4 py-3 dark:border-amber-900/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ScrollText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h2 className="font-display text-sm font-semibold tracking-tight">
              今日美食黄历
            </h2>
          </div>
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-300">
            {almanac.dayAnimal}日
          </span>
        </div>
        <p className="mt-1.5 text-lg font-semibold tracking-tight">
          {almanac.lunarLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          {almanac.solarLabel} · {almanac.ganzhiLabel}
        </p>
      </div>

      {/* 宜 / 忌 */}
      <div className="grid grid-cols-2 gap-px bg-amber-200/40 dark:bg-amber-900/30">
        <section className="bg-card/80 p-4" aria-label="今日宜食">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" /> 宜食
          </h3>
          <ul className="mt-2.5 space-y-2">
            {almanac.yi.map((entry) => (
              <li key={entry.text}>
                <p className="text-sm font-medium">宜·{entry.text}</p>
                {entry.hint ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {entry.hint}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card/80 p-4" aria-label="今日忌食">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-rose-600 dark:text-rose-400">
            <X className="h-4 w-4" /> 忌食
          </h3>
          <ul className="mt-2.5 space-y-2">
            {almanac.ji.map((entry) => (
              <li key={entry.text}>
                <p className="text-sm font-medium">忌·{entry.text}</p>
                {entry.hint ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {entry.hint}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 今日运势提示 */}
      <div className="flex items-center gap-2 border-t border-amber-200/50 px-4 py-2.5 dark:border-amber-900/30">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500")} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {almanac.note}
        </p>
      </div>
    </Card>
  );
}