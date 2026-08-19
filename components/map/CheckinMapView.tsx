"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- 高德 JS API 无官方 TS 类型定义 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AmapMap } from "./AmapMap";
import type { MapPlace } from "@/types";

interface CheckinMapViewProps {
  /** 待展示的打卡点（含本人打卡状态） */
  places: MapPlace[];
  /** 点击单个标记回调 */
  onPlaceClick?: (place: MapPlace) => void;
  center?: [number, number];
  zoom?: number;
  /** 外部触发地图定位（如搜索结果），变化时 setCenter */
  focusPoint?: { lng: number; lat: number } | null;
  className?: string;
}

/**
 * 打卡点地图视图：聚合展示 + 点击标记回调。
 * 内部使用高德 MarkerClusterer（gridSize=60），自定义聚合与单点样式。
 */
export function CheckinMapView({
  places,
  onPlaceClick,
  center = [121.4737, 31.2304],
  zoom = 12,
  focusPoint,
  className,
}: CheckinMapViewProps) {
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [map, setMap] = useState<any>(null);
  const onPlaceClickRef = useRef(onPlaceClick);
  onPlaceClickRef.current = onPlaceClick;

  const handleReady = useCallback((instance: any) => {
    mapRef.current = instance;
    setMap(instance);
  }, []);

  const handleDestroy = useCallback(() => {
    clustererRef.current = null;
    markersRef.current = [];
    mapRef.current = null;
    setMap(null);
  }, []);

  // 地图就绪后初始化聚合器
  useEffect(() => {
    if (!map) return;
    const AMap = window.AMap;
    try {
      const clusterer = new AMap.MarkerClusterer(map, [], {
        gridSize: 60,
        maxZoom: 15,
        renderClusterMarker: (context: any) => {
          const div = document.createElement("div");
          div.style.cssText =
            "min-width:22px;height:22px;padding:0 5px;border-radius:11px;background:#378ADD;color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);box-sizing:border-box";
          div.textContent = String(context.count);
          return new AMap.Marker({ content: div });
        },
      });
      clustererRef.current = clusterer;
    } catch {
      clustererRef.current = null;
    }
  }, [map]);

  // 数据变化时更新标记（防御式：优先 setMarkers 覆盖；降级路径只调用确实存在的方法，
  // 避免不同版本 MarkerClusterer 插件方法名差异导致报错）
  useEffect(() => {
    if (!map) return;
    const AMap = window.AMap;

    const markers = places.map((place) => {
      const checked = Boolean(place.i_checked);
      const div = document.createElement("div");
      div.style.cssText = `width:15px;height:15px;border-radius:50%;background:${
        checked ? "#E24B4A" : "#378ADD"
      };border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);box-sizing:border-box;cursor:pointer`;
      const marker = new AMap.Marker({
        position: new AMap.LngLat(place.lng, place.lat),
        content: div,
        offset: new AMap.Pixel(-7, -7),
        title: place.name,
      });
      marker.on("click", () => onPlaceClickRef.current?.(place));
      return marker;
    });

    const clusterer = clustererRef.current;
    if (clusterer) {
      if (typeof clusterer.setMarkers === "function") {
        // 直接整体覆盖，无需先清空
        clusterer.setMarkers(markers);
      } else {
        // 降级：清空旧聚合点后再添加（仅调用确实存在的方法）
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
      // 聚合器不可用（插件未加载等）：直接挂到地图，并清理上一批
      map.remove(markersRef.current);
      map.add(markers);
    }
    markersRef.current = markers;

    // 不在卸载前清空聚合器：组件卸载时由 AmapMap 的 map.destroy() 统一销毁
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
      className={className}
    />
  );
}
