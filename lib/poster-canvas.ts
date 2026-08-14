/**
 * Canvas API 海报绘制引擎
 *
 * 参考 wxa-plugin-canvas 的声明式绘制思路：
 * - 不用 html2canvas 截图 DOM，而是直接用 Canvas 2D API 绘制
 * - 元素逐个排列，Y 坐标累加（flow layout）
 * - 画布高度 = 最后元素 Y + 高度，天然动态，无空白
 * - 无 CORS taint 问题（Image 对象 + 代理 URL）
 *
 * 两遍绘制：
 * 1. 第一遍计算各元素高度，得出总画布高度
 * 2. 第二遍在正确尺寸的 canvas 上逐元素绘制
 */

import type { Activity } from "@/types";
import { APP_NAME } from "@/lib/constants";

const POSTER_WIDTH = 375;
const SCALE = 2; // 2x 倍率保证清晰度
const PADDING_X = 18;

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/** 加载图片，返回 HTMLImageElement（失败时返回 null） */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // 如果是 data URL 直接用，否则走代理
    img.src = src.startsWith("data:")
      ? src
      : `/api/image-proxy?url=${encodeURIComponent(src)}`;
  });
}

/** Canvas 文本换行：按最大宽度拆分多行 */
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

/** 绘制圆角矩形路径 */
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

/** 在圆形区域内裁剪绘制图片（头像） */
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
    // fallback: 琥珀色背景 + 首字母
    ctx.fillStyle = "#fef3c7";
    ctx.fill();
    ctx.fillStyle = "#d97706";
    ctx.font = `700 ${Math.round(size * 0.45)}px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fallbackChar, x + size / 2, y + size / 2 + 1);
  }
  ctx.restore();
  // 白色边框
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** 海报绘制配置 */
export interface PosterDrawConfig {
  activity: Activity;
  coverImage: HTMLImageElement | null;
  avatarImage: HTMLImageElement | null;
  qrImage: HTMLImageElement | null;
  authorName: string;
  timeText: string;
  summary: string;
}

/** 两遍绘制：先算高度，再画内容 */
export function drawPoster(config: PosterDrawConfig): string {
  const {
    activity,
    coverImage,
    avatarImage,
    qrImage,
    authorName,
    timeText,
    summary,
  } = config;

  const ext = activity.external_link;
  const W = POSTER_WIDTH;
  const contentW = W - PADDING_X * 2;

  // ---- 数据准备 ----
  const reactionsTotal = activity.reactions
    ? (activity.reactions.like ?? 0) +
      (activity.reactions.love ?? 0) +
      (activity.reactions.haha ?? 0) +
      (activity.reactions.wow ?? 0) +
      (activity.reactions.sad ?? 0) +
      (activity.reactions.angry ?? 0)
    : 0;

  const hasRichInfo = !!(
    ext?.title ||
    ext?.rating ||
    ext?.category ||
    ext?.price ||
    ext?.address ||
    activity.repost_of ||
    (activity.tags?.length ?? 0) > 0 ||
    (activity.photo_count ?? 0) > 0 ||
    (activity.comment_count ?? 0) > 0 ||
    (activity.like_count ?? 0) > 0 ||
    reactionsTotal > 0
  );

  // 餐厅信息行
  const infoParts: string[] = [];
  if (ext?.rating) infoParts.push(`⭐ ${Number(ext.rating).toFixed(1)}`);
  if (ext?.category) infoParts.push(ext.category);
  if (ext?.price)
    infoParts.push(`人均 ¥${ext.price.replace(/[¥￥]/g, "")}`);
  const infoLine = infoParts.join(" · ");
  const addressLine = ext?.address?.trim() || null;

  // 互动数据
  const statsParts: string[] = [];
  if ((activity.photo_count ?? 0) > 0)
    statsParts.push(`📸 ${activity.photo_count}`);
  if ((activity.comment_count ?? 0) > 0)
    statsParts.push(`💬 ${activity.comment_count}`);
  if ((activity.like_count ?? 0) > 0) {
    statsParts.push(`❤️ ${activity.like_count}`);
  } else if (reactionsTotal > 0) {
    statsParts.push(`👍 ${reactionsTotal}`);
  }
  if (activity.average_rating && (activity.rating_count ?? 0) > 0) {
    statsParts.push(
      `⭐ ${Number(activity.average_rating).toFixed(1)} (${activity.rating_count})`
    );
  }
  const statsLine = statsParts.join("  ");

  const repost = activity.repost_of;
  const tags = (activity.tags ?? []).slice(0, 4);

  // ---- 用离屏 ctx 测量文本高度 ----
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d")!;

  // 封面高度
  const coverHeight = coverImage
    ? Math.min(232, Math.round(W * 0.62))
    : 0;
  const logoHeight = !coverImage ? 200 : 0;

  // 正文行数
  const summaryFontSize = hasRichInfo ? 13 : 15;
  const summaryLineHeight = summaryFontSize * 1.55;
  mctx.font = `600 ${summaryFontSize}px ${FONT_FAMILY}`;
  const summaryLines = summary
    ? wrapText(mctx, summary, contentW).slice(0, 3)
    : ["（这条聚餐记录没有文字描述）"];

  // ---- 第一遍：计算总高度 ----
  let y = 0;
  y += coverHeight || logoHeight; // 封面/LOGO
  y += 14; // 顶部 padding

  // 餐厅标题胶囊
  if (ext?.title) {
    y += 24; // 胶囊高度
    if (infoLine) y += 16; // 评分行
    if (addressLine) y += 14; // 地址行
    y += 8; // 间距
  } else if (addressLine) {
    y += 22; // 独立地址行
    y += 8;
  }

  // 转发摘要
  if (repost) {
    y += 36;
    y += 8;
  }

  // 正文
  y += summaryLines.length * summaryLineHeight;
  y += 8;

  // 标签
  if (tags.length > 0) {
    y += 22;
  }

  // 互动数据
  if (statsLine) {
    y += 22;
  }

  // 稀疏模式装饰条
  if (!hasRichInfo) {
    y += 22; // 上下两条
  }

  y += 10; // 底部 padding
  y += 110; // 二维码区域

  const H = Math.max(420, Math.min(y, 750));

  // ---- 第二遍：在正确尺寸的 canvas 上绘制 ----
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // 背景：浅琥珀渐变
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#fffbeb");
  bgGrad.addColorStop(0.38, "#ffffff");
  bgGrad.addColorStop(1, "#ffffff");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ---- 1. 封面 / LOGO ----
  let currentY = 0;
  if (coverImage) {
    // 封面图：cover 模式裁切
    ctx.save();
    const imgRatio = coverImage.width / coverImage.height;
    const coverRatio = W / coverHeight;
    let sx = 0, sy = 0, sw = coverImage.width, sh = coverImage.height;
    if (imgRatio > coverRatio) {
      sw = coverImage.height * coverRatio;
      sx = (coverImage.width - sw) / 2;
    } else {
      sh = coverImage.width / coverRatio;
      sy = (coverImage.height - sh) / 2;
    }
    ctx.drawImage(coverImage, sx, sy, sw, sh, 0, 0, W, coverHeight);
    ctx.restore();

    // 顶部渐变遮罩（保证作者名可读）
    const topGrad = ctx.createLinearGradient(0, 0, 0, 88);
    topGrad.addColorStop(0, "rgba(0,0,0,0.35)");
    topGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, W, 88);

    currentY = coverHeight;
  } else {
    // LOGO 占位
    const logoGrad = ctx.createLinearGradient(0, 0, W, logoHeight);
    logoGrad.addColorStop(0, "#f59e0b");
    logoGrad.addColorStop(0.55, "#d97706");
    logoGrad.addColorStop(1, "#b45309");
    ctx.fillStyle = logoGrad;
    ctx.fillRect(0, 0, W, logoHeight);

    ctx.fillStyle = "#fffbeb";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 58px ${FONT_FAMILY}`;
    ctx.fillText(APP_NAME, W / 2, logoHeight / 2 - 12);
    ctx.font = `400 12px ${FONT_FAMILY}`;
    ctx.globalAlpha = 0.9;
    ctx.fillText("记录我们吃的每一顿", W / 2, logoHeight / 2 + 22);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    currentY = logoHeight;
  }

  // ---- 2. 作者栏（浮层，叠在封面下部） ----
  const authorY = coverImage ? 14 : 18;
  const avatarSize = 32;
  const avatarX = PADDING_X;
  drawAvatar(
    ctx,
    avatarImage,
    avatarX,
    authorY,
    avatarSize,
    (authorName || APP_NAME).slice(0, 1)
  );

  // 作者名 + 时间
  ctx.textBaseline = "alphabetic";
  const textColor = coverImage ? "#ffffff" : "#111827";
  ctx.fillStyle = textColor;
  ctx.font = `600 12px ${FONT_FAMILY}`;
  ctx.fillText(authorName || APP_NAME, avatarX + avatarSize + 10, authorY + 15);
  ctx.font = `400 10px ${FONT_FAMILY}`;
  ctx.globalAlpha = coverImage ? 0.85 : 0.65;
  const subText = [timeText].filter(Boolean).join(" · ");
  ctx.fillText(subText, avatarX + avatarSize + 10, authorY + 28);
  ctx.globalAlpha = 1;

  // ---- 3. 正文 + 信息区 ----
  currentY -= 28; // 作者栏与封面重叠
  currentY += 14; // 顶部 padding

  // 稀疏模式顶部装饰条
  if (!hasRichInfo) {
    const decorGrad = ctx.createLinearGradient(PADDING_X, 0, W - PADDING_X, 0);
    decorGrad.addColorStop(0, "#fde68a");
    decorGrad.addColorStop(0.5, "#f59e0b");
    decorGrad.addColorStop(1, "#fde68a");
    ctx.fillStyle = decorGrad;
    ctx.globalAlpha = 0.75;
    roundRect(ctx, PADDING_X, currentY, contentW, 4, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    currentY += 4 + 14;
  }

  // 餐厅标题胶囊
  if (ext?.title) {
    ctx.font = `500 11px ${FONT_FAMILY}`;
    const titleText = `🏷️ ${ext.title}`;
    const titleW = ctx.measureText(titleText).width + 20;
    ctx.fillStyle = "#fef3c7";
    roundRect(ctx, PADDING_X, currentY, Math.min(titleW, contentW), 20, 8);
    ctx.fill();
    ctx.fillStyle = "#92400e";
    ctx.fillText(titleText, PADDING_X + 10, currentY + 14);
    currentY += 24;

    // 评分/分类/人均
    if (infoLine) {
      ctx.fillStyle = "#78350f";
      ctx.font = `500 11px ${FONT_FAMILY}`;
      ctx.fillText(infoLine, PADDING_X, currentY + 10);
      currentY += 16;
    }

    // 地址
    if (addressLine) {
      ctx.fillStyle = "#6b7280";
      ctx.font = `400 10px ${FONT_FAMILY}`;
      const addrText = `📍 ${addressLine}`;
      const truncated = truncate(addrText, 38);
      ctx.fillText(truncated, PADDING_X, currentY + 10);
      currentY += 14;
    }
    currentY += 8;
  } else if (addressLine) {
    // 独立地址行
    ctx.fillStyle = "#78350f";
    ctx.font = `500 11px ${FONT_FAMILY}`;
    const addrText = `📍 ${addressLine}`;
    const addrW = ctx.measureText(addrText).width + 20;
    ctx.fillStyle = "#fffbeb";
    roundRect(ctx, PADDING_X, currentY, Math.min(addrW, contentW), 18, 6);
    ctx.fill();
    ctx.fillStyle = "#78350f";
    ctx.fillText(addrText, PADDING_X + 10, currentY + 13);
    currentY += 22 + 8;
  }

  // 转发摘要
  if (repost) {
    ctx.fillStyle = "#fffbeb";
    roundRect(ctx, PADDING_X, currentY, contentW, 32, 8);
    ctx.fill();
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 1;
    roundRect(ctx, PADDING_X, currentY, contentW, 32, 8);
    ctx.stroke();

    if (activity.repost_comment) {
      ctx.fillStyle = "#78350f";
      ctx.font = `500 11px ${FONT_FAMILY}`;
      ctx.fillText(
        `🔁 "${truncate(activity.repost_comment, 30)}"`,
        PADDING_X + 10,
        currentY + 14
      );
    }

    ctx.fillStyle = "#92400e";
    ctx.font = `400 10px ${FONT_FAMILY}`;
    const repostAuthor = repost.author?.nickname ?? APP_NAME;
    const repostContent = repost.content
      ? `转发自 @${repostAuthor}：「${truncate(repost.content, 22)}」`
      : `转发自 @${repostAuthor}：${repost.external_link?.title ?? ""}`;
    ctx.fillText(truncate(repostContent, 42), PADDING_X + 10, currentY + 27);

    currentY += 36 + 8;
  }

  // 正文
  ctx.fillStyle = "#1f2937";
  ctx.font = `600 ${summaryFontSize}px ${FONT_FAMILY}`;
  for (const line of summaryLines) {
    ctx.fillText(line, PADDING_X, currentY + summaryFontSize);
    currentY += summaryLineHeight;
  }
  currentY += 8;

  // 标签胶囊
  if (tags.length > 0) {
    let tagX = PADDING_X;
    const tagY = currentY;
    ctx.font = `500 10px ${FONT_FAMILY}`;
    for (const tag of tags) {
      const tagText = `# ${tag.name}`;
      const tagW = ctx.measureText(tagText).width + 16;
      if (tagX + tagW > W - PADDING_X) break; // 不换行，超出截断
      ctx.fillStyle = "#fef3c7";
      roundRect(ctx, tagX, tagY, tagW, 18, 999);
      ctx.fill();
      ctx.fillStyle = "#92400e";
      ctx.fillText(tagText, tagX + 8, tagY + 13);
      tagX += tagW + 4;
    }
    currentY += 22;
  }

  // 互动数据
  if (statsLine) {
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(PADDING_X, currentY);
    ctx.lineTo(W - PADDING_X, currentY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#b45309";
    ctx.font = `500 11px ${FONT_FAMILY}`;
    ctx.fillText(statsLine, PADDING_X, currentY + 14);
    currentY += 22;
  }

  // 稀疏模式底部装饰条
  if (!hasRichInfo) {
    currentY += 14;
    const decorGrad2 = ctx.createLinearGradient(PADDING_X, 0, W - PADDING_X, 0);
    decorGrad2.addColorStop(0, "rgba(253,230,138,0)");
    decorGrad2.addColorStop(0.5, "rgba(245,158,11,0.5)");
    decorGrad2.addColorStop(1, "rgba(253,230,138,0)");
    ctx.fillStyle = decorGrad2;
    roundRect(ctx, PADDING_X, currentY, contentW, 3, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---- 4. 底部二维码区 ----
  const qrAreaY = H - 110;
  // 顶部分隔线
  ctx.strokeStyle = "#fef3c7";
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

  // 二维码白底
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, qrX, qrY, qrSize, qrSize, 10);
  ctx.fill();
  ctx.strokeStyle = "#fde68a";
  ctx.lineWidth = 1;
  roundRect(ctx, qrX, qrY, qrSize, qrSize, 10);
  ctx.stroke();

  // 画二维码图片
  if (qrImage) {
    ctx.drawImage(qrImage, qrX + 4, qrY + 4, qrSize - 8, qrSize - 8);
  } else {
    // 无二维码时的占位
    ctx.fillStyle = "#f3f4f6";
    roundRect(ctx, qrX + 4, qrY + 4, qrSize - 8, qrSize - 8, 6);
    ctx.fill();
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
  ctx.fillText("扫码查看完整聚餐记录", brandX, qrY + 52);

  // 背景装饰圆点
  ctx.fillStyle = "rgba(251,191,36,0.18)";
  ctx.beginPath();
  ctx.arc(W - 30, H - 170, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(251,191,36,0.1)";
  ctx.beginPath();
  ctx.arc(15, (coverImage ? coverHeight : logoHeight) + 10, 35, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL("image/png");
}

/**
 * 完整的海报生成流程：
 * 1. 加载封面图 + 头像图 + 二维码图
 * 2. 绘制海报到 canvas
 * 3. 返回 dataURL
 */
export async function generatePoster(
  config: Omit<PosterDrawConfig, "coverImage" | "avatarImage" | "qrImage"> & {
    coverUrl: string | null;
    avatarUrl: string;
    qrDataUrl: string;
  }
): Promise<string> {
  const [coverImage, avatarImage, qrImage] = await Promise.all([
    config.coverUrl ? loadImage(config.coverUrl) : Promise.resolve(null),
    config.avatarUrl ? loadImage(config.avatarUrl) : Promise.resolve(null),
    config.qrDataUrl ? loadImage(config.qrDataUrl) : Promise.resolve(null),
  ]);

  return drawPoster({
    activity: config.activity,
    coverImage,
    avatarImage,
    qrImage,
    authorName: config.authorName,
    timeText: config.timeText,
    summary: config.summary,
  });
}
