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
  center?: [number, number];
  zoom?: number;
  /** 外部触发地图定位（如搜索结果），变化时 setCenter */
  focusPoint?: { lng: number; lat: number } | null;
  /** 是否渲染右上角控件（缩放 +/- 与 GPS 定位） */
  showControls?: boolean;
  className?: string;
}

const MARKER_SIZE = 22;
const MARKER_BG = {
  checked: "#E24B4A",
  unchecked: "#378ADD",
};

/** 构建 marker 的 DOM 内容（div）。已打卡加白边光晕以增强可见度。 */
function buildMarkerContent(checked: boolean): HTMLDivElement {
  const div = document.createElement("div");
  const ring = checked
    ? "0 0 0 3px rgba(255,255,255,0.95), 0 0 0 5px rgba(226,75,74,0.35), 0 2px 6px rgba(0,0,0,0.45)"
    : "0 0 0 2.5px rgba(255,255,255,0.95), 0 2px 4px rgba(0,0,0,0.35)";
  div.style.cssText = `width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;border-radius:50%;background:${
    checked ? MARKER_BG.checked : MARKER_BG.unchecked
  };box-shadow:${ring};box-sizing:border-box;cursor:pointer`;
  return div;
}

/**
 * 打卡点地图视图：聚合展示 + 点击标记回调（含屏幕坐标）。
 * 内部使用高德 MarkerClusterer，自定义聚合与单点样式。
 */
export function CheckinMapView({
  places,
  onPlaceClick,
  onMapReady,
  center = [114.3054, 30.5931],
  zoom = 12,
  focusPoint,
  showControls = false,
  className,
}: CheckinMapViewProps) {
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  /** place.id -> place 的映射（从 marker 反查原对象） */
  const placeByIdRef = useRef<Map<string, MapPlace>>(new Map());
  /** place.id -> AMap.Marker 的映射（cluster 单点解包时定位原 marker） */
  const markerByPlaceIdRef = useRef<Map<string, any>>(new Map());
  const [map, setMap] = useState<any>(null);
  const onPlaceClickRef = useRef(onPlaceClick);
  onPlaceClickRef.current = onPlaceClick;
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;

  const handleReady = useCallback((instance: any) => {
    mapRef.current = instance;
    setMap(instance);
    onMapReadyRef.current?.(instance);
  }, []);

  const handleDestroy = useCallback(() => {
    clustererRef.current = null;
    markersRef.current = [];
    placeByIdRef.current.clear();
    markerByPlaceIdRef.current.clear();
    mapRef.current = null;
    setMap(null);
  }, []);

  // 地图就绪后初始化聚合器
  // maxZoom 调到 18：避免在 zoom=14~16 这种街道级视图中聚合吞掉单 marker
  useEffect(() => {
    if (!map) return;
    const AMap = window.AMap;
    if (!AMap?.MarkerClusterer) {
      clustererRef.current = null;
      return;
    }
    try {
      const clusterer = new AMap.MarkerClusterer(map, [], {
        gridSize: 60,
        maxZoom: 18,
        renderClusterMarker: (context: any) => {
          const div = document.createElement("div");
          div.style.cssText =
            "min-width:26px;height:26px;padding:0 6px;border-radius:13px;background:#378ADD;color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);box-sizing:border-box";
          div.textContent = String(context.count);
          return new AMap.Marker({ content: div });
        },
      });
      // 单 marker 解包：聚合簇只剩 1 个时直接触发 onPlaceClick
      clusterer.on("click", (e: any) => {
        const markers: any[] | undefined = e?.markers ?? e?.cluster?.markers;
        if (!markers || markers.length !== 1) return;
        const only = markers[0];
        const placeId = only?.__placeId as string | undefined;
        const place = placeId ? placeByIdRef.current.get(placeId) : undefined;
        if (!place || !mapRef.current) return;
        const px = mapRef.current.lngLatToContainer(only.getPosition());
        onPlaceClickRef.current?.({
          place,
          screenPos: { x: px.x, y: px.y },
        });
      });
      clustererRef.current = clusterer;
    } catch {
      clustererRef.current = null;
    }
  }, [map]);

  // 数据变化时更新标记
  useEffect(() => {
    if (!map) return;
    const AMap = window.AMap;

    // 重建 place/id 索引
    placeByIdRef.current = new Map(places.map((p) => [p.id, p]));
    markerByPlaceIdRef.current.clear();

    const markers = places.map((place) => {
      const checked = Boolean(place.i_checked);
      const marker = new AMap.Marker({
        position: new AMap.LngLat(place.lng, place.lat),
        content: buildMarkerContent(checked),
        offset: new AMap.Pixel(-MARKER_SIZE / 2, -MARKER_SIZE / 2),
        title: place.name,
        // 提高 zIndex，确保不被聚合圆覆盖
        zIndex: checked ? 200 : 100,
      });
      // 在 marker 上挂 placeId，便于 cluster 单点解包时反查
      (marker as any).__placeId = place.id;
      markerByPlaceIdRef.current.set(place.id, marker);
      marker.on("click", () => {
        const px = map.lngLatToContainer(marker.getPosition());
        onPlaceClickRef.current?.({
          place,
          screenPos: { x: px.x, y: px.y },
        });
      });
      return marker;
    });

    const clusterer = clustererRef.current;
    if (clusterer) {
      if (typeof clusterer.setMarkers === "function") {
        clusterer.setMarkers(markers);
      } else {
        if (typeof clusterer.clearMarkers === "function") {
          clusterer.clearMarkers();
        } else if (typeof clusterer.removeMarkers === "function") {
          clusterer.removeMarkers(markersRef.current);
        }
        if (markers.length > 0 && typeof clusterer.addMarkers === "function") {
          clusterer.addMarkers(markers);
        }
      }
    } else {
      // 聚合器不可用：直接挂到地图
      map.remove(markersRef.current);
      if (markers.length > 0) map.add(markers);
    }
    markersRef.current = markers;
  }, [map, places]);

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