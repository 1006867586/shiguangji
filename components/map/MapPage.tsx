"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- 高德地图实例无官方 TS 类型 */

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  MapPin,
  Loader2,
  ChevronDown,
  Footprints,
  Filter,
  Plus,
  Minus,
  Crosshair,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckinMapView, type PlaceClickPayload } from "@/components/map/CheckinMapView";
import { PlaceMapOverlay } from "@/components/map/PlaceMapOverlay";
import { PlaceSearchBox } from "@/components/map/PlaceSearchBox";
import { CheckinSheet } from "@/components/map/CheckinSheet";
import { wgs84ToGcj02 } from "@/lib/poi/coords";
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
export function MapPage({ initialFocusId }: { initialFocusId?: string | null }) {
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
  /** 分享链接 ?focus=<id> 定位的打卡点 */
  const [focusedPlace, setFocusedPlace] = useState<MapPlace | null>(null);

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
  // 地图展示 = 当前城市 + 附近查询结果 + 分享定位点（去重）
  const displayPlaces = useMemo(() => {
    const ids = new Set(places.map((p) => p.id));
    const extra: MapPlace[] = [];
    for (const p of [...nearby, ...(focusedPlace ? [focusedPlace] : [])]) {
      if (!ids.has(p.id)) {
        ids.add(p.id);
        extra.push(p);
      }
    }
    return [...places, ...extra];
  }, [places, nearby, focusedPlace]);

  // 附近结果 id 集合：传给定 marker 画独立视觉（虚线呼吸框 + "附近"角标）
  const nearbyPlaceIds = useMemo(() => new Set(nearby.map((p) => p.id)), [nearby]);

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

  // 分享链接 ?focus=<id>：拉取该打卡点 → 同步城市、置中、打开浮层
  const handledFocusRef = useRef(false);
  useEffect(() => {
    if (!initialFocusId || handledFocusRef.current) return;
    handledFocusRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const place = await fetchData<MapPlace>(
          `/api/map/places/${encodeURIComponent(initialFocusId)}`
        );
        if (cancelled) return;
        setFocusedPlace(place);
        // 同步城市选择器（仅当该城市在可选项内，避免 select value 不匹配）
        if (place.city && CITIES.includes(place.city)) setCity(place.city);
        setFocus({ lng: place.lng, lat: place.lat });
      } catch {
        // 地点不存在或已下架：静默忽略，回到默认地图
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialFocusId]);

  // 地图就绪 + 分享点加载完成 → 计算屏幕坐标并打开浮层
  useEffect(() => {
    if (!mapInstance || !focusedPlace) return;
    const px = mapInstance.lngLatToContainer?.([focusedPlace.lng, focusedPlace.lat]);
    if (!px || px.x == null || px.y == null) return;
    setSelected(focusedPlace);
    setSelectedScreenPos({ x: px.x, y: px.y });
  }, [mapInstance, focusedPlace]);

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

  // 附近查询：以当前选中 place 为中心，加载 500m 内的打卡点作为临时 marker。
  // city 用选中店所属城市（而非全局 select 城市），避免城市不一致时查不到店。
  const handleSearchNearby = async (center: MapPlace) => {
    try {
      const res = await fetchData<(MapPlace & { distance_m: number })[]>(
        `/api/map/places/nearby?lng=${center.lng}&lat=${center.lat}&radius=500&exclude_checked=true&city=${encodeURIComponent(center.city ?? city)}`
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
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden bg-muted/30">
      {/* 全屏地图（沉浸式，铺满可视区） */}
      <CheckinMapView
        places={displayPlaces}
        center={center}
        zoom={11}
        focusPoint={focus}
        nearbyPlaceIds={nearbyPlaceIds}
        onPlaceClick={handlePlaceClick}
        onMapReady={handleMapReady}
        onMapClick={handleMapClick}
        className="h-full w-full"
      />

      {/* 顶部悬浮控制（pointer-events 仅在控件上，空隙透传给地图拖动） */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-card/85 px-3 py-2 shadow-sm backdrop-blur-md">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
            <h1 className="whitespace-nowrap text-sm font-semibold tracking-tight">
              美食打卡地图
            </h1>
          </div>
          <div className="relative">
            <select
              value={city}
              onChange={(e) => {
                const next = e.target.value;
                setCity(next);
                // 切换城市时关闭浮层，并清空仅属于旧城市的附近查询结果，
                // 避免旧城市标记残留到新城市地图上
                closeOverlay();
                setNearby([]);
                setFocusedPlace(null);
              }}
              className="h-9 appearance-none rounded-xl border border-border/70 bg-card/85 pl-2.5 pr-7 text-xs font-medium shadow-sm outline-none backdrop-blur-md focus-visible:ring-2 focus-visible:ring-ring"
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
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-9 border border-border/70 bg-card/85 px-2.5 text-xs shadow-sm backdrop-blur-md"
          >
            <Link href="/me/footprints">
              <Footprints className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              我的足迹
            </Link>
          </Button>
        </div>

        <div className="pointer-events-auto">
          <PlaceSearchBox city={city} onPick={handlePick} />
        </div>

        {/* 筛选：品类 + 只看未打卡 + 图例 */}
        {(availableCategories.length > 0 || rawPlaces.length > 0) && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-border/70 bg-card/85 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur-md">
            <Filter className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-7 rounded-md border border-border bg-card pl-2 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <span className="ml-auto inline-flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[hsl(var(--chart-2))]" />
                未打卡
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[hsl(var(--chart-1))]" />
                已打卡
              </span>
              <span>
                {onlyUnchecked
                  ? `未打卡 ${places.length}/${rawPlaces.length}`
                  : `共 ${rawPlaces.length} 个`}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* 右下角：缩放 + GPS 定位 */}
      {mapInstance ? <MapFloatingControls map={mapInstance} /> : null}

      {isLoading ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/50 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          加载打卡点…
        </div>
      ) : null}

      {/* 地点浮层 */}
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

/**
 * 地图右下角浮动控件：缩放 与 GPS 定位。
 * 沉浸式布局下不再使用 AmapMap 内置的右上角控件，改为悬浮于右下角，
 * 避免与顶部搜索/筛选占位冲突。
 */
function MapFloatingControls({ map }: { map: any }) {
  const handleZoomIn = () => map?.zoomIn();
  const handleZoomOut = () => map?.zoomOut();
  const handleLocate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("当前环境不支持定位");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // 浏览器定位返回 WGS84，高德地图渲染 GCJ-02；需先转坐标，否则偏差可达数百米
        const gcj = wgs84ToGcj02(pos.coords.longitude, pos.coords.latitude);
        map?.setCenter([gcj.lng, gcj.lat]);
        map?.setZoom(14);
      },
      (err) => {
        toast.error(`定位失败：${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };
  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-10 flex flex-col gap-0.5 overflow-hidden rounded-xl border border-border/70 bg-card/90 p-1 shadow-md backdrop-blur-md">
      <button
        type="button"
        onClick={handleZoomIn}
        aria-label="放大"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-muted"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="mx-1 h-px bg-border" />
      <button
        type="button"
        onClick={handleZoomOut}
        aria-label="缩小"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-muted"
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="mx-1 h-px bg-border" />
      <button
        type="button"
        onClick={handleLocate}
        aria-label="定位"
        title="定位到当前位置"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-muted"
      >
        <Crosshair className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}