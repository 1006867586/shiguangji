/**
 * 圈子分享海报 Canvas 绘制引擎
 *
 * 思路与 lib/poster-canvas.ts（活动海报）一致：
 * - 不用 DOM 截图，直接用 Canvas 2D API 绘制
 * - 两遍绘制：先算高度得出画布尺寸，再逐元素绘制
 * - 无 CORS taint（Image 对象 + 代理 URL）
 * - 复用品牌浅琥珀风格，与活动海报一脉相承
 */

import { APP_NAME } from "@/lib/constants";

const POSTER_WIDTH = 375;
const SCALE = 2; // 2x 保证清晰度
const PADDING_X = 18;

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/** 加载图片，返回 HTMLImageElement（失败时返回 null） */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src.startsWith("data:")
      ? src
      : `/api/image-proxy?url=${encodeURIComponent(src)}`;
  });
}

/** Canvas 文本换行：按最大宽度拆行 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const chars = text.split("");
  const lines: string[] = [];
  let current = "";
  for (const char of chars) {
    const test = current + char;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** 截断文本到指定字符数 */
function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** 圆角矩形路径 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 在圆形区域内裁剪绘制图片（群头像） */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  fallbackChar: string
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  if (img) {
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
  } else {
    ctx.fillStyle = "#fef3c7";
    ctx.fill();
    ctx.fillStyle = "#d97706";
    ctx.font = `700 ${Math.round(size * 0.45)}px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fallbackChar, x + size / 2, y + size / 2 + 1);
  }
  ctx.restore();
  // 白色描边
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** 圈子海报绘制配置 */
export interface GroupPosterConfig {
  name: string;
  /** 圈子简介（可为空） */
  description: string | null;
  memberCountText: string;
  /** 已加载完成的二维码图片 */
  qrImage: HTMLImageElement | null;
  /** 已加载完成的群头像图片（可空） */
  avatarImage?: HTMLImageElement | null;
}

/** 两遍绘制：先算高度，再逐元素绘制，返回 dataURL（同步） */
export function drawGroupPoster(config: GroupPosterConfig): string {
  const { name, description, memberCountText, qrImage, avatarImage } = config;

  const W = POSTER_WIDTH;
  const contentW = W - PADDING_X * 2;

  const title = truncate(name || APP_NAME, 12);
  const desc = truncate(description, 40);
  const memberText = memberCountText || "加入我们一起吃饭";

  // 顶部渐变区高度
  const headerH = 220;

  // ---- 用离屏 ctx 测量文本 ----
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d")!;

  const descFontSize = 14;
  const descLineHeight = descFontSize * 1.6;
  mctx.font = `400 ${descFontSize}px ${FONT_FAMILY}`;
  const descLines = desc
    ? wrapText(mctx, desc, contentW).slice(0, 3)
    : ["在这把好吃的都记下来，一起吃喝、一起分享、一起 AA。"];

  // ---- 第一遍：计算总高度 ----
  let y = headerH;
  y += 34;
  y += descLines.length * descLineHeight;
  y += 16;
  y += 24; // 提示胶囊行
  y += 110; // 二维码区

  const H = Math.max(480, Math.min(y, 720));

  // ---- 第二遍：绘制 ----
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // 背景：浅琥珀渐变
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#fffbeb");
  bgGrad.addColorStop(0.4, "#ffffff");
  bgGrad.addColorStop(1, "#fff7e6");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ---- 1. 顶部渐变区（品牌横幅 + 群头像） ----
  const headerGrad = ctx.createLinearGradient(0, 0, W, headerH);
  headerGrad.addColorStop(0, "#f59e0b");
  headerGrad.addColorStop(0.55, "#d97706");
  headerGrad.addColorStop(1, "#b45309");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, W, headerH);

  // 顶部品牌名
  ctx.fillStyle = "rgba(255,251,235,0.9)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 13px ${FONT_FAMILY}`;
  ctx.fillText(APP_NAME, W / 2, 40);

  // 群头像
  const avatarSize = 84;
  drawAvatar(
    ctx,
    avatarImage ?? null,
    (W - avatarSize) / 2,
    78,
    avatarSize,
    title.slice(0, 1)
  );

  // 群名
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fffbeb";
  ctx.font = `800 24px ${FONT_FAMILY}`;
  ctx.fillText(title, W / 2, 182);
  ctx.fillStyle = "rgba(255,251,235,0.85)";
  ctx.font = `400 12px ${FONT_FAMILY}`;
  ctx.fillText(memberText, W / 2, 206);
  ctx.textAlign = "left";

  // ---- 2. 正文区 ----
  let currentY = headerH + 34;

  // 描述
  ctx.fillStyle = "#92400e";
  ctx.font = `400 ${descFontSize}px ${FONT_FAMILY}`;
  for (const line of descLines) {
    ctx.fillText(line, PADDING_X, currentY + descFontSize);
    currentY += descLineHeight;
  }
  currentY += 16;

  // 成员提示行（胶囊，居中）
  ctx.font = `500 11px ${FONT_FAMILY}`;
  const promptText = "扫码加入圈子 · 一起分享每一次聚餐";
  const promptW = ctx.measureText(promptText).width + 24;
  ctx.fillStyle = "#fef3c7";
  roundRect(ctx, (W - promptW) / 2, currentY, promptW, 20, 999);
  ctx.fill();
  ctx.fillStyle = "#92400e";
  ctx.textAlign = "center";
  ctx.fillText(promptText, W / 2, currentY + 14);
  ctx.textAlign = "left";

  // ---- 3. 底部二维码区 ----
  const qrAreaY = H - 110;

  // 分隔线
  ctx.strokeStyle = "#fde68a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, qrAreaY);
  ctx.lineTo(W, qrAreaY);
  ctx.stroke();

  // 底部渐变背景
  const qrBgGrad = ctx.createLinearGradient(0, qrAreaY, 0, H);
  qrBgGrad.addColorStop(0, "rgba(255,251,235,0)");
  qrBgGrad.addColorStop(1, "rgba(255,251,235,0.6)");
  ctx.fillStyle = qrBgGrad;
  ctx.fillRect(0, qrAreaY, W, 110);

  // 二维码
  const qrSize = 80;
  const qrX = PADDING_X;
  const qrY = qrAreaY + 14;

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, qrX, qrY, qrSize, qrSize, 10);
  ctx.fill();
  ctx.strokeStyle = "#fde68a";
  ctx.lineWidth = 1;
  roundRect(ctx, qrX, qrY, qrSize, qrSize, 10);
  ctx.stroke();

  if (qrImage) {
    try {
      ctx.drawImage(qrImage, qrX + 4, qrY + 4, qrSize - 8, qrSize - 8);
    } catch {
      /* 忽略二维码绘制失败 */
    }
  }

  // 品牌文字
  const brandX = qrX + qrSize + 14;
  ctx.fillStyle = "#b45309";
  ctx.font = `800 16px ${FONT_FAMILY}`;
  ctx.fillText(APP_NAME, brandX, qrY + 16);
  ctx.fillStyle = "#92400e";
  ctx.globalAlpha = 0.9;
  ctx.font = `400 11px ${FONT_FAMILY}`;
  ctx.fillText("记录我们吃的每一顿", brandX, qrY + 33);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#78350f";
  ctx.font = `600 11px ${FONT_FAMILY}`;
  const scanText = `扫码加入「${truncate(name, 8)}」`;
  const scanW = ctx.measureText(scanText).width;
  const maxScanW = W - brandX - PADDING_X;
  ctx.fillText(scanW > maxScanW ? truncate(scanText, 14) : scanText, brandX, qrY + 52);

  // 背景装饰圆点
  ctx.fillStyle = "rgba(251,191,36,0.18)";
  ctx.beginPath();
  ctx.arc(W - 30, H - 170, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(251,191,36,0.1)";
  ctx.beginPath();
  ctx.arc(15, headerH + 10, 35, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL("image/png");
}

/**
 * 完整生成流程：
 * 1. 并行加载二维码图与群头像（走代理防 CORS 污染，失败返回 null 用首字兜底）
 * 2. 绘制海报到 canvas
 * 3. 返回 dataURL
 */
export async function generateGroupPoster(
  config: Omit<GroupPosterConfig, "avatarImage" | "qrImage"> & {
    qrDataUrl: string;
    avatarUrl?: string | null;
  }
): Promise<string> {
  const [qrImage, avatarImage] = await Promise.all([
    config.qrDataUrl ? loadImage(config.qrDataUrl) : Promise.resolve(null),
    config.avatarUrl ? loadImage(config.avatarUrl) : Promise.resolve(null),
  ]);
  return drawGroupPoster({
    name: config.name,
    description: config.description,
    memberCountText: config.memberCountText,
    qrImage,
    avatarImage,
  });
}