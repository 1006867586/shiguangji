"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- 高德地图实例无官方 TS 类型 */

import { useMemo, useState, useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  MapPin,
  Loader2,
  ChevronDown,
  Footprints,
  Filter,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckinMapView, type PlaceClickPayload } from "@/components/map/CheckinMapView";
import { PlaceMapOverlay } from "@/components/map/PlaceMapOverlay";
import { PlaceSearchBox } from "@/components/map/PlaceSearchBox";
import { CheckinSheet } from "@/components/map/CheckinSheet";
import { fetcher, fetchData } from "@/lib/fetcher";
import type { MapPlace } from "@/types";
import type { PoiCandidate } from "@/lib/poi/types";

// 城市文案统一带「市」，与高德 POI 返回的 cityname（如"武汉市"/"上海市"）保持一致，
// 否则 /api/map/places?city=武汉 会查不到 places.city = "武汉市" 的数据。
const CITIES = [
  "上海市",
  "北京市",
  "深圳市",
  "广州市",
  "杭州市",
  "成都市",
  "南京市",
  "武汉市",
  "西安市",
  "重庆市",
];

/** 地图页客户端主体：城市切换 + 搜索定位 + 打卡点地图 + 打卡/撤销 */
export function MapPage() {
  const [city, setCity] = useState("武汉市");
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [selectedScreenPos, setSelectedScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [sheetPlace, setSheetPlace] = useState<{
    name?: string | null;
    address?: string | null;
    city?: string | null;
    lng?: number | null;
    lat?: number | null;
  } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focus, setFocus] = useState<{ lng: number; lat: number } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  /** 品类筛选：空 = 全部 */
  const [category, setCategory] = useState<string>("");
  /** 只看未打卡 */
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);
  /** 附近查询结果（临时 marker，独立于当前城市 places） */
  const [nearby, setNearby] = useState<MapPlace[]>([]);

  const { data, isLoading, mutate } = useSWR<{ data: MapPlace[] }>(
    `/api/map/places?city=${encodeURIComponent(city)}${
      category ? `&category=${encodeURIComponent(category)}` : ""
    }`,
    fetcher,
    { revalidateOnFocus: false }
  );
  // 前端再做"只显示未打卡"过滤（避免请求里漏一个状态组合）
  const rawPlaces = data?.data ?? [];
  const places = onlyUnchecked
    ? rawPlaces.filter((p) => !p.i_checked)
    : rawPlaces;
  // 地图展示 = 当前城市 + 附近查询结果（去重）
  const displayPlaces = useMemo(() => {
    if (nearby.length === 0) return places;
    const ids = new Set(places.map((p) => p.id));
    const extra = nearby.filter((p) => !ids.has(p.id));
    return [...places, ...extra];
  }, [places, nearby]);

  // 当前城市所有品类（从已加载数据去重，前端动态枚举）
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of rawPlaces) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort();
  }, [rawPlaces]);

  const center = useMemo<[number, number]>(() => {
    // 各城市默认中心（GCJ-02 近似）；key 与上方 CITIES 同步带「市」
    const map: Record<string, [number, number]> = {
      上海市: [121.4737, 31.2304],
      北京市: [116.4074, 39.9042],
      深圳市: [114.0579, 22.5431],
      广州市: [113.2644, 23.1291],
      杭州市: [120.1551, 30.2741],
      成都市: [104.0665, 30.5723],
      南京市: [118.7969, 32.0603],
      武汉市: [114.3054, 30.5931],
      西安市: [108.9398, 34.3416],
      重庆市: [106.5516, 29.563],
    };
    return map[city] ?? [114.3054, 30.5931];
  }, [city]);

  const handleMapReady = useCallback((map: any) => {
    setMapInstance(map);
  }, []);

  // 地图空白点击：关闭浮层（不响应 marker 点击）
  const handleMapClick = useCallback(() => {
    setSelected(null);
    setSelectedScreenPos(null);
  }, []);

  const handlePlaceClick = useCallback((payload: PlaceClickPayload) => {
    setSelected(payload.place);
    setSelectedScreenPos(payload.screenPos);
  }, []);

  const handlePick = (c: PoiCandidate) => {
    setFocus({ lng: c.location.lng, lat: c.location.lat });
    setSheetPlace({
      name: c.name,
      address: c.address,
      city: c.city,
      lng: c.location.lng,
      lat: c.location.lat,
    });
    setSheetOpen(true);
  };

  const handleCheckin = (place: MapPlace) => {
    setSheetPlace({
      name: place.name,
      address: place.address,
      city: place.city,
      lng: place.lng,
      lat: place.lat,
    });
    setSheetOpen(true);
  };

  const closeOverlay = useCallback(() => {
    setSelected(null);
    setSelectedScreenPos(null);
  }, []);

  const handleRemove = async (place: MapPlace) => {
    if (!place.i_checkin_id) return;
    setRemovingId(place.id);
    try {
      await fetchData(`/api/map/checkins/${place.i_checkin_id}`, {
        method: "DELETE",
      });
      toast.success("已撤销打卡");
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "撤销失败");
    } finally {
      setRemovingId(null);
    }
  };

  // 附近查询：以当前选中 place 为中心，加载 500m 内的打卡点作为临时 marker
  const handleSearchNearby = async (center: MapPlace) => {
    try {
      const res = await fetchData<(MapPlace & { distance_m: number })[]>(
        `/api/map/places/nearby?lng=${center.lng}&lat=${center.lat}&radius=500&exclude_checked=true&city=${encodeURIComponent(city)}`
      );
      setNearby(res);
      toast.success(`附近 500m 找到 ${res.length} 家未打卡的店`);
      // 把地图中心平移到选中店
      setFocus({ lng: center.lng, lat: center.lat });
      // 选中点保持不变（用户能直接看到选中店 + 周围店）
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "附近查询失败");
    }
  };

  return (
    <div className="flex min-h-dvh flex-col pb-4">
      {/* 顶部：城市切换 + 搜索 + 足迹入口 */}
      <div className="space-y-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
            <h1 className="text-base font-semibold tracking-tight">
              美食打卡地图
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
              <Link href="/me/footprints">
                <Footprints className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                我的足迹
              </Link>
            </Button>
            <div className="relative">
              <select
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  // 切换城市时关闭浮层
                  closeOverlay();
                }}
                className="h-8 appearance-none rounded-lg border border-border bg-card pl-2.5 pr-7 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="切换城市"
              >
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
        <PlaceSearchBox city={city} onPick={handlePick} />
        {/* 筛选：品类 + 只看未打卡 */}
        {(availableCategories.length > 0 || rawPlaces.length > 0) && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Filter className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-7 rounded-md border border-border bg-card pl-2 pr-6 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="品类筛选"
            >
              <option value="">全部品类</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyUnchecked}
                onChange={(e) => setOnlyUnchecked(e.target.checked)}
                className="h-3 w-3 accent-primary"
              />
              只看未打卡
            </label>
          </div>
        )}
      </div>

      {/* 地图（relative 包裹以容纳浮层） */}
      <div
        className="relative mx-3 mt-3 h-[46dvh] overflow-hidden rounded-xl border border-border"
        onClick={handleMapClick}
      >
        <CheckinMapView
          places={displayPlaces}
          center={center}
          zoom={11}
          focusPoint={focus}
          onPlaceClick={handlePlaceClick}
          onMapReady={handleMapReady}
          showControls
        />
        {mapInstance && selected && selectedScreenPos ? (
          <PlaceMapOverlay
            place={selected}
            screenPos={selectedScreenPos}
            mapInstance={mapInstance}
            onClose={closeOverlay}
            onCheckin={handleCheckin}
            onRemoveCheckin={handleRemove}
            onSearchNearby={handleSearchNearby}
            removing={removingId === selected.id}
          />
        ) : null}
        {isLoading ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            加载打卡点…
          </div>
        ) : null}
      </div>

      {/* 图例 */}
      <div className="mx-3 mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#378ADD]" />
          未打卡
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#E24B4A]" />
          已打卡
        </span>
        <span className="ml-auto">共 {places.length} 个打卡点</span>
      </div>

      {/* 打卡表单 */}
      <CheckinSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        initialPlace={sheetPlace}
        onSuccess={() => {
          // 刷新当前城市打卡点；如果打开的浮层对应的 place 也变了，关闭它
          void mutate();
          closeOverlay();
        }}
      />
    </div>
  );
}