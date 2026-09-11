import { describe, it, expect } from "vitest";
import {
  createPosterProjector,
  isRoadLabelAllowed,
  roadLabelWeight,
  projectRoads,
  rankRoadLabelCandidates,
  roadLabelAnchor,
} from "@/lib/poster/road-labels";
import {
  LabelPlacer,
  measureText,
  rotatedBounds,
  rectsOverlap,
  type Rect,
} from "@/lib/poster/label-placer";
import type { RoadLine } from "@/lib/poster/overpass";

// ============================================================
// 海报道路名筛选 + LabelPlacer（移植自 map-creator）
// ============================================================

describe("createPosterProjector（Web Mercator 投影）", () => {
  const projector = createPosterProjector(121.47, 31.23, 13, 2048);

  it("中心点映射到画布中心", () => {
    const p = projector.toPixel(121.47, 31.23);
    expect(p.x).toBeCloseTo(1024, 1);
    expect(p.y).toBeCloseTo(1024, 1);
  });

  it("东侧经度 → x 增大；北侧纬度 → y 减小（y 轴向下）", () => {
    const east = projector.toPixel(121.48, 31.23);
    const north = projector.toPixel(121.47, 31.22);
    expect(east.x).toBeGreaterThan(1024);
    expect(north.y).toBeGreaterThan(1024); // 更低纬度 → 更大 y
  });

  it("metersToPixels 为 metersPerPixel 的倒数", () => {
    const m = projector.metersToPixels(160);
    expect(m).toBeCloseTo(160 / projector.metersPerPixel, 6);
    expect(m).toBeGreaterThan(0);
  });
});

describe("isRoadLabelAllowed（道路名合法性）", () => {
  it("接受常规街区道路名", () => {
    expect(isRoadLabelAllowed("富民路")).toBe(true);
    expect(isRoadLabelAllowed("长乐路")).toBe(true);
    expect(isRoadLabelAllowed("淮海中路")).toBe(true);
  });

  it("排除快速路/高架/隧道/立交等", () => {
    expect(isRoadLabelAllowed("延安高架路")).toBe(false);
    expect(isRoadLabelAllowed("中环快速路")).toBe(false);
    expect(isRoadLabelAllowed("长江隧道")).toBe(false);
    expect(isRoadLabelAllowed("浦东立交")).toBe(false);
    expect(isRoadLabelAllowed("绕城高速")).toBe(false);
  });

  it("排除以「线」结尾的道路名", () => {
    expect(isRoadLabelAllowed("内环线")).toBe(false);
  });

  it("拒绝不以常见后缀结尾的名称", () => {
    expect(isRoadLabelAllowed("无名小路")).toBe(false);
  });
});

describe("roadLabelWeight（道路等级权重）", () => {
  it("高等级道路权重更高", () => {
    expect(roadLabelWeight("primary")).toBeGreaterThan(
      roadLabelWeight("residential")
    );
    expect(roadLabelWeight("residential")).toBeGreaterThan(
      roadLabelWeight("service")
    );
  });

  it("未知等级权重为 0", () => {
    expect(roadLabelWeight("unknown_type")).toBe(0);
  });
});

describe("rankRoadLabelCandidates（道路名筛选）", () => {
  const projector = createPosterProjector(121.47, 31.23, 13, 2048);
  // 构造投影坐标系：直接造 ProjectedRoad（画布像素），便于断言
  const roads: Array<{
    name: string;
    highway: string;
    points: Array<{ x: number; y: number }>;
  }> = [
    // 长主路（应排第一）
    {
      name: "长乐路",
      highway: "secondary",
      points: [
        { x: 100, y: 500 },
        { x: 900, y: 500 },
      ],
    },
    // 长次要路
    {
      name: "巨鹿路",
      highway: "tertiary",
      points: [
        { x: 100, y: 600 },
        { x: 800, y: 600 },
      ],
    },
    // 太短（约 50px，小于小范围 160m 阈值换算的像素）
    {
      name: "短街",
      highway: "primary",
      points: [
        { x: 300, y: 700 },
        { x: 350, y: 700 },
      ],
    },
    // 名称不合法
    {
      name: "外环高架路",
      highway: "primary",
      points: [
        { x: 100, y: 800 },
        { x: 900, y: 800 },
      ],
    },
    // 等级过低（service）
    {
      name: "服务巷",
      highway: "service",
      points: [
        { x: 100, y: 900 },
        { x: 700, y: 900 },
      ],
    },
  ];
  const projected = roads.map((r) => ({
    name: r.name,
    highway: r.highway,
    points: r.points,
    lengthPx: Math.hypot(
      r.points[1].x - r.points[0].x,
      r.points[1].y - r.points[0].y
    ),
  }));

  it("过滤短道路、非法名与低等级道路", () => {
    const result = rankRoadLabelCandidates(projected, projector, {
      largeMap: false,
      limit: 6,
    });
    const names = result.map((c) => c.name);
    expect(names).toContain("长乐路");
    expect(names).toContain("巨鹿路");
    expect(names).not.toContain("短街");
    expect(names).not.toContain("外环高架路");
    expect(names).not.toContain("服务巷");
  });

  it("按「长度 × 等级权重」降序排列", () => {
    const result = rankRoadLabelCandidates(projected, projector, {
      largeMap: false,
      limit: 6,
    });
    expect(result[0].name).toBe("长乐路");
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("同名道路合并计分", () => {
    const twoSegs = [
      ...projected,
      {
        name: "长乐路",
        highway: "secondary",
        points: [
          { x: 1000, y: 500 },
          { x: 1800, y: 500 },
        ],
        lengthPx: 800,
      },
    ];
    const result = rankRoadLabelCandidates(twoSegs, projector, {
      largeMap: false,
      limit: 6,
    });
    const changle = result.find((c) => c.name === "长乐路");
    expect(changle).toBeDefined();
    // 800px + 800px 合并后的分数应高于只有 800px 时
    const single = rankRoadLabelCandidates(projected, projector, {
      largeMap: false,
      limit: 6,
    }).find((c) => c.name === "长乐路");
    expect(changle!.score).toBeGreaterThan(single!.score);
  });
});

describe("roadLabelAnchor（道路标签锚点与角度）", () => {
  const projector = createPosterProjector(121.47, 31.23, 13, 2048);

  it("水平道路 → 角度 0，锚点在段中点", () => {
    const { point, angle } = roadLabelAnchor(
      [
        { x: 100, y: 500 },
        { x: 900, y: 500 },
      ],
      projector
    );
    expect(angle).toBeCloseTo(0, 1);
    expect(point.x).toBeCloseTo(500, 1);
    expect(point.y).toBeCloseTo(500, 1);
  });

  it("垂直道路 → 角度 ±90（归一化边界）", () => {
    const { angle } = roadLabelAnchor(
      [
        { x: 500, y: 100 },
        { x: 500, y: 900 },
      ],
      projector
    );
    expect(Math.abs(angle)).toBeCloseTo(90, 1);
  });

  it("多折线时锚点偏向中部", () => {
    const { point } = roadLabelAnchor(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 400 },
        { x: 900, y: 400 },
      ],
      projector
    );
    // 直线段（第三段，长 800px）比第一段（100px）更优，锚点应在 y≈400 附近
    expect(point.y).toBeCloseTo(400, 1);
  });
});

describe("LabelPlacer（标签避让）", () => {
  const SIZE = 2048;

  it("measureText：中文按 1em、英文按 0.55em 计宽", () => {
    expect(measureText("吃", 40).w).toBeCloseTo(40, 1);
    expect(measureText("ABC", 40).w).toBeCloseTo(40 * 0.55 * 3, 1);
  });

  it("rotatedBounds：旋转 90° 后宽高互换", () => {
    const b = rotatedBounds(100, 40, 90);
    expect(b.w).toBeCloseTo(40, 1);
    expect(b.h).toBeCloseTo(100, 1);
  });

  it("rectsOverlap 基础相交判断", () => {
    const a: Rect = { x: 0, y: 0, w: 100, h: 100 };
    expect(rectsOverlap(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(true);
    expect(rectsOverlap(a, { x: 200, y: 200, w: 10, h: 10 })).toBe(false);
  });

  it("placeText：成功占用后，重叠放置被拒绝", () => {
    const placer = new LabelPlacer(SIZE);
    const rect = placer.placeText(1024, 1024, "长乐路", 34);
    expect(rect).not.toBeNull();
    // 同一位置再放 → 重叠，拒绝
    expect(placer.placeText(1024, 1024, "巨鹿路", 34)).toBeNull();
  });

  it("placeText：越界放置被拒绝", () => {
    const placer = new LabelPlacer(SIZE);
    // 文本远超画布右边界（x = SIZE-10，宽 > 40）
    expect(placer.placeText(SIZE - 10, 100, "某某大道", 40)).toBeNull();
  });

  it("placeAnnotated：按偏移候选依次尝试，全失败返回 null", () => {
    const placer = new LabelPlacer(SIZE);
    const offsets: Array<[number, number]> = [
      [30, 0],
      [-30, 0],
      [0, 40],
    ];
    // 第一个偏移成功
    expect(placer.placeAnnotated(1024, 1024, "SLAB TOWN", 40, offsets)).not.toBeNull();
    // 第二次：第一个偏移区域已被占，应尝试第二个偏移
    const rect2 = placer.placeAnnotated(1000, 1024, "村口大树", 40, offsets);
    expect(rect2).not.toBeNull();
  });

  it("placeText 返回的矩形中心等于锚点（旋转时取外接框中心）", () => {
    const placer = new LabelPlacer(SIZE);
    const rect = placer.placeText(1000, 500, "淮海中路", 34, 30);
    expect(rect).not.toBeNull();
    expect(rect!.x + rect!.w / 2).toBeCloseTo(1000, 1);
    expect(rect!.y + rect!.h / 2).toBeCloseTo(500, 1);
  });
});

describe("projectRoads（道路线投影）", () => {
  const projector = createPosterProjector(121.47, 31.23, 13, 2048);

  it("投影并计算像素长度", () => {
    const roads: RoadLine[] = [
      {
        name: "长乐路",
        highway: "secondary",
        points: [
          { lng: 121.46, lat: 31.23 },
          { lng: 121.48, lat: 31.23 },
        ],
      },
    ];
    const projected = projectRoads(roads, projector);
    expect(projected).toHaveLength(1);
    expect(projected[0].lengthPx).toBeGreaterThan(0);
  });

  it("跳过无效（点数不足）的道路", () => {
    const roads: RoadLine[] = [
      { name: "短街", highway: "primary", points: [{ lng: 121.47, lat: 31.23 }] },
    ];
    expect(projectRoads(roads, projector)).toHaveLength(0);
  });
});
