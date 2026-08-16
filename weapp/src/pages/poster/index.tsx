import { useCallback, useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Canvas, Button } from "@tarojs/components";
import {
  fetchActivityDetail,
  fetchWxacode,
  activityIdToScene,
  type ActivityLite,
} from "@/utils/api";
import "./index.scss";

/**
 * 分享海报页（Canvas 2D）
 *
 * 布局（逻辑像素，宽度运行时测量）：
 *   封面（首图/商家封面，无图画渐变品牌区）
 *   标题胶囊 + 评分/品类/人均 + 地址 + 正文摘要（2 行）
 *   底部：小程序码（getwxacodeunlimit，扫后直达本活动详情）+ 品牌文案
 *
 * 小程序码 base64 结果缓存到 storage + 用户目录，避免重复生成。
 */

/** 海报固定纵横比 375:640 */
const RATIO = 640 / 375;
const PAD = 20;

interface Canvas2DNode {
  width: number;
  height: number;
  getContext: (type: "2d") => CanvasRenderingContext2D;
  createImage: () => HTMLImageElement;
}

/** 文本超宽截断加省略号 */
function ellipsis(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

/** 简易换行：按字符宽度累计，最多 maxLines 行（末行截断） */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (line && ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) {
        lines[maxLines - 1] = ellipsis(ctx, lines[maxLines - 1], maxWidth);
        return lines;
      }
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

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

function loadImage(canvas: Canvas2DNode, src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/** base64 小程序码写用户目录（有缓存则直接复用文件） */
function base64ToTempFile(base64: string, id: string): string {
  const filePath = `${Taro.env.USER_DATA_PATH}/wxacode_${id}.png`;
  const fs = Taro.getFileSystemManager();
  try {
    fs.accessSync(filePath);
  } catch {
    fs.writeFileSync(filePath, base64, "base64");
  }
  return filePath;
}

/** 取小程序码本地路径：storage 缓存 → 请求生成 → 落盘 */
async function getWxacodePath(
  id: string
): Promise<string | null> {
  const storageKey = `wxacode:${id}`;
  try {
    const cached = Taro.getStorageSync<string>(storageKey);
    if (cached) return base64ToTempFile(cached, id);
  } catch {
    // storage 读取失败走生成
  }
  try {
    const base64 = await fetchWxacode(
      activityIdToScene(id),
      "pages/detail/index"
    );
    Taro.setStorageSync(storageKey, base64);
    return base64ToTempFile(base64, id);
  } catch {
    // 码生成失败：海报继续，画占位
    return null;
  }
}

export default function PosterPage() {
  const [activity, setActivity] = useState<ActivityLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const canvasRef = useRef<Canvas2DNode | null>(null);
  const activityRef = useRef<ActivityLite | null>(null);
  const drawnRef = useRef(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const a = await fetchActivityDetail(id);
      activityRef.current = a;
      setActivity(a);
    } catch {
      setError("活动加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = Taro.getCurrentInstance().router?.params?.id ?? "";
    if (id) void load(id);
  }, [load]);

  // ---- Canvas 初始化 + 绘制 ----
  useEffect(() => {
    if (!canvasReady || !activity || drawnRef.current) return;
    drawnRef.current = true;
    void draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasReady, activity]);

  const initCanvas = useCallback(() => {
    const query = Taro.createSelectorQuery();
    query
      .select("#poster")
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res?.[0];
        if (!item?.node) return;
        canvasRef.current = item.node as Canvas2DNode;
        setCanvasReady(true);
      });
  }, []);

  useEffect(() => {
    // Canvas 挂载后延迟一帧再查询，确保 node 已就绪
    const timer = setTimeout(initCanvas, 50);
    return () => clearTimeout(timer);
  }, [initCanvas]);

  const draw = async () => {
    const canvas = canvasRef.current;
    const a = activityRef.current;
    if (!canvas || !a) return;

    const query = Taro.createSelectorQuery();
    const sizeRes = await new Promise<{ width: number; height: number }>(
      (resolve) => {
        query
          .select("#poster")
          .fields({ size: true })
          .exec((r) => resolve((r?.[0] as { width: number; height: number }) ?? { width: 345, height: 588 }));
      }
    );
    const W = sizeRes.width || 345;
    const H = sizeRes.height || W * RATIO;
    const dpr = Taro.getSystemInfoSync().pixelRatio || 2;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const innerW = W - PAD * 2;

    // 背景
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // ---- 封面区 ----
    const COVER_H = W * 0.69;
    const coverSrc =
      a.photos?.[0]?.url ?? a.external_link?.coverImage ?? null;
    let coverDrawn = false;
    if (coverSrc) {
      try {
        const info = await Taro.getImageInfo({ src: coverSrc });
        const img = await loadImage(canvas, info.path);
        // aspectFill 居中裁剪
        const iw = img.width;
        const ih = img.height;
        const scale = Math.max(W / iw, COVER_H / ih);
        const sw = W / scale;
        const sh = COVER_H / scale;
        const sx = (iw - sw) / 2;
        const sy = (ih - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, COVER_H);
        coverDrawn = true;
      } catch {
        // 封面加载失败走品牌区
      }
    }
    if (!coverDrawn) {
      const grad = ctx.createLinearGradient(0, 0, W, COVER_H);
      grad.addColorStop(0, "#f59e0b");
      grad.addColorStop(1, "#f97316");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, COVER_H);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 44px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("飨刻", W / 2, COVER_H / 2 - 16);
      ctx.font = "16px sans-serif";
      ctx.fillText("记录我们吃的每一顿", W / 2, COVER_H / 2 + 26);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    // ---- 内容区 ----
    let y = COVER_H + 28;
    const link = a.external_link;

    // 标题胶囊
    if (link?.title) {
      ctx.font = "bold 18px sans-serif";
      const title = ellipsis(ctx, `🏷️ ${link.title}`, innerW - 24);
      const tw = ctx.measureText(title).width;
      ctx.fillStyle = "#fff7e6";
      roundRect(ctx, PAD, y, tw + 24, 34, 17);
      ctx.fill();
      ctx.fillStyle = "#92400e";
      ctx.fillText(title, PAD + 12, y + 23);
      y += 52;
    }

    // 评分/品类/人均
    const metaParts: string[] = [];
    if (typeof link?.rating === "number" && link.rating > 0) {
      metaParts.push(`★ ${link.rating.toFixed(1)}`);
    }
    if (link?.category) metaParts.push(link.category);
    if (link?.price) metaParts.push(`人均 ${link.price}`);
    if (metaParts.length > 0) {
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#666666";
      ctx.fillText(ellipsis(ctx, metaParts.join(" · "), innerW), PAD, y + 14);
      y += 32;
    }

    // 地址
    if (link?.address) {
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#888888";
      ctx.fillText(ellipsis(ctx, `📍 ${link.address}`, innerW), PAD, y + 14);
      y += 32;
    }

    // 正文摘要（最多 2 行）
    if (a.content) {
      ctx.font = "15px sans-serif";
      ctx.fillStyle = "#333333";
      const lines = wrapLines(ctx, a.content, innerW, 2);
      for (const line of lines) {
        ctx.fillText(line, PAD, y + 16);
        y += 26;
      }
    }

    // ---- 底部：小程序码 + 品牌区 ----
    const FOOTER_TOP = H - 116;
    ctx.strokeStyle = "#f0f0f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, FOOTER_TOP);
    ctx.lineTo(W - PAD, FOOTER_TOP);
    ctx.stroke();

    const QR_SIZE = 88;
    const qrY = FOOTER_TOP + 14;
    const qrPath = await getWxacodePath(a.id);
    if (qrPath) {
      try {
        const qrImg = await loadImage(canvas, qrPath);
        ctx.drawImage(qrImg, PAD, qrY, QR_SIZE, QR_SIZE);
      } catch {
        drawQrPlaceholder(ctx, PAD, qrY, QR_SIZE);
      }
    } else {
      drawQrPlaceholder(ctx, PAD, qrY, QR_SIZE);
    }

    // 品牌文案
    const brandX = PAD + QR_SIZE + 18;
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText("飨刻", brandX, qrY + 26);
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#999999";
    ctx.fillText("和饭搭子一起记录每一顿", brandX, qrY + 50);
    ctx.fillText(
      qrPath ? "长按识别小程序码，查看完整聚餐记录" : "扫码搜索小程序「飨刻」查看",
      brandX,
      qrY + 72
    );
  };

  const drawQrPlaceholder = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number
  ) => {
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#bbbbbb";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("小程序码", x + size / 2, y + size / 2);
    ctx.textAlign = "left";
  };

  // ---- 保存到相册 ----
  const saveToAlbum = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    Taro.showLoading({ title: "保存中…", mask: true });
    try {
      const res = await Taro.canvasToTempFilePath({
        canvas: canvas as unknown as Taro.Canvas,
      });
      await Taro.saveImageToPhotosAlbum({ filePath: res.tempFilePath });
      Taro.hideLoading();
      Taro.showToast({ title: "已保存到相册", icon: "success" });
    } catch (err) {
      Taro.hideLoading();
      const msg = (err as { errMsg?: string })?.errMsg ?? "";
      if (msg.includes("auth") || msg.includes("denied")) {
        const m = await Taro.showModal({
          title: "需要相册权限",
          content: "请在设置中开启「保存到相册」权限后重试",
          confirmText: "去设置",
        });
        if (m.confirm) {
          Taro.openSetting();
        }
      } else if (!msg.includes("cancel")) {
        Taro.showToast({ title: "保存失败", icon: "none" });
      }
    }
  };

  if (loading) {
    return (
      <View className="poster-page state">
        <Text className="text-muted">海报生成中…</Text>
      </View>
    );
  }

  if (error || !activity) {
    return (
      <View className="poster-page state">
        <Text className="error">{error ?? "内容不存在"}</Text>
        <Button size="mini" onClick={() => Taro.navigateBack()}>
          返回
        </Button>
      </View>
    );
  }

  return (
    <View className="poster-page">
      <Canvas
        type="2d"
        id="poster"
        className="poster-canvas"
      />
      <View className="poster-tip">
        <Text>保存海报分享到朋友圈 / 群聊</Text>
      </View>
      <View className="poster-actions">
        <Button type="primary" onClick={() => void saveToAlbum()}>
          保存到相册
        </Button>
      </View>
    </View>
  );
}
