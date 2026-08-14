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
import { Download, Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";
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

/**
 * 动态海报高度：根据内容丰富度计算。
 * 成熟方案——用内容量决定画布高度，而不是把内容硬塞进固定尺寸。
 *
 * 公式：
 *   基础 = 封面 + 作者栏重叠 + 正文区 + 二维码区 + 边距
 *   正文区 = max(内容所需高度, 最小高度)
 *   内容所需高度 = 装饰条(8) + 可选信息行 + 正文(最多3行) + 标签 + 互动数据
 *
 * 典型值：
 *   稀疏（只有封面+1行正文）:  ~430px
 *   标准（封面+餐厅信息+标签）: ~560px
 *   丰富（全部信息）:          ~680px
 */
function computePosterHeight(opts: {
  coverHeight: number;
  hasExtTitle: boolean;
  hasExtInfo: boolean;
  hasRepost: boolean;
  tagsCount: number;
  hasStats: boolean;
  summaryLength: number;
}): number {
  const {
    coverHeight,
    hasExtTitle,
    hasExtInfo,
    hasRepost,
    tagsCount,
    hasStats,
    summaryLength,
  } = opts;

  const AUTHOR_OVERLAP = 28;
  const QR_AREA = 110;
  const TOP_PADDING = 14;
  const BOTTOM_PADDING = 18;

  // 信息行（餐厅信息/转发/标签/互动数据）的高度累加
  let infoLinesHeight = 0;
  if (hasExtTitle) {
    infoLinesHeight += 18; // 标题胶囊
    if (hasExtInfo) infoLinesHeight += 12; // 评分+分类+人均
  }
  if (hasExtInfo) infoLinesHeight += 10; // 地址行
  if (hasRepost) infoLinesHeight += 36; // 转发卡
  if (tagsCount > 0) infoLinesHeight += 20; // 标签胶囊行
  if (hasStats) infoLinesHeight += 22; // 互动数据行

  // 稀疏模式装饰条
  const hasAnyInfo = hasExtTitle || hasExtInfo || hasRepost || tagsCount > 0 || hasStats;
  const decorHeight = hasAnyInfo ? 0 : 22; // 上下两条装饰条

  // 正文行数估算（13px/行，60字 ≈ 3 行；稀疏模式 15px/行）
  const lineHeight = 22; // 13 * 1.55 ≈ 20, 加上间距
  const summaryLines = summaryLength === 0 ? 1 : Math.min(3, Math.ceil(summaryLength / 18));
  const summaryHeight = summaryLines * lineHeight + (summaryLines > 1 ? 0 : 6);

  // 正文区总高 = padding + 装饰条 + 信息行 + 正文 + padding
  const bodyHeight = TOP_PADDING + decorHeight + infoLinesHeight + summaryHeight + BOTTOM_PADDING;

  // 最小正文区高度，保证视觉呼吸
  const MIN_BODY = 80;
  const bodyMin = Math.max(bodyHeight, MIN_BODY);

  // 总高 = 封面 + body + 二维码 + 底部 margin
  const total = coverHeight - AUTHOR_OVERLAP + bodyMin + QR_AREA + 10;

  // 限制范围，过短显得局促，过长显得松散
  return Math.max(420, Math.min(total, 750));
}

/** 活动正文最多展示的字符数（防止溢出海报，留出空间给信息条） */
const MAX_CONTENT_CHARS = 60;

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
  /** 图片加载超时兜底计时器（代理/外链图卡死时强制退出 loading） */
  const imageLoadTimeoutRef = useRef<number | null>(null);
  /** 二维码生成尝试次数（用于 ref 未就绪的微重试） */
  const qrRetryRef = useRef<number>(0);

  const [qrReady, setQrReady] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [posterDataUrl, setPosterDataUrl] = useState<string | null>(null);

  const cover = pickCoverPhoto(activity);
  const authorName = activity.author?.nickname ?? APP_NAME;
  const authorAvatar = activity.author?.avatar_url ?? "";
  const groupName = ""; // Activity 类型不含 group 名称（避免额外请求，留空不展示）
  const timeText = formatRelativeTime(activity.created_at);
  const summary = truncateForPoster(activity.content);

  /** 动态计算海报高度：内容决定画布大小，消除空白 */
  const ext = activity.external_link;
  const tags = (activity.tags ?? []).slice(0, 4);
  const reactionsTotal = activity.reactions
    ? (activity.reactions.like ?? 0) +
      (activity.reactions.love ?? 0) +
      (activity.reactions.haha ?? 0) +
      (activity.reactions.wow ?? 0) +
      (activity.reactions.sad ?? 0) +
      (activity.reactions.angry ?? 0)
    : 0;
  const posterHeight = computePosterHeight({
    coverHeight: cover ? Math.min(232, Math.round(POSTER_WIDTH * 0.62)) : 0,
    hasExtTitle: !!ext?.title,
    hasExtInfo: !!(ext?.rating || ext?.category || ext?.price || ext?.address),
    hasRepost: !!activity.repost_of,
    tagsCount: tags.length,
    hasStats:
      (activity.photo_count ?? 0) > 0 ||
      (activity.comment_count ?? 0) > 0 ||
      (activity.like_count ?? 0) > 0 ||
      reactionsTotal > 0,
    summaryLength: summary.length,
  });

  /** 统一重置所有海报状态：弹窗打开时 & 手动重试时 */
  const resetState = useCallback(() => {
    setQrReady(false);
    setQrFailed(false);
    setImagesLoaded(false);
    setExporting(false);
    setExportFailed(false);
    setPosterDataUrl(null);
    if (imageLoadTimeoutRef.current) {
      window.clearTimeout(imageLoadTimeoutRef.current);
      imageLoadTimeoutRef.current = null;
    }
    qrRetryRef.current = 0;
  }, []);

  useEffect(() => {
    if (!open) return;
    resetState();
  }, [open, resetState]);

  /**
   * 渲染二维码到隐藏的 canvas（不显示，二维码在海报里用 <img> 引用 dataURL）
   *
   * Bug1 修复：canvas ref 在挂载时机上可能晚于 Dialog onOpen 触发 effect。
   * 原代码检测到 ref=null 就 return，且永不重试。现在用 rAF+最多 5 次微重试等 ref 绑定。
   */
  useEffect(() => {
    if (!open || !shareUrl) return;
    let cancelled = false;

    const tryRender = async () => {
      // ref 还没挂载？微重试（rAF → 下一帧再看，最多 5 次 ≈ 80ms）
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
          color: {
            dark: "#1f2937", // slate-800，和文字色一致
            light: "#ffffff",
          },
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
    return () => {
      cancelled = true;
    };
  }, [open, shareUrl]);

  /** 监听封面图 + 二维码（<img ref>）加载完成，作为导出可用的信号 */
  const handleAllImagesReady = useCallback(() => {
    setImagesLoaded(true);
    if (imageLoadTimeoutRef.current) {
      window.clearTimeout(imageLoadTimeoutRef.current);
      imageLoadTimeoutRef.current = null;
    }
  }, []);

  /** 拿二维码的 dataURL（qrcode canvas -> dataURL）*/
  const getQrDataUrl = useCallback(() => {
    return qrCanvasRef.current?.toDataURL("image/png") ?? "";
  }, []);

  /** 将海报 DOM 渲染成 2x PNG，写入 posterDataUrl 用于预览/下载 */
  const exportPoster = useCallback(async () => {
    if (!posterRef.current) return null;
    setExporting(true);
    setExportFailed(false);
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
      setExportFailed(true);
      toast.error("海报合成失败，请点击重新生成");
      return null;
    } finally {
      setExporting(false);
    }
  }, []);

  /**
   * 自动导出海报：
   *  - 必须 qrReady=true（二维码 dataURL 已生成）
   *  - 必须 imagesLoaded=true 或 6 秒图片加载超时兜底（用户不会永远卡在"合成中"）
   *  - Bug2 修复：useEffect 依赖数组移除 exportPoster（因为每轮 render 引用可能变，会反复清 200ms timeout）。
   *    改为用 ref 存最新 exportPoster 函数。
   */
  const exportPosterRef = useRef(exportPoster);
  useEffect(() => {
    exportPosterRef.current = exportPoster;
  }, [exportPoster]);

  /** 图片加载超时兜底：qrReady 后 6 秒仍未 imagesLoaded，也让导出流程继续（即使部分图失败） */
  useEffect(() => {
    if (!qrReady || imagesLoaded) return;
    imageLoadTimeoutRef.current = window.setTimeout(() => {
      console.warn("[poster] images load timeout, force mark imagesLoaded");
      setImagesLoaded(true);
    }, 6000);
    return () => {
      if (imageLoadTimeoutRef.current) {
        window.clearTimeout(imageLoadTimeoutRef.current);
        imageLoadTimeoutRef.current = null;
      }
    };
  }, [qrReady, imagesLoaded]);

  /** 第一次打开且二维码就绪 + 图片 ready 时，自动生成预览图（省一步用户点击） */
  useEffect(() => {
    if (!open || !qrReady || !imagesLoaded || posterDataUrl || exporting || exportFailed) return;
    const t = window.setTimeout(() => {
      void exportPosterRef.current();
    }, 300);
    return () => window.clearTimeout(t);
    // 注意：这里只依赖纯 state，不依赖 exportPoster 函数引用（防 timeout 被反复清）
  }, [open, qrReady, imagesLoaded, posterDataUrl, exporting, exportFailed]);

  /** 手动重试：完整走一遍"重置 → 二维码 → 合成"流程 */
  const handleRetry = useCallback(() => {
    resetState();
    // 下一帧再触发：等 reset effect 清完状态再让二维码 effect 重跑
    window.setTimeout(() => {
      if (!qrCanvasRef.current) return;
      void (async () => {
        try {
          await QRCode.toCanvas(qrCanvasRef.current, shareUrl, {
            errorCorrectionLevel: "M", margin: 1, width: 160,
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
  const isLoading = !posterDataUrl && (exporting || !qrReady || !imagesLoaded) && !exportFailed && !qrFailed;
  const showRetry = qrFailed || exportFailed;

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
                height={posterHeight}
                className="block"
                style={{ width: POSTER_WIDTH, maxWidth: "88vw" }}
              />
            ) : (
              <>
                {/* 失败态卡片（二维码失败 or 合成失败） */}
                {showRetry ? (
                  <div
                    className="flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-amber-50 to-white"
                    style={{ width: POSTER_WIDTH, height: posterHeight, maxWidth: "88vw" }}
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
                  /* 加载骨架（isLoading 控制文案） */
                  <div
                    className="flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-amber-50 to-white"
                    style={{ width: POSTER_WIDTH, height: posterHeight, maxWidth: "88vw" }}
                  >
                    {isLoading && (
                      <Loader2 className="h-8 w-8 animate-spin text-amber-600/70" />
                    )}
                    <p className="text-xs text-muted-foreground">
                      {qrFailed
                        ? "二维码生成失败"
                        : exportFailed
                          ? "海报合成失败"
                          : !qrReady
                            ? "正在生成二维码…"
                            : !imagesLoaded
                              ? "正在加载图片资源…"
                              : exporting
                                ? "正在合成海报…"
                                : "准备中…"}
                    </p>
                  </div>
                )}
                {/* 真实海报 DOM（离屏视觉渲染中，html2canvas 截这一屏） */}
                {/* 即使失败态也保留：用户点重新生成会重置状态，避免海报 DOM 重新挂载导致图片 ref 丢失 */}
                <div className="pointer-events-none absolute left-0 top-0 opacity-0 [&_*]:pointer-events-none">
                  <PosterDOM
                    ref={posterRef}
                    activity={activity}
                    cover={cover}
                    qrDataUrl={getQrDataUrl()}
                    qrReady={qrReady}
                    authorName={authorName}
                    authorAvatar={authorAvatar}
                    groupName={groupName}
                    timeText={timeText}
                    summary={summary}
                    onImagesReady={handleAllImagesReady}
                    width={POSTER_WIDTH}
                    height={posterHeight}
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
              {exporting ? "生成中…" : showRetry ? "重新生成" : "重新生成"}
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
  activity: Activity;
  cover: { url: string; caption?: string } | null;
  qrDataUrl: string;
  qrReady: boolean;
  authorName: string;
  authorAvatar: string;
  groupName: string;
  timeText: string;
  summary: string;
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
    activity,
    cover,
    qrDataUrl,
    qrReady,
    authorName,
    authorAvatar,
    groupName,
    timeText,
    summary,
    onImagesReady,
    width,
    height,
  } = props;

  const ext = activity.external_link;
  const [coverLoaded, setCoverLoaded] = useState(!cover);
  const [qrLoaded, setQrLoaded] = useState(!qrReady);

  // 两张图都 ready 时通知父（qrReady 为 false 时不算，此时不会有图）
  useEffect(() => {
    const done = coverLoaded && (qrLoaded || !qrReady);
    if (done) onImagesReady();
  }, [coverLoaded, qrLoaded, qrReady, onImagesReady]);

  // 检测信息是否丰富（用于决定封面大小和是否显示装饰）
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

  // 封面高度：信息丰富时正常 0.62，稀疏时缩小到 0.52 给正文更多空间
  const coverHeight = cover
    ? hasRichInfo
      ? Math.min(232, Math.round(width * 0.62))
      : Math.min(200, Math.round(width * 0.52))
    : 0;

  /** 餐厅信息第一行：评分 ⭐ x.y · 分类 · 人均 ¥xx */
  const infoLineParts: string[] = [];
  if (ext?.rating) infoLineParts.push(`⭐ ${Number(ext.rating).toFixed(1)}`);
  if (ext?.category) infoLineParts.push(`${ext.category}`);
  if (ext?.price) infoLineParts.push(`人均 ¥${ext.price.replace(/[¥￥]/g, "")}`);
  const infoLine1 = infoLineParts.join(" · ");
  const addressLine = ext?.address?.trim() ? ext.address.trim() : null;

  /** 互动数据行：📸 N · 💬 N · ❤️ N · ⭐ N (N) */
  const statsParts: string[] = [];
  if ((activity.photo_count ?? 0) > 0) statsParts.push(`📸 ${activity.photo_count}`);
  if ((activity.comment_count ?? 0) > 0) statsParts.push(`💬 ${activity.comment_count}`);
  if ((activity.like_count ?? 0) > 0) {
    statsParts.push(`❤️ ${activity.like_count}`);
  } else if (reactionsTotal > 0) {
    statsParts.push(`👍 ${reactionsTotal}`);
  }
  if (activity.average_rating && (activity.rating_count ?? 0) > 0) {
    statsParts.push(`⭐ ${Number(activity.average_rating).toFixed(1)} (${activity.rating_count})`);
  }
  const statsLine = statsParts.join("  ");

  const repost = activity.repost_of;
  const tags = (activity.tags ?? []).slice(0, 4);

  return (
    <div
      ref={ref}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        background:
          "linear-gradient(180deg, #fffbeb 0%, #ffffff 38%, #ffffff 100%)",
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
        // 无封面时用纯色大 LOGO 占位（稍调小以适配新增信息行）
        <div
          style={{
            width: "100%",
            height: "200px",
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
                fontSize: 58,
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
                fontSize: 12,
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
          top: cover ? 14 : 18,
          left: 16,
          right: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
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
                fontSize: 13,
                fontWeight: 700,
                background: "#fef3c7",
              }}
            >
              {(authorName || APP_NAME).slice(0, 1)}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1, color: cover ? "#fff" : "#111827" }}>
          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>
            {authorName || APP_NAME}
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 10,
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

      {/* 3. 正文 + 信息区（动态高度已计算好，内容自然排列即可） */}
      <div
        style={{
          padding: `14px 18px 0 18px`,
          marginTop: cover ? coverHeight - 28 : 200,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 稀疏模式装饰条：顶部 + 金色渐变 */}
        {!hasRichInfo && (
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background:
                "linear-gradient(90deg, #fde68a 0%, #f59e0b 50%, #fde68a 100%)",
              marginBottom: 14,
              opacity: 0.75,
              flexShrink: 0,
            }}
          />
        )}

        {/* 外链标题条 + 餐厅评分/分类/人均 + 地址 */}
        {ext?.title ? (
          <div style={{ marginBottom: 8, flexShrink: 0 }}>
            <div
              style={{
                padding: "5px 10px",
                borderRadius: 8,
                background: "#fef3c7",
                color: "#92400e",
                fontSize: 11,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "inline-block",
                maxWidth: "100%",
              }}
            >
              🏷️ {ext.title}
            </div>
            {infoLine1 ? (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "#78350f",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {infoLine1}
              </div>
            ) : null}
            {addressLine ? (
              <div
                style={{
                  marginTop: 3,
                  fontSize: 10,
                  color: "#6b7280",
                  display: "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                📍 {addressLine}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 独立地址行：即使没有 ext.title，只要有地址就显示 */}
        {!ext?.title && addressLine ? (
          <div
            style={{
              marginBottom: 8,
              padding: "4px 10px",
              borderRadius: 6,
              background: "#fffbeb",
              color: "#78350f",
              fontSize: 11,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flexShrink: 0,
            }}
          >
            📍 {addressLine}
          </div>
        ) : null}

        {/* 转发摘要：转发评论 + 原活动作者/内容 */}
        {repost ? (
          <div
            style={{
              marginBottom: 8,
              padding: "8px 10px",
              borderRadius: 8,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              flexShrink: 0,
            }}
          >
            {activity.repost_comment ? (
              <div
                style={{
                  fontSize: 11,
                  color: "#78350f",
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                🔁 &ldquo;{activity.repost_comment}&rdquo;
              </div>
            ) : null}
            <div
              style={{
                fontSize: 10,
                color: "#92400e",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              转发自 @{repost.author?.nickname ?? APP_NAME}：
              {repost.content
                ? `「${repost.content.replace(/\s+/g, " ").slice(0, 22)}${repost.content.length > 22 ? "…" : ""}」`
                : repost.external_link?.title ?? ""}
            </div>
          </div>
        ) : null}

        {/* 正文摘要（3 行截断 + 正文 60 字） */}
        <div
          style={{
            fontSize: !hasRichInfo ? 15 : 13,
            lineHeight: !hasRichInfo ? 1.6 : 1.55,
            color: "#1f2937",
            fontWeight: 600,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: "24px",
            flexShrink: 0,
          }}
        >
          {summary || "（这条聚餐记录没有文字描述）"}
        </div>

        {/* 标签胶囊（最多 4 个）*/}
        {tags.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              flexShrink: 0,
            }}
          >
            {tags.map((t) => (
              <span
                key={t.id}
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "#fef3c7",
                  color: "#92400e",
                  fontSize: 10,
                  fontWeight: 500,
                }}
              >
                # {t.name}
              </span>
            ))}
          </div>
        )}

        {/* 互动数据行（分隔虚线 + 琥珀色） */}
        {statsLine ? (
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: "1px dashed #fde68a",
              fontSize: 11,
              color: "#b45309",
              fontWeight: 500,
              letterSpacing: "0.01em",
              flexShrink: 0,
            }}
          >
            {statsLine}
          </div>
        ) : null}

        {/* 底部装饰条（稀疏模式） */}
        {!hasRichInfo && (
          <div
            style={{
              marginTop: 14,
              height: 3,
              borderRadius: 2,
              background:
                "linear-gradient(90deg, rgba(253,230,138,0) 0%, rgba(245,158,11,0.5) 50%, rgba(253,230,138,0) 100%)",
              flexShrink: 0,
              opacity: 0.6,
            }}
          />
        )}
      </div>

      {/* 4. 底部二维码区（去掉 shareUrl 域名显示，二维码本身包含跳转） */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "14px 18px 18px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          borderTop: "1px solid #fef3c7",
          background:
            "linear-gradient(180deg, rgba(255,251,235,0) 0%, rgba(255,251,235,0.6) 100%)",
        }}
      >
        {/* 二维码 */}
        <div
          style={{
            width: 80,
            height: 80,
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

        {/* 右侧：品牌 + Slogan + 扫码提示（三行精炼，域名删掉） */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: "#b45309",
              lineHeight: 1.2,
              letterSpacing: "0.01em",
            }}
          >
            {APP_NAME}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 11,
              color: "#92400e",
              lineHeight: 1.4,
              opacity: 0.9,
            }}
          >
            记录我们吃的每一顿
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              fontWeight: 600,
              color: "#78350f",
              lineHeight: 1.3,
            }}
          >
            扫码查看完整聚餐记录
          </div>
        </div>
      </div>

      {/* 背景角装饰（金色小圆点，纯视觉） */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: -30,
          bottom: 60,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0) 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: -20,
          top: cover ? coverHeight + 10 : 200,
          width: 70,
          height: 70,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(251,191,36,0.1) 0%, rgba(251,191,36,0) 70%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
});
