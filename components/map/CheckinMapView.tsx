"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- 高德 JS API 无官方 TS 类型定义 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AmapMap } from "./AmapMap";
import type { MapPlace } from "@/types";

export interface PlaceClickPayload {
  place: MapPlace;
  /** marker 在地图容器中的像素坐标（用于浮层定位） */
  screenPos: { x: number; y: number };
}

interface CheckinMapViewProps {
  /** 待展示的打卡点（含本人打卡状态） */
  places: MapPlace[];
  /** 点击单个标记回调（含屏幕坐标，供浮层定位） */
  onPlaceClick?: (payload: PlaceClickPayload) => void;
  /** 高德地图实例就绪回调（供浮层订阅 move/zoom） */
  onMapReady?: (mapInstance: any) => void;
  /** 点击地图空白处回调（不响应 marker 点击） */
  onMapClick?: () => void;
  center?: [number, number];
  zoom?: number;
  /** 外部触发地图定位（如搜索结果），变化时 setCenter */
  focusPoint?: { lng: number; lat: number } | null;
  /** 是否渲染右上角控件（缩放 +/- 与 GPS 定位） */
  showControls?: boolean;
  className?: string;
}

const MARKER_SIZE = 22;

/** 构建单 marker 的 DOM 内容（div）。已打卡加白边光晕以增强可见度。 */
function buildMarkerContent(checked: boolean): HTMLDivElement {
  const div = document.createElement("div");
  const ring = checked
    ? "0 0 0 3px rgba(255,255,255,0.95), 0 0 0 5px rgba(226,75,74,0.35), 0 2px 6px rgba(0,0,0,0.45)"
    : "0 0 0 2.5px rgba(255,255,255,0.95), 0 2px 4px rgba(0,0,0,0.35)";
  div.style.cssText = `width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;border-radius:50%;background:${
    checked ? "#E24B4A" : "#378ADD"
  };box-shadow:${ring};box-sizing:border-box;cursor:pointer`;
  return div;
}

/** 构建聚合气泡的 DOM 内容 */
function buildClusterContent(count: number, hasChecked: boolean): HTMLDivElement {
  const div = document.createElement("div");
  const bg = hasChecked ? "#E24B4A" : "#378ADD";
  // 已打卡加更显眼的环（"打孔"标记）
  const ring = hasChecked
    ? "0 0 0 3px rgba(255,255,255,0.95), 0 0 0 6px rgba(226,75,74,0.5), 0 2px 6px rgba(0,0,0,0.45)"
    : "0 0 0 2.5px rgba(255,255,255,0.95), 0 1px 4px rgba(0,0,0,0.35)";
  div.style.cssText = `min-width:30px;height:30px;padding:0 8px;border-radius:15px;background:${bg};color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;border:2.5px solid #fff;box-shadow:${ring};box-sizing:border-box;cursor:pointer`;
  div.textContent = String(count);
  return div;
}

/**
 * 简单聚合：按 gridSize 像素网格，把地图当前视野内的 marker 聚合。
 * 数据量小时（< 1000 点）足够；数据量大后可替换为 PostGIS + GIST 后端聚合。
 */
function clusterByGrid(
  places: MapPlace[],
  map: any,
  gridSize: number
): Array<{
  center: [number, number];
  count: number;
  places: MapPlace[];
  hasChecked: boolean;
}> {
  if (places.length === 0) return [];
  const mapSize = map.getSize();
  const cellMap = new Map<string, MapPlace[]>();
  for (const p of places) {
    const px = map.lngLatToContainer([p.lng, p.lat]);
    if (!px) continue;
    if (px.x < 0 || px.y < 0 || px.x > mapSize.width || px.y > mapSize.height) continue;
    const key = `${Math.floor(px.x / gridSize)}:${Math.floor(px.y / gridSize)}`;
    const arr = cellMap.get(key) ?? [];
    arr.push(p);
    cellMap.set(key, arr);
  }
  return Array.from(cellMap.entries()).map(([, arr]) => {
    const lngs = arr.map((p: MapPlace) => p.lng);
    const lats = arr.map((p: MapPlace) => p.lat);
    return {
      center: [
        lngs.reduce((a: number, b: number) => a + b, 0) / lngs.length,
        lats.reduce((a: number, b: number) => a + b, 0) / lats.length,
      ],
      count: arr.length,
      places: arr,
      hasChecked: arr.some((p: MapPlace) => p.i_checked),
    };
  });
}

/**
 * 打卡点地图视图：聚合展示 + 点击标记回调（含屏幕坐标）。
 * 数据量小（M1），前端简单 JS 网格聚合，不依赖 AMap.MarkerCluster 插件
 * （该插件在某些环境下与 setOptions/setNeedUpdate 触发调度循环）。
 */
export function CheckinMapView({
  places,
  onPlaceClick,
  onMapReady,
  onMapClick,
  center = [114.3054, 30.5931],
  zoom = 12,
  focusPoint,
  showControls = false,
  className,
}: CheckinMapViewProps) {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  /** place.id -> place 的映射（从 marker 反查原对象） */
  const placeByIdRef = useRef<Map<string, MapPlace>>(new Map());
  /** place.id -> AMap.Marker 的映射（cluster 单点解包时定位原 marker） */
  const markerByPlaceIdRef = useRef<Map<string, any>>(new Map());
  const [map, setMap] = useState<any>(null);
  /** 视野变化 tick，用于触发聚合 useEffect 重算（zoom < 14 时聚合） */
  const [viewTick, setViewTick] = useState(0);
  const onPlaceClickRef = useRef(onPlaceClick);
  onPlaceClickRef.current = onPlaceClick;
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const handleReady = useCallback((instance: any) => {
    mapRef.current = instance;
    setMap(instance);
    onMapReadyRef.current?.(instance);
  }, []);

  const handleDestroy = useCallback(() => {
    markersRef.current = [];
    placeByIdRef.current.clear();
    markerByPlaceIdRef.current.clear();
    mapRef.current = null;
    setMap(null);
  }, []);

  // 数据变化 / 地图视野变化时，重建 markers（聚合 or 单点）
  useEffect(() => {
    if (!map) return;
    const AMap = window.AMap;
    if (!AMap) return;

    // 清理旧 markers
    map.remove(markersRef.current);
    markersRef.current = [];
    placeByIdRef.current.clear();
    markerByPlaceIdRef.current.clear();

    const currentZoom = map.getZoom();
    const GRID_SIZE = 60;
    const MIN_ZOOM_TO_CLUSTER = 13; // >= 13 显示单点，否则按 grid 聚合

    if (currentZoom >= MIN_ZOOM_TO_CLUSTER) {
      // 单 marker 模式：每个 place 一个 marker
      const markers: any[] = [];
      for (const place of places) {
        const checked = Boolean(place.i_checked);
        const marker = new AMap.Marker({
          position: new AMap.LngLat(place.lng, place.lat),
          content: buildMarkerContent(checked),
          offset: new AMap.Pixel(-MARKER_SIZE / 2, -MARKER_SIZE / 2),
          title: place.name,
          zIndex: checked ? 200 : 100,
        });
        (marker as any).__placeId = place.id;
        markerByPlaceIdRef.current.set(place.id, marker);
        marker.on("click", () => {
          const px = map.lngLatToContainer(marker.getPosition());
          onPlaceClickRef.current?.({
            place,
            screenPos: { x: px.x, y: px.y },
          });
        });
        markers.push(marker);
      }
      if (markers.length > 0) map.add(markers);
      markersRef.current = markers;
    } else {
      // 聚合模式：按 grid 分桶，每个桶一个聚合气泡
      const clusters = clusterByGrid(places, map, GRID_SIZE);
      // eslint-disable-next-line no-console
      console.debug("[CheckinMapView] aggregate clusters:", clusters.length, "from", places.length, "places; first cluster hasChecked =", clusters[0]?.hasChecked);
      const markers: any[] = [];
      for (const cluster of clusters) {
        const div = buildClusterContent(cluster.count, cluster.hasChecked);
        const marker = new AMap.Marker({
          position: new AMap.LngLat(cluster.center[0], cluster.center[1]),
          content: div,
          offset: new AMap.Pixel(-15, -15),
          zIndex: 150,
        });
        // 挂 place 引用便于单点解包
        (marker as any).__clusterPlaces = cluster.places;
        (marker as any).__clusterCount = cluster.count;
        marker.on("click", () => {
          if (cluster.count === 1) {
            const only = cluster.places[0];
            const px = map.lngLatToContainer(marker.getPosition());
            onPlaceClickRef.current?.({
              place: only,
              screenPos: { x: px.x, y: px.y },
            });
            return;
          }
          // 多 marker：放大到能看见
          map.setZoomAndCenter(currentZoom + 2, cluster.center);
        });
        markers.push(marker);
      }
      if (markers.length > 0) map.add(markers);
      markersRef.current = markers;
    }

    // placeById 索引（聚合模式虽然用不上，但保留给外部读取）
    for (const p of places) placeByIdRef.current.set(p.id, p);
  }, [map, places, viewTick]);

  // 地图视野变化时重新聚合（仅聚合模式触发，< 14 时）
  useEffect(() => {
    if (!map) return;
    const handler = () => setViewTick((v) => v + 1);
    map.on("moveend", handler);
    map.on("zoomend", handler);
    return () => {
      map.off("moveend", handler);
      map.off("zoomend", handler);
    };
  }, [map]);

  // 点击地图空白处（不响应 marker 点击；高德 SDK 自身区分）
  useEffect(() => {
    if (!map) return;
    const handler = () => onMapClickRef.current?.();
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map]);

  // 外部定位（搜索结果等）
  useEffect(() => {
    if (!map || !focusPoint) return;
    map.setCenter(new window.AMap.LngLat(focusPoint.lng, focusPoint.lat));
    map.setZoom(15);
  }, [map, focusPoint]);

  return (
    <AmapMap
      center={center}
      zoom={zoom}
      onReady={handleReady}
      onDestroy={handleDestroy}
      showControls={showControls}
      className={className}
    />
  );
}