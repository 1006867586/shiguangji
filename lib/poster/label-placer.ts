// ============================================================
// LabelPlacer：海报文字标签的放置与避让（移植自 map-creator）
// - 用字符数估算文本 bbox（中文/全角 ≈ 1em，ASCII ≈ 0.55em）
// - 已占用区域矩形登记；新标签越界或重叠则换候选偏移，放不下跳过
// - 用于点位名（带偏移候选）与道路名（带旋转角度）
// ============================================================

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 两个矩形是否相交 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

/** 两个矩形是否相交（各向外扩 pad 像素） */
export function rectsOverlapPadded(a: Rect, b: Rect, pad: number): boolean {
  return rectsOverlap(
    { x: a.x - pad, y: a.y - pad, w: a.w + pad * 2, h: a.h + pad * 2 },
    { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }
  );
}

/**
 * 估算文本像素尺寸（与 sharp/librsvg 渲染近似）。
 * 全角字符（CJK/假名/全角符号）按 1em 计宽，其余按 0.55em 计。
 */
export function measureText(text: string, fontSize: number): { w: number; h: number } {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const fullWidth =
      (code >= 0x2e80 && code <= 0x9fff) || // CJK 部首 / 汉字 / 假名
      code === 0x3000 || // 全角空格
      (code >= 0xff00 && code <= 0xff60); // 全角符号
    width += fullWidth ? fontSize : fontSize * 0.55;
  }
  return { w: width, h: fontSize * 1.25 };
}

/** 旋转矩形后的轴对齐外接框（保守估计，用于带角度的道路名） */
export function rotatedBounds(
  w: number,
  h: number,
  angleDeg: number
): { w: number; h: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { w: w * c + h * s, h: w * s + h * c };
}

export class LabelPlacer {
  private occupied: Rect[] = [];
  private bounds: Rect;
  private pad: number;

  constructor(canvasSize: number, pad = 6) {
    this.bounds = { x: 0, y: 0, w: canvasSize, h: canvasSize };
    this.pad = pad;
  }

  /** 手动登记已占用区域（如标题、索引等固定元素） */
  reserve(rect: Rect): void {
    this.occupied.push(rect);
  }

  /** 登记以 (x, y) 为中心、radiusPx 为半径的圆形区域（如点位圆点） */
  reservePoint(x: number, y: number, radiusPx = 22): void {
    this.occupied.push({
      x: x - radiusPx,
      y: y - radiusPx,
      w: radiusPx * 2,
      h: radiusPx * 2,
    });
  }

  private overlapsExisting(rect: Rect): boolean {
    return this.occupied.some((o) => rectsOverlapPadded(rect, o, this.pad));
  }

  private accept(rect: Rect): boolean {
    if (
      rect.x < this.bounds.x ||
      rect.y < this.bounds.y ||
      rect.x + rect.w > this.bounds.x + this.bounds.w ||
      rect.y + rect.h > this.bounds.y + this.bounds.h
    ) {
      return false;
    }
    if (this.overlapsExisting(rect)) return false;
    this.occupied.push(rect);
    return true;
  }

  /**
   * 放置居中的文本（如道路名，可带旋转角度）。
   * 返回放置后的矩形；失败返回 null（放不下就跳过）。
   */
  placeText(
    x: number,
    y: number,
    text: string,
    fontSize: number,
    angleDeg = 0
  ): Rect | null {
    const { w, h } = measureText(text, fontSize);
    const { w: bw, h: bh } = rotatedBounds(w, h, angleDeg);
    const rect = { x: x - bw / 2, y: y - bh / 2, w: bw, h: bh };
    return this.accept(rect) ? rect : null;
  }

  /**
   * 在锚点周围按候选偏移依次尝试放置（如点位名）。
   * 偏移为 [dx, dy] 像素；全部失败返回 null。
   */
  placeAnnotated(
    x: number,
    y: number,
    text: string,
    fontSize: number,
    offsets: Array<[number, number]>
  ): Rect | null {
    const { w, h } = measureText(text, fontSize);
    for (const [dx, dy] of offsets) {
      const rect: Rect =
        dx >= 0
          ? { x: x + dx, y: y + dy - h / 2, w, h }
          : { x: x + dx - w, y: y + dy - h / 2, w, h };
      if (this.accept(rect)) return rect;
    }
    return null;
  }
}
