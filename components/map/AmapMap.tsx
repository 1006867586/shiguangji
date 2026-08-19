"use client";

import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window {
    AMap?: any;
  }
}

const AMAP_JS_KEY = process.env.NEXT_PUBLIC_AMAP_JS_KEY ?? "";

/** 高德 JS API 2.0 单例加载（带插件），返回 window.AMap */
let amapLoading: Promise<any> | null = null;
function loadAmap(plugins: string[]): Promise<any> {
  if (!AMAP_JS_KEY) {
    return Promise.reject(
      new Error("未配置高德地图 Key（NEXT_PUBLIC_AMAP_JS_KEY）")
    );
  }
  if (typeof window === "undefined") {
    return Promise.reject(new Error("仅在浏览器环境加载地图 SDK"));
  }
  if (window.AMap) return Promise.resolve(window.AMap);
  if (!amapLoading) {
    amapLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(
        AMAP_JS_KEY
      )}&plugin=${plugins.join(",")}`;
      script.async = true;
      script.onload = () => resolve(window.AMap);
      script.onerror = () => {
        amapLoading = null;
        reject(new Error("高德地图 SDK 加载失败，请检查网络与 Key 白名单"));
      };
      document.head.appendChild(script);
    });
  }
  return amapLoading;
}

interface AmapMapProps {
  /** [lng, lat]，GCJ-02 */
  center?: [number, number];
  zoom?: number;
  /** 地图实例就绪回调（用于绘制标记等） */
  onReady?: (map: any) => void;
  /** 地图实例销毁回调 */
  onDestroy?: () => void;
  className?: string;
}

/**
 * 高德地图容器：动态加载 JS API 2.0 SDK（client-only、SSR 安全），
 * 实例就绪后通过 onReady 交给上层绘制。容器必须有确定高度。
 */
export function AmapMap({
  center = [121.4737, 31.2304], // 默认上海
  zoom = 12,
  onReady,
  onDestroy,
  className,
}: AmapMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [errorMsg, setErrorMsg] = useState("");

  const initMap = useCallback(async () => {
    if (!containerRef.current || mapRef.current) return;
    try {
      const AMap = await loadAmap(["AMap.MarkerClusterer"]);
      const map = new AMap.Map(containerRef.current, {
        zoom,
        center: new AMap.LngLat(center[0], center[1]),
        viewMode: "2D",
        resizeEnable: true,
      });
      mapRef.current = map;
      setStatus("ready");
      onReady?.(map);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "地图加载失败");
    }
  }, [center, zoom, onReady]);

  useEffect(() => {
    initMap();
    return () => {
      if (mapRef.current) {
        onDestroy?.();
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className={`h-full w-full ${className ?? ""}`} />
      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
          地图加载中…
        </div>
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 px-6 text-center">
          <p className="text-sm text-destructive">{errorMsg}</p>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setErrorMsg("");
              initMap();
            }}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            重试
          </button>
        </div>
      ) : null}
    </div>
  );
}
