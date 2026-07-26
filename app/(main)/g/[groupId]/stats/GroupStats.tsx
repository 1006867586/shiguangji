"use client";

import { useEffect, useState } from "react";
import {
  Download,
  Loader2,
  Star,
  UtensilsCrossed,
  MessageCircle,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/common/UserAvatar";
import { fetchData } from "@/lib/fetcher";
import { formatRelativeTime } from "@/lib/utils";

/** 餐厅统计项 */
interface RestaurantStat {
  title: string;
  count: number;
  last_visited_at: string;
  platform?: string | null;
  address?: string | null;
}

/** 月度统计项 */
interface MonthlyCount {
  month: string; // YYYY-MM
  count: number;
}

/** 贡献者统计项 */
interface ContributorStat {
  user_id: string;
  activity_count: number;
  profile: {
    id: string;
    nickname: string;
    avatar_url: string | null;
  } | null;
}

/** /api/groups/[id]/stats 返回的数据 */
interface GroupStatsData {
  total_activities: number;
  total_photos: number;
  total_comments: number;
  top_restaurants: RestaurantStat[];
  monthly_counts: MonthlyCount[];
  top_contributors: ContributorStat[];
  avg_rating: number;
  total_spent: number; // 单位:分
}

const PLATFORM_LABEL: Record<string, string> = {
  dianping: "点评",
  meituan: "美团",
  other: "其他",
};

/** 将分格式化为 ¥XX.XX */
function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

interface GroupStatsProps {
  groupId: string;
}

/**
 * GroupStats — 客户端统计页。
 * 调用 /api/groups/[id]/stats 拉取数据并展示；提供 JSON 导出。
 */
export function GroupStats({ groupId }: GroupStatsProps) {
  const [data, setData] = useState<GroupStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchData<GroupStatsData>(`/api/groups/${groupId}/stats`)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/export`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `导出失败 (${res.status})`);
      }
      const blob = await res.blob();
      // 从 content-disposition 解析文件名（优先 filename*）
      const disposition = res.headers.get("content-disposition") ?? "";
      let filename = `group-${groupId}.json`;
      const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const plain = disposition.match(/filename="([^"]+)"/i);
      if (star) {
        try {
          filename = decodeURIComponent(star[1]);
        } catch {
          filename = star[1];
        }
      } else if (plain) {
        filename = plain[1];
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("已导出数据");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        {error ?? "加载失败"}
      </div>
    );
  }

  const maxMonthly = Math.max(
    1,
    ...data.monthly_counts.map((m) => m.count)
  );

  return (
    <div className="space-y-4 p-4">
      {/* 顶部三个数字卡片 */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          icon={<UtensilsCrossed className="h-4 w-4" />}
          label="活动"
          value={data.total_activities}
        />
        <StatCard
          icon={<Camera className="h-4 w-4" />}
          label="照片"
          value={data.total_photos}
        />
        <StatCard
          icon={<MessageCircle className="h-4 w-4" />}
          label="评论"
          value={data.total_comments}
        />
      </div>

      {/* 平均评分 + 总消费 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">平均评分</div>
          <div className="mt-1 flex items-end gap-1">
            <span className="text-2xl font-semibold tabular-nums">
              {data.avg_rating.toFixed(1)}
            </span>
            <div className="mb-1 flex items-center">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={
                    i < Math.round(data.avg_rating)
                      ? "h-3.5 w-3.5 fill-current text-amber-400"
                      : "h-3.5 w-3.5 text-muted-foreground/40"
                  }
                />
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">总消费</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {formatYuan(data.total_spent)}
          </div>
        </div>
      </div>

      {/* 最常去的店 */}
      <Section title="最常去的店">
        {data.top_restaurants.length === 0 ? (
          <EmptyHint>暂无店铺数据</EmptyHint>
        ) : (
          <ul className="divide-y divide-border">
            {data.top_restaurants.map((r) => (
              <li
                key={r.title}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {r.title}
                    </span>
                    {r.platform ? (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {PLATFORM_LABEL[r.platform] ?? r.platform}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    去过 {r.count} 次 · 最近 {formatRelativeTime(r.last_visited_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 月度趋势 */}
      <Section title="月度趋势（近 12 个月）">
        <div className="flex h-32 items-end gap-1.5">
          {data.monthly_counts.map((m) => (
            <div
              key={m.month}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${m.month}：${m.count} 次`}
            >
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{
                    height: `${Math.max(
                      4,
                      Math.round((m.count / maxMonthly) * 100)
                    )}%`,
                  }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {m.month.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* 最活跃成员 */}
      <Section title="最活跃成员">
        {data.top_contributors.length === 0 ? (
          <EmptyHint>暂无成员数据</EmptyHint>
        ) : (
          <ul className="space-y-2">
            {data.top_contributors.map((c, idx) => (
              <li
                key={c.user_id}
                className="flex items-center gap-3 rounded-lg px-1 py-1.5"
              >
                <span className="w-5 text-center text-xs font-semibold text-muted-foreground tabular-nums">
                  {idx + 1}
                </span>
                <UserAvatar profile={c.profile ?? undefined} size={36} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {c.profile?.nickname ?? "未知用户"}
                </span>
                <Badge variant="outline" className="tabular-nums">
                  {c.activity_count} 条
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 导出数据 */}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleExport}
        disabled={exporting}
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        导出数据（JSON）
      </Button>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-4 text-center text-xs text-muted-foreground">{children}</p>
  );
}
