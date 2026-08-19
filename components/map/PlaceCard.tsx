"use client";

import { MapPin, Check, Loader2, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapLauncher } from "@/components/common/MapLauncher";
import type { MapPlace } from "@/types";

interface PlaceCardProps {
  place: MapPlace;
  /** 打开打卡表单 */
  onCheckin?: (place: MapPlace) => void;
  /** 撤销打卡 */
  onRemoveCheckin?: (place: MapPlace) => void;
  removing?: boolean;
}

/** 地图弹窗中的地点卡片：信息 + 打卡/撤销 + 导航 */
export function PlaceCard({
  place,
  onCheckin,
  onRemoveCheckin,
  removing,
}: PlaceCardProps) {
  const checked = Boolean(place.i_checked);

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-snug">{place.name}</h3>
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
          <p className="mt-1 text-xs text-muted-foreground">{place.category}</p>
        ) : null}
      </div>

      {place.address ? (
        <MapLauncher name={place.name} address={place.address} city={place.city}>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
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
            className="flex-1"
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
          <Button size="sm" className="flex-1" onClick={() => onCheckin?.(place)}>
            <MapPinned className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            去打卡
          </Button>
        )}
      </div>
    </div>
  );
}
