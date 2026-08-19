"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- 高德地图实例无官方 TS 类型定义 */

import { useEffect, useState, useRef } from "react";
import {
  X,
  MapPinned,
  Check,
  Loader2,
  Navigation,
  Share2,
  Bookmark,
  BookmarkCheck,
  Compass,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapLauncher } from "@/components/common/MapLauncher";
import { MapPin } from "lucide-react";
import { fetchData } from "@/lib/fetcher";
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
  /** 触发附近查询的回调（MapPage 调 /api/map/places/nearby 并在地图上画临时 marker） */
  onSearchNearby?: (place: MapPlace) => void;
  removing?: boolean;
}

const CARD_WIDTH = 280;
const CARD_MARGIN = 12;
const ANCHOR_OFFSET_Y = -28;

/**
 * 地图内嵌卡片浮层：从 marker 位置"长出"。
 * - PC 端：浮在 marker 上方，水平居中
 * - 移动端：底部抽屉式（避免遮挡地图中心）
 *
 * 按钮：
 * - 导航：唤起高德/百度 App（复用 MapLauncher）
 * - 分享：复制地图链接（含 place.id）到剪贴板 / 调 native share
 * - 收藏：调 /api/favorite-places 加到我的收藏
 * - 去打卡 / 撤销打卡：原 onCheckin / onRemoveCheckin
 */
export function PlaceMapOverlay({
  place,
  screenPos,
  mapInstance,
  onClose,
  onCheckin,
  onRemoveCheckin,
  onSearchNearby,
  removing,
}: PlaceMapOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [favoriting, setFavoriting] = useState(false);
  const [favorited, setFavorited] = useState(false);

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
      const mapSize = mapInstance.getSize();
      const w = CARD_WIDTH;
      const h = containerRef.current?.offsetHeight ?? 240;

      if (isMobile) {
        setPos({
          left: 0,
          top: mapSize.height - h,
        });
        return;
      }

      const preferTop = screenPos.y + ANCHOR_OFFSET_Y - h;
      const finalTop =
        preferTop >= CARD_MARGIN ? preferTop : screenPos.y + CARD_MARGIN + 28;
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

  // 分享：优先 navigator.share（移动端 native），降级为剪贴板复制
  const handleShare = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/map?focus=${place.id}`
        : `/map?focus=${place.id}`;
    const text = `我在「${place.name}」打了个卡，推荐给你`;
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({ title: place.name, text, url });
        return;
      }
      // 降级：复制到剪贴板
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast.success("链接已复制到剪贴板");
      } else {
        toast.info(url);
      }
    } catch (err) {
      // 用户取消分享时不报错
      if (err instanceof Error && err.name !== "AbortError") {
        toast.error(err.message || "分享失败");
      }
    }
  };

  // 收藏：调 /api/favorite-places（单店变体）
  const handleFavorite = async () => {
    if (favoriting || favorited) return;
    setFavoriting(true);
    try {
      await fetchData("/api/favorite-places", {
        method: "POST",
        body: JSON.stringify({
          platform: "manual",
          city: place.city ?? undefined,
          places: [
            {
              title: place.name,
              address: place.address ?? null,
              category: place.category ?? null,
              // 当前 API 不收 lng/lat；places 表与 favorite_places 表解耦
              // （迁移 019 已为 favorite_places 加 lng/lat 字段，后续可扩展）
            },
          ],
        }),
      });
      setFavorited(true);
      toast.success("已加入收藏");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "收藏失败");
    } finally {
      setFavoriting(false);
    }
  };

  const checked = Boolean(place.i_checked);

  return (
    <div
      ref={containerRef}
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

          {/* 主操作：打卡 / 撤销打卡 */}
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

          {/* 次操作：导航 / 分享 / 收藏 */}
          <div className="flex gap-2">
            <MapLauncher
              name={place.name}
              address={place.address}
              city={place.city}
            >
              <button
                type="button"
                aria-label="导航"
                className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Navigation className="h-3 w-3" aria-hidden="true" />
                导航
              </button>
            </MapLauncher>
            <button
              type="button"
              onClick={handleShare}
              aria-label="分享"
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Share2 className="h-3 w-3" aria-hidden="true" />
              分享
            </button>
            <button
              type="button"
              onClick={handleFavorite}
              disabled={favoriting || favorited}
              aria-label="收藏"
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60"
            >
              {favoriting ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : favorited ? (
                <BookmarkCheck className="h-3 w-3 text-primary" aria-hidden="true" />
              ) : (
                <Bookmark className="h-3 w-3" aria-hidden="true" />
              )}
              {favorited ? "已收藏" : "收藏"}
            </button>
          </div>

          {/* 附近 500m 探索 */}
          {onSearchNearby ? (
            <button
              type="button"
              onClick={() => onSearchNearby(place)}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border bg-background/50 px-2 py-1.5 text-[11px] text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-foreground"
            >
              <Compass className="h-3 w-3" aria-hidden="true" />
              查看附近 500m 的店
            </button>
          ) : null}
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