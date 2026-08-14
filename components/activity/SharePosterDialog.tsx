"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ForwardedRef,
} from "react";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import { Download, Image as ImageIcon, Loader2, X } from "lucide-react";
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
import type { Activity } from "@/types";

interface SharePosterDialogProps {
  activity: Activity;
  /** 分享落地 URL（已含 origin），例如 https://xiangke.app/activity/123 */
  shareUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 海报 DOM 尺寸（逻辑像素，导出时 2x 倍率保证清晰度） */
const POSTER_WIDTH = 375;
const POSTER_HEIGHT = 500; // 3:4 竖屏

/** 活动正文最多展示的字符数（防止溢出海报） */
const MAX_CONTENT_CHARS = 90;

/** 从 activity 中挑一张最合适的海报封面图 */
function pickCoverPhoto(activity: Activity): { url: string; caption?: string } | null {
  if (activity.external_link?.coverImage) {
    return { url: activity.external_link.coverImage };
  }
  const firstPhoto = activity.photos?.find((p) => p.url);
  if (firstPhoto) {
    return { url: firstPhoto.url, caption: firstPhoto.caption ?? undefined };
  }
  return null;
}

/** 正文截断 + 省略号 */
function truncateForPoster(text: string | null | undefined): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_CONTENT_CHARS) return t;
  return `${t.slice(0, MAX_CONTENT_CHARS)}…`;
}

/**
 * 将跨域图片 URL 转为同域代理 URL，让 html2canvas 截图时不受 CORS 限制。
 * 代理 API 会服务端 fetch 原图并附带 CORS 头返回，保证 canvas 不被 taint。
 */
function toProxyUrl(url: string): string {
  if (!url) return url;
  // 已经是 data URL 的不需要代理
  if (url.startsWith("data:")) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export function SharePosterDialog({
  activity,
  shareUrl,
  open,
  onOpenChange,
}: SharePosterDialogProps) {
  const posterRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const [qrReady, setQrReady] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null);

  const cover = pickCoverPhoto(activity);
  const authorName = activity.author?.nickname ?? APP_NAME;
  const authorAvatar = activity.author?.avatar_url ?? "";
  const groupName = ""; // Activity 类型不含 group 名称（避免额外请求，留空不展示）
  const timeText = formatRelativeTime(activity.created_at);
  const summary = truncateForPoster(activity.content);
  const externalTitle = activity.external_link?.title ?? "";

  /**
   * 渲染二维码到隐藏的 canvas（不显示，二维码在海报里用 <img> 引用 dataURL）
   * 用 QRCode.toCanvas 画到 ref，然后读 canvas.toDataURL
   */
  useEffect(() => {
    if (!open || !shareUrl || !qrCanvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        await QRCode.toCanvas(qrCanvasRef.current, shareUrl, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 160,
          color: {
            dark: "#1f2937", // slate-800，和文字色一致
            light: "#ffffff",
          },
        });
        if (!cancelled) setQrReady(true);
      } catch (err) {
        console.error("[poster] qr render failed:", err);
        if (!cancelled) toast.error("二维码生成失败，请重试");
      }
    })();
    return () => {
      cancelled = true;
      setQrReady(false);
      setImagesLoaded(false);
      setPosterDataUrl(null);
    };
  }, [open, shareUrl]);

  /** 监听封面图 + 二维码（<img ref>）加载完成，作为导出可用的信号 */
  const handleAllImagesReady = useCallback(() => {
    setImagesLoaded(true);
  }, []);

  /** 拿二维码的 dataURL（qrcode canvas -> dataURL）*/
  const getQrDataUrl = useCallback(() => {
    return qrCanvasRef.current?.toDataURL("image/png") ?? "";
  }, []);

  /** 将海报 DOM 渲染成 2x PNG，写入 posterDataUrl 用于预览/下载 */
  const exportPoster = useCallback(async () => {
    if (!posterRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(posterRef.current, {
        backgroundColor: null,
        scale: 2,
        // 图片已通过 /api/image-proxy 同域代理，无需 useCORS
        useCORS: false,
        allowTaint: false,
        logging: false,
        imageTimeout: 15000,
      });
      const dataUrl = canvas.toDataURL("image/png");
      setPosterDataUrl(dataUrl);
      return dataUrl;
    } catch (err) {
      console.error("[poster] html2canvas failed:", err);
      toast.error("海报生成失败，请重试");
      return null;
    } finally {
      setExporting(false);
    }
  }, []);

  /** 第一次打开且二维码就绪时，自动生成预览图（省一步用户点击） */
  useEffect(() => {
    if (!open || !qrReady || posterDataUrl || exporting) return;
    // 等 React 把二维码 img src 挂载好再截图
    const t = window.setTimeout(() => {
      void exportPoster();
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, qrReady, posterDataUrl, exporting, exportPoster]);

  /** 下载海报到本地 */
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

  const canExport = qrReady && imagesLoaded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" /> 分享海报
          </DialogTitle>
          <DialogDescription>
            保存海报图片，分享到微信或朋友圈
          </DialogDescription>
        </DialogHeader>

        {/* 隐藏：二维码绘制画布（不展示，转 dataURL 后用于海报内 <img>） */}
        <canvas ref={qrCanvasRef} className="hidden" aria-hidden="true" />

        {/* 海报预览/占位区域 */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative mx-auto overflow-hidden rounded-2xl border border-border bg-white shadow-[0_10px_40px_-12px_rgba(0,0,0,0.18)]">
            {/* 已经导出的直接显示图片（用户可长按保存） */}
            {posterDataUrl ? (
              <img
                src={posterDataUrl}
                alt="分享海报预览"
                width={POSTER_WIDTH}
                height={POSTER_HEIGHT}
                className="block"
                style={{ width: POSTER_WIDTH, maxWidth: "88vw" }}
              />
            ) : (
              <>
                {/* 加载骨架 */}
                <div
                  className="flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-amber-50 to-white"
                  style={{ width: POSTER_WIDTH, height: POSTER_HEIGHT, maxWidth: "88vw" }}
                >
                  <Loader2 className="h-8 w-8 animate-spin text-amber-600/70" />
                  <p className="text-xs text-muted-foreground">
                    {!qrReady ? "正在生成二维码…" : "正在合成海报…"}
                  </p>
                </div>
                {/* 真实海报 DOM（离屏视觉渲染中，html2canvas 截这一屏） */}
                <div className="pointer-events-none absolute left-0 top-0 opacity-0 [&_*]:pointer-events-none">
                  <PosterDOM
                    ref={posterRef}
                    cover={cover}
                    qrDataUrl={getQrDataUrl()}
                    qrReady={qrReady}
                    authorName={authorName}
                    authorAvatar={authorAvatar}
                    groupName={groupName}
                    timeText={timeText}
                    summary={summary}
                    externalTitle={externalTitle}
                    shareUrl={shareUrl}
                    onImagesReady={handleAllImagesReady}
                    width={POSTER_WIDTH}
                    height={POSTER_HEIGHT}
                  />
                </div>
              </>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            海报内容仅展示公开信息（正文、时间、作者）；扫码需要登录后才能查看完整内容。
          </p>

          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              onClick={exportPoster}
              disabled={exporting || !canExport}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted touch-manipulation active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              {exporting ? "生成中…" : "重新生成"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={exporting || !posterDataUrl}
              className="flex flex-[1.2] items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 touch-manipulation active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              保存到本地
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*                               海报 DOM 模板                                */
/* -------------------------------------------------------------------------- */

interface PosterDOMProps {
  cover: { url: string; caption?: string } | null;
  qrDataUrl: string;
  qrReady: boolean;
  authorName: string;
  authorAvatar: string;
  groupName: string;
  timeText: string;
  summary: string;
  externalTitle: string;
  shareUrl: string;
  onImagesReady: () => void;
  width: number;
  height: number;
}

/**
 * 纯展示的海报内容。用 forwardRef 暴露容器 DOM 给 html2canvas 截图。
 * 所有字体/间距均用绝对像素，保证 375×500 画布是设计稿精确尺寸。
 */
const PosterDOM = forwardRef(function PosterDOM(
  props: PosterDOMProps,
  ref: ForwardedRef<HTMLDivElement>
) {
    const {
      cover,
      qrDataUrl,
      qrReady,
      authorName,
      authorAvatar,
      groupName,
      timeText,
      summary,
      externalTitle,
      shareUrl,
      onImagesReady,
      width,
      height,
    } = props;

    const [coverLoaded, setCoverLoaded] = useState(!cover);
    const [qrLoaded, setQrLoaded] = useState(!qrReady);

    // 两张图都 ready 时通知父（qrReady 为 false 时不算，此时不会有图）
    useEffect(() => {
      const done = coverLoaded && (qrLoaded || !qrReady);
      if (done) onImagesReady();
    }, [coverLoaded, qrLoaded, qrReady, onImagesReady]);

    const coverHeight = cover ? Math.min(280, Math.round(width * 0.75)) : 0;

    return (
      <div
        ref={ref}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          background:
            "linear-gradient(180deg, #fffbeb 0%, #ffffff 42%, #ffffff 100%)",
          color: "#111827",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
          position: "relative",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {/* 1. 封面图（若有） */}
        {cover ? (
          <div
            style={{
              width: "100%",
              height: `${coverHeight}px`,
              overflow: "hidden",
              background: "#f3f4f6",
              position: "relative",
            }}
          >
            <img
              src={toProxyUrl(cover.url)}
              alt=""
              onLoad={() => setCoverLoaded(true)}
              onError={() => setCoverLoaded(true)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            {/* 顶部装饰渐变，保证作者昵称在深色封面下可读 */}
            <div
              style={{
                position: "absolute",
                inset: "0 0 auto 0",
                height: 88,
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 100%)",
              }}
            />
          </div>
        ) : (
          // 无封面时用纯色大 LOGO 占位
          <div
            style={{
              width: "100%",
              height: "240px",
              background:
                "linear-gradient(135deg, #f59e0b 0%, #d97706 55%, #b45309 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fffbeb",
              position: "relative",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 64,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  lineHeight: 1,
                }}
              >
                {APP_NAME}
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 13,
                  opacity: 0.9,
                  letterSpacing: "0.18em",
                }}
              >
                记录我们吃的每一顿
              </div>
            </div>
          </div>
        )}

        {/* 2. 作者栏（浮层，有封面时半透明白底叠在上部） */}
        <div
          style={{
            position: "absolute",
            top: cover ? 14 : 20,
            left: 16,
            right: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              background: "#fff",
              border: "2px solid rgba(255,255,255,0.85)",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {authorAvatar ? (
              <img
                src={toProxyUrl(authorAvatar)}
                alt=""
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#d97706",
                  fontSize: 14,
                  fontWeight: 700,
                  background: "#fef3c7",
                }}
              >
                {(authorName || APP_NAME).slice(0, 1)}
              </div>
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1, color: cover ? "#fff" : "#111827" }}>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
              {authorName || APP_NAME}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 11,
                opacity: cover ? 0.85 : 0.65,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {[groupName, timeText].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>

        {/* 3. 正文区 */}
        <div
          style={{
            padding: `20px 20px 0 20px`,
            marginTop: cover ? coverHeight - 36 : 240,
          }}
        >
          {/* 外部链接标题条（若有） */}
          {externalTitle ? (
            <div
              style={{
                marginBottom: 10,
                padding: "6px 10px",
                borderRadius: 8,
                background: "#fef3c7",
                color: "#92400e",
                fontSize: 11,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              🏷️ {externalTitle}
            </div>
          ) : null}

          <div
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              color: "#1f2937",
              fontWeight: 500,
              // 最多 4 行（大约刚好对应 MAX_CONTENT_CHARS 90 的预期）
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: "18px",
            }}
          >
            {summary || "（这条聚餐记录没有文字描述）"}
          </div>
        </div>

        {/* 4. 底部二维码区 */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "16px 20px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          {/* 二维码 */}
          <div
            style={{
              width: 84,
              height: 84,
              padding: 4,
              background: "#fff",
              borderRadius: 10,
              border: "1px solid #fde68a",
              boxShadow: "0 4px 12px -4px rgba(251, 191, 36, 0.35)",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {qrReady && qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="扫码查看活动"
                onLoad={() => setQrLoaded(true)}
                onError={() => setQrLoaded(true)}
                style={{ width: "100%", height: "100%", display: "block" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background:
                    "repeating-linear-gradient(45deg, #f3f4f6 0 6px, #ffffff 6px 12px)",
                  borderRadius: 6,
                }}
              />
            )}
          </div>

          {/* 右侧：品牌 + 扫码提示 + 域名 */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#b45309",
                lineHeight: 1.2,
              }}
            >
              {APP_NAME}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: "#78350f",
                lineHeight: 1.35,
              }}
            >
              扫码查看完整聚餐记录
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 10,
                color: "#9ca3af",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {shareUrl}
            </div>
          </div>
        </div>

        {/* 背景角装饰（金色小圆点，纯视觉） */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -40,
            top: cover ? coverHeight + 40 : 280,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(251,191,36,0.14) 0%, rgba(251,191,36,0) 70%)",
            pointerEvents: "none",
          }}
        />
      </div>
    );
});
