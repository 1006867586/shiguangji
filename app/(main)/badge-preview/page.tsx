import Link from "next/link";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BadgeSticker } from "@/components/decor/BadgeSticker";

export const metadata = { title: "徽章预览（v3 demo）" };

/**
 * v3 复古贴纸徽章的最小预览页。
 * 用于内部验收：展示单枚徽章在 20/40/64/128 px 下的渲染，
 * 以及 common / rare / epic 三档稀有度差异。
 *
 * 仅 demo，正式上线前删除。
 */
export default function BadgePreviewPage() {
  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href="/" aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
            <Sparkles className="h-5 w-5 text-primary" />
            徽章预览（v3 demo）
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
        <section className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-xs text-muted-foreground">
          临时 demo 页（仅内部验收用）。
          完整落地后会把这个页面换成正式文档站 / 删除。
        </section>

        {/* 多尺寸对比：单枚徽章 */}
        <section className="space-y-3">
          <h2 className="font-display text-base font-semibold">
            多尺寸 · 昵称侧栏 → 装扮面板
          </h2>
          <p className="text-xs text-muted-foreground">
            单枚 <code className="font-mono">badge_hotpot</code>，
            4 个尺寸下渲染表现。
          </p>
          <div className="flex flex-wrap items-end gap-6 rounded-xl border border-border/60 bg-card p-6">
            {[
              { size: 20, cls: "h-5 w-5" },
              { size: 40, cls: "h-10 w-10" },
              { size: 64, cls: "h-16 w-16" },
              { size: 128, cls: "h-32 w-32" },
            ].map(({ size, cls }) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <BadgeSticker
                  badgeKey="badge_hotpot"
                  rarity="common"
                  name="火锅信徒"
                  color="#ef4444"
                  className={cls}
                />
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {size}px
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 三档稀有度对比 */}
        <section className="space-y-3">
          <h2 className="font-display text-base font-semibold">
            三档稀有度 · common / rare / epic
          </h2>
          <p className="text-xs text-muted-foreground">
            epic 档在用户开启 reduced-motion 时停止旋转（参见 globals.css）。
          </p>
          <div className="flex flex-wrap items-center gap-8 rounded-xl border border-border/60 bg-card p-6">
            {(
              [
                { rarity: "common" as const, label: "common", desc: "无装饰" },
                { rarity: "rare" as const, label: "rare", desc: "金色描边" },
                { rarity: "epic" as const, label: "epic", desc: "金描边 + 旋转光环" },
              ]
            ).map((r) => (
              <div key={r.rarity} className="flex flex-col items-center gap-2">
                <BadgeSticker
                  badgeKey="badge_hotpot"
                  rarity={r.rarity}
                  name={`火锅信徒（${r.label}）`}
                  color="#ef4444"
                  className="h-16 w-16"
                />
                <span className="text-xs font-semibold">{r.label}</span>
                <span className="text-[10px] text-muted-foreground">
                  {r.desc}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 兜底验证：故意加载失败 */}
        <section className="space-y-3">
          <h2 className="font-display text-base font-semibold">
            加载失败兜底
          </h2>
          <p className="text-xs text-muted-foreground">
            资源不存在时（key 是 <code className="font-mono">badge_does_not_exist</code>），
            应渲染主题色圆形，不破坏布局。
          </p>
          <div className="flex items-center gap-6 rounded-xl border border-border/60 bg-card p-6">
            <BadgeSticker
              badgeKey="badge_does_not_exist"
              rarity="common"
              name="不存在的徽章"
              color="#ec4899"
              className="h-16 w-16"
            />
            <span className="text-xs text-muted-foreground">
              ← 主题色圆形兜底
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
