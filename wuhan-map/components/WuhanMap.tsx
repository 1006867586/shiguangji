"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map, type MapMouseEvent } from "maplibre-gl";
import { wuhanFeatures, WUHAN_CENTER } from "@/lib/wuhan-geo";

interface WuhanMapProps {
  /** 高亮的区名（例如选中态） */
  selectedDistrict: string | null;
  /** 每个区的回忆数量，用于决定点亮颜色 */
  counts: Record<string, number>;
  /** 点击某个区划时回调 */
  onSelect: (district: string | null) => void;
}

const SOURCE_ID = "wuhan-districts";
const FILL_LAYER_ID = "wuhan-fill";
const LINE_LAYER_ID = "wuhan-line";
const LABEL_LAYER_ID = "wuhan-label";

/**
 * 根据"该区是否有回忆"决定填充色。
 * 没有回忆 → 半透明灰；有回忆 → 粉色；被选中 → 加深并描边。
 */
function fillColor(count: number): string {
  return count > 0 ? "rgba(232, 184, 194, 0.55)" : "rgba(216, 221, 216, 0.25)";
}

export default function WuhanMap({
  selectedDistrict,
  counts,
  onSelect,
}: WuhanMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  // 用 ref 保存最新 props，避免每次都重建 map
  const stateRef = useRef({ selectedDistrict, counts, onSelect });
  stateRef.current = { selectedDistrict, counts, onSelect };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      // 用免费的 OSM 栅格瓦片做街道底图，无需 token
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [
          {
            id: "osm-tiles",
            type: "raster",
            source: "osm",
            paint: {
              // 把底图压暗一点，让区划层更突出
              "raster-opacity": 0.7,
            },
          },
        ],
      },
      center: WUHAN_CENTER,
      zoom: 9,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    mapRef.current = map;

    map.on("load", () => {
      // 加入武汉区划数据源
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: wuhanFeatures as unknown as GeoJSON.Feature[],
        },
      });

      // 填充层：每个区一个色块
      map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          // 用 feature-state 来按区动态着色
          "fill-color": [
            "case",
            ["==", ["get", "name"], stateRef.current.selectedDistrict ?? ""],
            "rgba(232, 184, 194, 0.85)",
            [
              "case",
              [">", ["to-number", ["get", "__count"]], 0],
              "rgba(232, 184, 194, 0.55)",
              "rgba(216, 221, 216, 0.25)",
            ],
          ],
          "fill-opacity": 1,
        },
      });

      // 描边层
      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "name"], stateRef.current.selectedDistrict ?? ""],
            "#c9798a",
            "#5a6670",
          ],
          "line-width": [
            "case",
            ["==", ["get", "name"], stateRef.current.selectedDistrict ?? ""],
            2.5,
            0.8,
          ],
        },
      });

      // 区名标注层
      map.addLayer({
        id: LABEL_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-anchor": "center",
        },
        paint: {
          "text-color": "#1f2937",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      // 初始化每个区的 count feature-state
      const countsNow = stateRef.current.counts;
      wuhanFeatures.forEach((f) => {
        const name = f.properties.name;
        map.setFeatureState(
          { source: SOURCE_ID, id: name as never },
          { __count: countsNow[name] ?? 0 } as never,
        );
      });
      // 注意：上面用 feature-state 写法需要数据有 id 字段。
      // 这里 GeoJSON feature 没有 id，所以我们改用 property 上的 __count 来表达。
      // 为了让上面的表达式读到 ["get", "__count"]，需要把 count 写到每个 feature 的 properties 上。
      // 我们在下面同步刷新 properties 而不是依赖 feature-state。
      refreshCounts(map, countsNow);
      refreshSelection(map, stateRef.current.selectedDistrict);
    });

    // 点击区划
    map.on("click", FILL_LAYER_ID, (e: MapMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const name = feature.properties?.name as string | undefined;
      const current = stateRef.current.selectedDistrict;
      // 同一个区再次点击 → 取消选中
      onSelect(name && name !== current ? name : null);
    });

    // 鼠标悬停变成手型
    map.on("mouseenter", FILL_LAYER_ID, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", FILL_LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 外部 counts 变化 → 同步到地图 properties
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    refreshCounts(map, counts);
  }, [counts]);

  // 选中态变化 → 刷新地图样式
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    refreshSelection(map, selectedDistrict);
  }, [selectedDistrict]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      data-testid="wuhan-map"
    />
  );
}

/** 把每个区的 count 写回 GeoJSON source 的 properties，让 fill 表达式能读到 */
function refreshCounts(map: Map, counts: Record<string, number>) {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  const features = wuhanFeatures.map((f) => ({
    ...f,
    properties: {
      ...f.properties,
      __count: counts[f.properties.name] ?? 0,
    },
  }));
  source.setData({
    type: "FeatureCollection",
    features: features as unknown as GeoJSON.Feature[],
  });
}

/** 选中态由 fill/line 表达式读取 ["get","name"] 自动处理，这里只需触发一次 setData 即可 */
function refreshSelection(map: Map, selected: string | null) {
  // 表达式里直接用 ["==", ["get","name"], selected ?? ""]，
  // 因此无需额外操作；但为了在 selected 变化时强制重绘，
  // 这里复用 refreshCounts 的 setData 触发一次图层刷新。
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  // 轻量触发：setData 同样的数据即可让 paint 表达式重新求值
  const features = wuhanFeatures.map((f) => ({
    ...f,
    properties: {
      ...f.properties,
    },
  }));
  source.setData({
    type: "FeatureCollection",
    features: features as unknown as GeoJSON.Feature[],
  });
}
