"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, Image as ImageIcon, Loader2, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/utils";
import { generatePoster } from "@/lib/poster-canvas";
import type { Activity } from "@/types";

interface SharePosterDialogProps {
  activity: Activity;
  /** 分享落地 URL（已含 origin），例如 https://xiangke.app/activity/123 */
  shareUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POSTER_WIDTH = 375;
const MAX_CONTENT_CHARS = 60;

/**
 * 从 activity 中挑出海报展示用的图片 URL 列表（最多 4 张）。
 * 优先用外链封面 + 用户上传照片；去重后截取前 4 张。
 */
function pickGalleryPhotos(activity: Activity): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  // 外链封面图优先放第一张
  const extCover = activity.external_link?.coverImage;
  if (extCover) {
    urls.push(extCover);
    seen.add(extCover);
  }

  // 用户上传的照片
  for (const photo of activity.photos ?? []) {
    if (photo.url && !seen.has(photo.url)) {
      urls.push(photo.url);
      seen.add(photo.url);
    }
    if (urls.length >= 4) break;
  }

  return urls.slice(0, 4);
}

/** 正文截断 + 省略号 */
function truncateForPoster(text: string | null | undefined): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_CONTENT_CHARS) return t;
  return `${t.slice(0, MAX_CONTENT_CHARS)}…`;
}

export function SharePosterDialog({
  activity,
  shareUrl,
  open,
  onOpenChange,
}: SharePosterDialogProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const generateTimerRef = useRef<number | null>(null);
  const qrRetryRef = useRef<number>(0);

  const [qrReady, setQrReady] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null);
  /**
   * 是否支持 Web Share API 文件分享（桌面 Chrome/Edge 与部分移动浏览器）。
   * 不支持（微信内置浏览器、部分安卓 WebView）时引导长按海报分享，
   * 而不是强制下载一次。
   */
  const [filesShareSupported, setFilesShareSupported] = useState(false);

  const galleryUrls = pickGalleryPhotos(activity);
  const galleryKey = galleryUrls.join(",");
  const galleryUrlsRef = useRef(galleryUrls);
  galleryUrlsRef.current = galleryUrls;
  const authorName = activity.author?.nickname ?? APP_NAME;
  const authorAvatar = activity.author?.avatar_url ?? "";
  const timeText = formatRelativeTime(activity.created_at);
  const summary = truncateForPoster(activity.content);

  /** 统一重置所有海报状态 */
  const resetState = useCallback(() => {
    setQrReady(false);
    setQrFailed(false);
    setExporting(false);
    setExportFailed(false);
    setPosterDataUrl(null);
    qrRetryRef.current = 0;
    if (generateTimerRef.current) {
      window.clearTimeout(generateTimerRef.current);
      generateTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    resetState();
    // 探测当前浏览器是否支持「分享文件」（系统分享面板直接发图）
    try {
      const probe = new File(
        [new Blob([""], { type: "image/png" })],
        "probe.png",
        { type: "image/png" }
      );
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      setFilesShareSupported(
        typeof nav.share === "function" &&
          typeof nav.canShare === "function" &&
          nav.canShare({ files: [probe] })
      );
    } catch {
      setFilesShareSupported(false);
    }
  }, [open, resetState]);

  /**
   * 渲染二维码到隐藏 canvas，然后转 dataURL。
   * QR dataURL 会作为 Image 传给 Canvas 海报绘制引擎。
   */
  useEffect(() => {
    if (!open || !shareUrl) return;
    let cancelled = false;

    const tryRender = async () => {
      if (!qrCanvasRef.current) {
        if (qrRetryRef.current < 5) {
          qrRetryRef.current += 1;
          window.setTimeout(() => {
            if (!cancelled) void tryRender();
          }, 16);
        } else {
          setQrFailed(true);
          toast.error("二维码画布未就绪，请重试");
        }
        return;
      }
      try {
        await QRCode.toCanvas(qrCanvasRef.current, shareUrl, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 160,
          color: { dark: "#1f2937", light: "#ffffff" },
        });
        if (!cancelled) {
          setQrReady(true);
          setQrFailed(false);
        }
      } catch (err) {
        console.error("[poster] qr render failed:", err);
        if (!cancelled) {
          setQrFailed(true);
          toast.error("二维码生成失败，请重试");
        }
      }
    };
    void tryRender();
    return () => { cancelled = true; };
  }, [open, shareUrl]);

  /** 用 Canvas API 生成海报（替代 html2canvas） */
  const exportPoster = useCallback(async () => {
    setExporting(true);
    setExportFailed(false);
    try {
      const qrDataUrl = qrCanvasRef.current?.toDataURL("image/png") ?? "";
      if (!qrDataUrl) {
        throw new Error("二维码未生成");
      }

      const dataUrl = await generatePoster({
        activity,
        galleryUrls: galleryUrlsRef.current,
        avatarUrl: authorAvatar,
        qrDataUrl,
        authorName,
        timeText,
        summary,
      });

      setPosterDataUrl(dataUrl);
      return dataUrl;
    } catch (err) {
      console.error("[poster] canvas draw failed:", err);
      setExportFailed(true);
      toast.error("海报合成失败，请点击重新生成");
      return null;
    } finally {
      setExporting(false);
    }
  }, [activity, galleryKey, authorAvatar, authorName, timeText, summary]);

  /** 二维码就绪后自动生成海报 */
  const exportRef = useRef(exportPoster);
  useEffect(() => {
    exportRef.current = exportPoster;
  }, [exportPoster]);

  useEffect(() => {
    if (!open || !qrReady || posterDataUrl || exporting || exportFailed) return;
    generateTimerRef.current = window.setTimeout(() => {
      void exportRef.current();
    }, 300);
    return () => {
      if (generateTimerRef.current) {
        window.clearTimeout(generateTimerRef.current);
      }
    };
  }, [open, qrReady, posterDataUrl, exporting, exportFailed]);

  /** 手动重试 */
  const handleRetry = useCallback(() => {
    resetState();
    window.setTimeout(() => {
      if (!qrCanvasRef.current) return;
      void (async () => {
        try {
          await QRCode.toCanvas(qrCanvasRef.current, shareUrl, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 160,
            color: { dark: "#1f2937", light: "#fff" },
          });
          setQrReady(true);
        } catch {
          setQrFailed(true);
          toast.error("二维码生成失败，请重试");
        }
      })();
    }, 0);
  }, [resetState, shareUrl]);

  /** 下载海报 */
  const handleDownload = useCallback(async () => {
    let dataUrl: string | null = posterDataUrl ?? null;
    if (!dataUrl) {
      const generated = await exportPoster();
      if (!generated) return;
      dataUrl = generated;
    }
    try {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${APP_NAME}_活动海报_${activity.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("海报已保存");
    } catch {
      toast.error("保存失败，请长按图片保存");
    }
  }, [posterDataUrl, exportPoster, activity.id]);

  /**
   * 分享海报：
   * - 支持 Web Share 文件分享 → 唤起系统分享面板（微信/QQ/微博等）直接发图
   * - 不支持（微信内置浏览器等）→ 引导长按海报发送/保存，不强制下载
   */
  const handleShare = useCallback(async () => {
    let dataUrl: string | null = posterDataUrl ?? null;
    if (!dataUrl) {
      const generated = await exportPoster();
      if (!generated) return;
      dataUrl = generated;
    }

    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };

    // 不支持文件分享：引导长按（微信内长按图片可「发送给朋友/保存图片」）
    const canShareFiles =
      typeof nav.canShare === "function" &&
      typeof nav.share === "function" &&
      nav.canShare({
        files: [
          new File([new Blob([""], { type: "image/png" })], "p.png", {
            type: "image/png",
          }),
        ],
      });

    if (!canShareFiles) {
      toast.info("当前浏览器不支持直接分享，长按上方海报即可发送给朋友或保存");
      return;
    }

    try {
      // dataURL → Blob → File
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `${APP_NAME}_${activity.id}.png`, {
        type: "image/png",
      });

      if (!nav.canShare?.({ files: [file] })) {
        toast.info("长按上方海报即可发送给朋友或保存");
        return;
      }

      await nav.share({
        title: `${APP_NAME} · 聚餐记录`,
        text: authorName
          ? `${authorName} 在${APP_NAME}分享了一条聚餐记录`
          : `${APP_NAME}聚餐记录`,
        files: [file],
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("分享失败，可长按上方海报保存后手动分享");
    }
  }, [posterDataUrl, exportPoster, activity.id, authorName, onOpenChange]);

  const isLoading = !posterDataUrl && (exporting || !qrReady) && !exportFailed && !qrFailed;
  const showRetry = qrFailed || exportFailed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" /> 分享海报
          </DialogTitle>
          <DialogDescription>
            {filesShareSupported
              ? "点击分享唤起系统分享面板，直接发送到社交平台"
              : "长按海报图片，即可发送给朋友或保存到相册"}
          </DialogDescription>
        </DialogHeader>

        {/* 隐藏：二维码绘制画布 */}
        <canvas ref={qrCanvasRef} className="hidden" aria-hidden="true" />

        <div className="flex flex-col items-center gap-3">
          <div className="relative mx-auto overflow-hidden rounded-2xl border border-border bg-white shadow-[0_10px_40px_-12px_rgba(0,0,0,0.18)]">
            {posterDataUrl ? (
              <img
                src={posterDataUrl}
                alt="分享海报预览"
                className="block"
                style={{ width: POSTER_WIDTH, maxWidth: "88vw" }}
              />
            ) : showRetry ? (
              <div
                className="flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-amber-50 to-white"
                style={{ width: POSTER_WIDTH, height: 500, maxWidth: "88vw" }}
              >
                <div className="h-12 w-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeLinecap="round" />
                    <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
                    <circle cx="12" cy="16" r="0.8" fill="currentColor" stroke="none" />
                  </svg>
                </div>
                <div className="flex flex-col items-center gap-1 px-6 text-center">
                  <p className="text-sm font-medium text-foreground">
                    {qrFailed ? "二维码生成失败" : "海报合成失败"}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    可能是网络波动或图片加载超时。<br />请点击下方「重新生成」再试一次。
                  </p>
                </div>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-amber-50 to-white"
                style={{ width: POSTER_WIDTH, height: 500, maxWidth: "88vw" }}
              >
                {isLoading && (
                  <Loader2 className="h-8 w-8 animate-spin text-amber-600/70" />
                )}
                <p className="text-xs text-muted-foreground">
                  {!qrReady
                    ? "正在生成二维码…"
                    : exporting
                      ? "正在合成海报…"
                      : "准备中…"}
                </p>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            海报内容仅展示公开信息（正文、时间、作者）；扫码需要登录后才能查看完整内容。
          </p>

          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              onClick={handleRetry}
              disabled={exporting && !showRetry}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors touch-manipulation active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                showRetry
                  ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              重新生成
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={exporting || !posterDataUrl}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors touch-manipulation active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                filesShareSupported
                  ? "border-border bg-background text-foreground hover:bg-muted"
                  : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              保存
            </button>
            {filesShareSupported ? (
              <button
                type="button"
                onClick={handleShare}
                disabled={exporting || !posterDataUrl}
                className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 touch-manipulation active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Share2 className="h-3.5 w-3.5" />
                分享
              </button>
            ) : null}
          </div>

          {/* 不支持系统分享时：手机端长按海报是微信生态的标准分享路径 */}
          {!filesShareSupported && posterDataUrl ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">
              长按上方海报，选择「发送给朋友」或「保存图片」
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
