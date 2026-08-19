"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Users, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MapLauncher } from "@/components/common/MapLauncher";
import { AmapMap } from "./AmapMap";
import { formatRelativeTime } from "@/lib/utils";
import type { CircleCheckinPlace } from "@/types";

interface CircleMapViewProps {
  /** 圈子打卡聚合（脱敏：门店 + 打卡数 + 最近打卡时间） */
  places: CircleCheckinPlace[];
  center?: [number, number];
  zoom?: number;
}

/**
 * 圈子打卡地图：展示圈内聚餐关联的打卡门店聚合。
 * 门店标记带打卡数角标；点击弹窗展示门店详情（不暴露打卡人）。
 */
export function CircleMapView({
  places,
  center = [114.3054, 30.5931], // 默认武汉
  zoom = 11,
}: CircleMapViewProps) {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [map, setMap] = useState<any>(null);
  const [selected, setSelected] = useState<CircleCheckinPlace | null>(null);

  const handleReady = useCallback((instance: any) => {
    mapRef.current = instance;
    setMap(instance);
  }, []);

  const handleDestroy = useCallback(() => {
    markersRef.current = [];
    mapRef.current = null;
    setMap(null);
  }, []);

  useEffect(() => {
    if (!map) return;
    const AMap = window.AMap;

    const markers = places.map((place) => {
      const count = Number(place.checkin_count);
      const div = document.createElement("div");
      div.style.cssText =
        "position:relative;width:18px;height:18px;border-radius:50%;background:#378ADD;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);box-sizing:border-box;cursor:pointer";
      if (count > 1) {
        const badge = document.createElement("span");
        badge.textContent = String(count);
        badge.style.cssText =
          "position:absolute;top:-9px;right:-9px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:#E24B4A;color:#fff;font-size:10px;font-weight:600;line-height:16px;text-align:center;box-sizing:border-box";
        div.appendChild(badge);
      }
      const marker = new AMap.Marker({
        position: new AMap.LngLat(place.lng, place.lat),
        content: div,
        offset: new AMap.Pixel(-9, -9),
        title: place.name,
      });
      marker.on("click", () => setSelected(place));
      return marker;
    });

    map.add(markers);
    markersRef.current = markers;

    return () => {
      map.remove(markers);
      markersRef.current = [];
    };
  }, [map, places]);

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="relative h-[55dvh] overflow-hidden">
        <AmapMap
          center={center}
          zoom={zoom}
          onReady={handleReady}
          onDestroy={handleDestroy}
        />
      </div>

      <div className="mx-3 mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#378ADD]" />
          圈内打卡门店
        </span>
        <span className="flex items-center gap-1">
          <span className="relative inline-block h-2.5 w-2.5">
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-[#E24B4A] text-[7px] font-bold text-white">
              n
            </span>
          </span>
          打卡次数
        </span>
        <span className="ml-auto">{places.length} 家门店</span>
      </div>

      <div className="flex-1" />

      {/* 门店详情弹窗 */}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>门店打卡</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold leading-snug">
                  {selected.name}
                </h3>
                {selected.category ? (
                  <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {selected.category}
                  </span>
                ) : null}
              </div>

              {selected.address ? (
                <MapLauncher
                  name={selected.name}
                  address={selected.address}
                >
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="break-all">{selected.address}</span>
                  </span>
                </MapLauncher>
              ) : null}

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  圈内打卡 {selected.checkin_count} 次
                </span>
                {selected.last_checked_at ? (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    最近 {formatRelativeTime(selected.last_checked_at)}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 空态：无圈内打卡 */}
      {places.length === 0 ? (
        <div className="mx-3 mt-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-5 text-center">
          <p className="text-xs text-muted-foreground">
            圈子内还没有聚餐打卡记录
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
            成员在聚餐活动详情页点「去打卡」即可点亮门店
          </p>
        </div>
      ) : null}
    </div>
  );
}
