"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- 高德 JS API 无官方 TS 类型定义 */

import { useEffect, useState, useRef } from "react";
import { X, MapPinned, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapLauncher } from "@/components/common/MapLauncher";
import { MapPin } from "lucide-react";
import type { MapPlace } from "@/types";

interface PlaceMapOverlayProps {
  place: MapPlace;
  /** marker 在地图容器中的初始像素坐标 */
  screenPos: { x: number; y: number };
  /** 高德地图实例（用于订阅 move/zoom/resize 重算位置） */
  mapInstance: any;
  onClose: () => void;
  onCheckin?: (place: MapPlace) => void;
  onRemoveCheckin?: (place: MapPlace) => void;
  removing?: boolean;
}

const CARD_WIDTH = 280; // 浮层卡片宽度
const CARD_MARGIN = 12; // 距 marker 的最小间距
const ANCHOR_OFFSET_Y = -28; // 浮层顶部尖角指向 marker 上方

/**
 * 地图内嵌卡片浮层：从 marker 位置"长出"。
 * - PC 端：浮在 marker 上方，水平居中
 * - 移动端：底部抽屉式（避免遮挡地图中心）
 */
export function PlaceMapOverlay({
  place,
  screenPos,
  mapInstance,
  onClose,
  onCheckin,
  onRemoveCheckin,
  removing,
}: PlaceMapOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [isMobile, setIsMobile] = useState(false);

  // 检测移动端（< 640px）
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  // 计算浮层位置：marker 上方居中，靠近视口边界时翻转/对齐
  useEffect(() => {
    if (!mapInstance) return;
    const update = () => {
      const container = mapInstance.getContainer();
      const mapSize = mapInstance.getSize();
      const w = CARD_WIDTH;
      const h = containerRef.current?.offsetHeight ?? 220;

      if (isMobile) {
        // 移动端：底部抽屉
        setPos({
          left: 0,
          top: mapSize.height - h,
        });
        return;
      }

      // PC：根据 marker 屏幕坐标定位（marker 自身已经被 CheckinMapView 算过）
      // 上方优先；若上方空间不够则放到 marker 下方
      const preferTop = screenPos.y + ANCHOR_OFFSET_Y - h;
      const finalTop = preferTop >= CARD_MARGIN ? preferTop : screenPos.y + CARD_MARGIN + 28;
      // 水平居中 + 边界保护
      let left = screenPos.x - w / 2;
      const maxLeft = mapSize.width - w - CARD_MARGIN;
      left = Math.max(CARD_MARGIN, Math.min(left, maxLeft));
      setPos({ left, top: finalTop });
    };
    update();
    mapInstance.on("move", update);
    mapInstance.on("zoom", update);
    mapInstance.on("resize", update);
    return () => {
      mapInstance.off("move", update);
      mapInstance.off("zoom", update);
      mapInstance.off("resize", update);
    };
  }, [mapInstance, screenPos.x, screenPos.y, isMobile]);

  const checked = Boolean(place.i_checked);

  return (
    <div
      ref={containerRef}
      // 浮层不拦截地图事件（pointer-events 只命中关闭按钮和卡片本身）
      className="pointer-events-none absolute z-50"
      style={{
        left: `${pos.left}px`,
        top: `${pos.top}px`,
        width: isMobile ? "100%" : `${CARD_WIDTH}px`,
      }}
    >
      <div className="pointer-events-auto relative rounded-xl border border-border bg-card p-3 shadow-lg">
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <div className="space-y-2.5 pr-6">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold leading-snug">{place.name}</h3>
              {checked ? (
                <Badge
                  variant="default"
                  className="shrink-0 bg-red-500/10 text-red-600 hover:bg-red-500/10"
                >
                  <Check className="mr-0.5 h-3 w-3" aria-hidden="true" />
                  已打卡
                </Badge>
              ) : null}
            </div>
            {place.category ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {place.category}
              </p>
            ) : null}
          </div>

          {place.address ? (
            <MapLauncher name={place.name} address={place.address} city={place.city}>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="break-all">{place.address}</span>
              </span>
            </MapLauncher>
          ) : null}

          <div className="flex gap-2 pt-1">
            {checked ? (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs"
                disabled={removing}
                onClick={() => onRemoveCheckin?.(place)}
              >
                {removing ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                )}
                撤销打卡
              </Button>
            ) : (
              <Button
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={() => onCheckin?.(place)}
              >
                <MapPinned className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                去打卡
              </Button>
            )}
          </div>
        </div>

        {/* PC 端：浮层顶部尖角（指向 marker） */}
        {!isMobile && pos.top < screenPos.y ? (
          <div
            aria-hidden="true"
            className="absolute -top-2 h-3 w-3 rotate-45 border-l border-t border-border bg-card"
            style={{
              left: Math.max(12, Math.min(CARD_WIDTH - 12, screenPos.x - pos.left) - 6),
            }}
          />
        ) : null}
        {!isMobile && pos.top >= screenPos.y ? (
          <div
            aria-hidden="true"
            className="absolute -bottom-2 h-3 w-3 -rotate-45 border-r border-b border-border bg-card"
            style={{
              left: Math.max(12, Math.min(CARD_WIDTH - 12, screenPos.x - pos.left) - 6),
            }}
          />
        ) : null}
      </div>
    </div>
  );
}