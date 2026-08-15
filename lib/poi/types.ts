// ============================================================
// POI 匹配模块共享类型
// ============================================================

export type PoiProviderName = "amap" | "baidu";

/** 归一化后的 POI 候选（高德/百度统一结构） */
export interface PoiCandidate {
  provider: PoiProviderName;
  /** 高德 poi id / 百度 uid */
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  city: string | null;
  /** 细分品类（如 火锅店/烧烤），取自平台分类末级 */
  category: string | null;
  /** 评分 0-5 */
  rating: number | null;
  /** 人均消费（元） */
  price: number | null;
  /** 详情页链接（百度 detail_url，高德通常无） */
  url: string | null;
  location: {
    lng: number;
    lat: number;
    /** 高德 GCJ-02，百度 BD-09，落库/展示时注意坐标系差异 */
    coordType: "gcj02" | "bd09";
  };
}
