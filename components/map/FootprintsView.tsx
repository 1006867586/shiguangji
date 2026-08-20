"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  MapPin,
  Loader2,
  ChevronLeft,
  Trash2,
  ArrowDown,
  CalendarDays,
  ImageIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckinMapView } from "@/components/map/CheckinMapView";
import { PlaceCard } from "@/components/map/PlaceCard";
import { PosterPreviewDialog } from "@/components/map/PosterPreviewDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { fetcher, fetchData } from "@/lib/fetcher";
import { formatRelativeTime } from "@/lib/utils";
import type { Checkin, MapPlace } from "@/types";

interface CheckinPage {
  data: Checkin[];
  next_cursor: string | null;
}

function toMapPlace(c: Checkin): MapPlace | undefined {
  if (!c.place) return undefined;
  return {
    ...c.place,
    i_checked: true,
    i_checkin_id: c.id,
  };
}

/** 我的足迹：地图打点 + 打卡时间线 + 撤销 */
export function FootprintsView() {
  const [selected, setSelected] = useState<Checkin | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);

  const { data, isLoading, mutate } = useSWR<CheckinPage>(
    "/api/map/checkins/me?limit=20",
    fetcher,
    { revalidateOnFocus: false }
  );

  // 稳定引用，避免下游 useMemo 的依赖在每次渲染时变化
  const checkins = useMemo(() => data?.data ?? [], [data]);

  const places = useMemo(
    () =>
      checkins
        .map(toMapPlace)
        .filter((p): p is MapPlace => Boolean(p)),
    [checkins]
  );

  const handleRemove = async (checkin: Checkin) => {
    setRemovingId(checkin.id);
    try {
      await fetchData(`/api/map/checkins/${checkin.id}`, { method: "DELETE" });
      toast.success("已撤销打卡");
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "撤销失败");
    } finally {
      setRemovingId(null);
    }
  };

  const handleLoadMore = async () => {
    if (!data?.next_cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchData<CheckinPage>(
        `/api/map/checkins/me?limit=20&cursor=${encodeURIComponent(
          data.next_cursor
        )}`
      );
      await mutate(
        { data: [...checkins, ...more.data], next_cursor: more.next_cursor },
        { revalidate: false }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href="/map" aria-label="返回地图">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            我的足迹
          </h1>
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {checkins.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-8 text-xs"
            disabled={checkins.length === 0}
            onClick={() => setPosterOpen(true)}
          >
            <ImageIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            生成海报
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-20 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          加载中…
        </div>
      ) : checkins.length === 0 ? (
        <div className="py-16">
          <EmptyState
            icon={<MapPin className="h-8 w-8" />}
            title="还没有打卡记录"
            description="去美食地图上打一次卡，点亮你的足迹吧"
            action={
              <Button asChild size="sm">
                <Link href="/map">去打卡</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* 足迹地图 */}
          <div className="mx-3 mt-3 h-[40dvh] overflow-hidden rounded-xl border border-border">
            <CheckinMapView
              places={places}
              zoom={10}
              onPlaceClick={(payload) => {
                const checkin = checkins.find((c) => c.id === payload.place.i_checkin_id);
                if (checkin) setSelected(checkin);
              }}
            />
          </div>

          {/* 时间线 */}
          <div className="mx-3 mt-4 space-y-2 pb-20">
            <h2 className="px-1 text-xs font-medium text-muted-foreground">
              打卡记录
            </h2>
            {checkins.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-border/70 bg-card p-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">{c.place?.name ?? "未知地点"}</span>
                    </p>
                    {c.place?.address ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {c.place.address}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={removingId === c.id}
                    onClick={() => handleRemove(c)}
                    aria-label="撤销打卡"
                  >
                    {removingId === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" aria-hidden="true" />
                    {formatRelativeTime(c.checked_at)}
                  </span>
                  {c.activity ? <span>关联聚餐</span> : null}
                  {c.place?.category ? (
                    <span className="rounded bg-muted px-1 py-0.5">
                      {c.place.category}
                    </span>
                  ) : null}
                </div>
                {c.note ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">{c.note}</p>
                ) : null}
              </div>
            ))}

            {data?.next_cursor ? (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={handleLoadMore}
                >
                  {loadingMore ? (
                    <Loader2
                      className="mr-1 h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowDown className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  加载更多
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}

      {/* 打卡记录弹窗（地图标记点击） */}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>打卡详情</DialogTitle>
          </DialogHeader>
          {selected?.place ? (
            <PlaceCard
              place={{ ...selected.place, i_checked: true, i_checkin_id: selected.id }}
              onRemoveCheckin={async () => {
                await handleRemove(selected);
                setSelected(null);
              }}
              removing={removingId === selected.id}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 我的打卡海报 */}
      <PosterPreviewDialog
        open={posterOpen}
        onOpenChange={setPosterOpen}
        type="footprints"
      />
    </div>
  );
}
