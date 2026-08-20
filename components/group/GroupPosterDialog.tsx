"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  Download,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Share2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/constants";
import { generateGroupPoster } from "@/lib/group-poster";
import type { Group } from "@/types";

interface GroupPosterDialogProps {
  group: Group;
  /** 邀请落地 URL（已含 origin），例如 https://xiangke.app/join?code=ABC */
  shareUrl: string;
  memberCount: number;
  /** 分享者昵称 */
  sharerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POSTER_WIDTH = 375;
const MAX_NAME_CHARS = 12;

/**
 * 圈子二维码分享海报对话框。
 * 流程：用 qrcode 生成邀请链接二维码 → Canvas 绘制海报（品牌风格）→ 预览/保存/系统分享。
 * 交互与活动海报（SharePosterDialog）保持一致：二维码画布重试、海报自动合成、
 * 下载、支持 Web Share 文件分享时唤起系统分享面板，否则引导长按海报发送。
 */
export function GroupPosterDialog({
  group,
  shareUrl,
  memberCount,
  sharerName,
  open,
  onOpenChange,
}: GroupPosterDialogProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const generateTimerRef = useRef<number | null>(null);
  const qrRetryRef = useRef<number>(0);

  const [qrReady, setQrReady] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null);
  /** 是否支持 Web Share API 文件分享 */
  const [filesShareSupported, setFilesShareSupported] = useState(false);

  const groupName = group.name.trim() || APP_NAME;
  const summaryName =
    groupName.length > MAX_NAME_CHARS
      ? `${groupName.slice(0, MAX_NAME_CHARS)}…`
      : groupName;
  const memberText = `${memberCount} 位好友已加入`;

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

  /** 渲染二维码到隐藏 canvas */
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
        console.error("[group-poster] qr render failed:", err);
        if (!cancelled) {
          setQrFailed(true);
          toast.error("二维码生成失败，请重试");
        }
      }
    };
    void tryRender();
    return () => {
      cancelled = true;
    };
  }, [open, shareUrl]);

  /** 用 Canvas 生成圈子海报 */
  const exportPoster = useCallback(async () => {
    setExporting(true);
    setExportFailed(false);
    try {
      const qrDataUrl = qrCanvasRef.current?.toDataURL("image/png") ?? "";
      if (!qrDataUrl) {
        throw new Error("二维码未生成");
      }
      const dataUrl = await generateGroupPoster({
        name: group.name,
        description: group.description,
        memberCountText: memberText,
        qrDataUrl,
        avatarUrl: group.avatar_url,
      });
      setPosterDataUrl(dataUrl);
      return dataUrl;
    } catch (err) {
      console.error("[group-poster] canvas draw failed:", err);
      setExportFailed(true);
      toast.error("海报合成失败，请点击重新生成");
      return null;
    } finally {
      setExporting(false);
    }
  }, [group.name, group.description, group.avatar_url, memberText]);

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
      a.download = `${APP_NAME}_圈子海报_${group.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("海报已保存");
    } catch {
      toast.error("保存失败，请长按图片保存");
    }
  }, [posterDataUrl, exportPoster, group.id]);

  /** 分享海报（支持系统分享则唤起面板，否则引导长按） */
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
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `${APP_NAME}_${group.id}.png`, {
        type: "image/png",
      });
      if (!nav.canShare?.({ files: [file] })) {
        toast.info("长按上方海报即可发送给朋友或保存");
        return;
      }
      await nav.share({
        title: `${APP_NAME} · 圈子邀请`,
        text: sharerName
          ? `${sharerName} 邀请你加入「${groupName}」圈子`
          : `邀请你加入「${groupName}」圈子`,
        files: [file],
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("分享失败，可长按上方海报保存后手动分享");
    }
  }, [posterDataUrl, exportPoster, group.id, groupName, sharerName, onOpenChange]);

  const isLoading =
    !posterDataUrl && (exporting || !qrReady) && !exportFailed && !qrFailed;
  const showRetry = qrFailed || exportFailed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" /> 圈子邀请海报
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
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={posterDataUrl}
                alt="圈子邀请海报预览"
                className="block"
                style={{ width: POSTER_WIDTH, maxWidth: "88vw" }}
              />
            ) : showRetry ? (
              <div
                className="flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-amber-50 to-white"
                style={{ width: POSTER_WIDTH, height: 500, maxWidth: "88vw" }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-6 w-6"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
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
                    可能是网络波动或图片加载超时。
                    <br />
                    请点击下方「重新生成」再试一次。
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

          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Users className="h-3 w-3" />
            扫码加入「{summaryName}」{memberCount > 0 ? `，已有 ${memberCount} 位成员` : ""}
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