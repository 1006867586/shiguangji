import rawWuhan from "@/data/wuhan-districts.json";

export interface WuhanFeature {
  type: "Feature";
  properties: {
    adcode: number;
    name: string;
    center: [number, number];
    centroid: [number, number];
    level: string;
  };
  geometry: {
    type: "MultiPolygon" | "Polygon";
    coordinates: number[][][] | number[][][][];
  };
}

export const wuhanFeatures = (rawWuhan as unknown as { features: WuhanFeature[] })
  .features;

export const districtNames = wuhanFeatures.map((f) => f.properties.name);

/** 武汉市中心，用于地图初始视角 */
export const WUHAN_CENTER: [number, number] = [114.3055, 30.5928];

export function centroidOf(name: string): [number, number] | null {
  const f = wuhanFeatures.find((x) => x.properties.name === name);
  if (!f) return null;
  return f.properties.centroid as [number, number];
}
