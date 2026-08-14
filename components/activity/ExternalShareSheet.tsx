"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Share2, Check, Loader2, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SharePosterDialog } from "@/components/activity/SharePosterDialog";
import { APP_NAME } from "@/lib/constants";
import type { Activity } from "@/types";

interface ExternalShareSheetProps {
  activity: Activity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 站外分享渠道配置。
 * - url: 第三方分享网关，跳转后由平台自行抓取页面 OG 元数据生成预览
 * - 我们的 /activity/[id] 页已导出 opengraph-image（中间件已放行）
 *
 * 品牌图标用首字母 + 品牌色圆形渲染，避免依赖 lucide 品牌图标
 * （品牌图标在不同 lucide 版本中可用性不稳定）。
 */
interface ShareChannel {
  key: string;
  label: string;
  /** 圆形背景色（品牌色） */
  color: string;
  /** 渲染在圆形内的字符（通常为单字首字母） */
  glyph: string;
  /** 构造分享跳转 URL；不支持的平台返回 null（仅提示复制链接） */
  buildUrl: (shareUrl: string, text: string) => string | null;
}

const CHANNELS: ShareChannel[] = [
  {
    key: "wechat",
    label: "微信",
    color: "#07c160",
    glyph: "微",
    // 微信不提供网页跳转分享网关，提示复制链接后在微信内粘贴
    buildUrl: () => null,
  },
  {
    key: "weibo",
    label: "微博",
    color: "#e6162d",
    glyph: "博",
    buildUrl: (url, text) =>
      `https://service.weibo.com/share/share.php?url=${encodeURIComponent(
        url
      )}&title=${encodeURIComponent(text)}`,
  },
  {
    key: "qq",
    label: "QQ",
    color: "#12b7f5",
    glyph: "Q",
    buildUrl: (url, text) =>
      `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(
        url
      )}&title=${encodeURIComponent(text)}`,
  },
  {
    key: "twitter",
    label: "X",
    color: "#000000",
    glyph: "𝕏",
    buildUrl: (url, text) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(
        url
      )}&text=${encodeURIComponent(text)}`,
  },
  {
    key: "facebook",
    label: "Facebook",
    color: "#1877f2",
    glyph: "f",
    buildUrl: (url) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
];

/** 生成分享文案：作者 + 内容摘要 + 应用名 */
function buildShareText(activity: Activity): string {
  const author = activity.author?.nickname ?? "";
  const content = (activity.content ?? "").slice(0, 60).trim();
  const prefix = author
    ? `${author} 在${APP_NAME}分享了一条聚餐记录`
    : `${APP_NAME}聚餐记录`;
  return content ? `${prefix}：${content}` : prefix;
}

export function ExternalShareSheet({
  activity,
  open,
  onOpenChange,
}: ExternalShareSheetProps) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [showPoster, setShowPoster] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  // 关闭弹窗时重置状态
  useEffect(() => {
    if (!open) {
      setShowPoster(false);
    }
  }, [open]);

  const shareUrl = origin ? `${origin}/activity/${activity.id}` : "";
  const shareText = buildShareText(activity);

  /** 复制链接到剪贴板 */
  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return;
    setCopying(true);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        // 兜底：execCommand
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success("链接已复制");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败，请手动复制");
    } finally {
      setCopying(false);
    }
  }, [shareUrl]);

  const handleChannel = (channel: ShareChannel) => {
    if (channel.key === "wechat") {
      // 微信内无法直接跳转网关，海报是最优分享路径
      setShowPoster(true);
      toast.info("推荐生成海报分享到微信/朋友圈");
      return;
    }
    const target = channel.buildUrl(shareUrl, shareText);
    if (target) {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" /> 分享到站外
            </DialogTitle>
            <DialogDescription>
            将这条聚餐记录分享给圈外的朋友
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 海报生成入口（推荐，放在最上面） */}
          <button
            type="button"
            onClick={() => setShowPoster(true)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3.5 text-left transition-colors hover:from-amber-100 hover:to-orange-100 touch-manipulation active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
                <ImagePlus className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="text-sm font-semibold text-amber-900">
                  生成海报分享
                </div>
                <div className="text-[11px] text-amber-800/80">
                  带二维码，可直接分享到各社交平台
                </div>
              </div>
            </div>
            <span className="text-xs font-medium text-amber-700/80">立即生成 →</span>
          </button>

          {/* 渠道网格 */}
          <div className="grid grid-cols-5 gap-2">
            {CHANNELS.map((ch) => (
              <button
                key={ch.key}
                type="button"
                onClick={() => handleChannel(ch)}
                aria-label={`分享到${ch.label}`}
                className="flex flex-col items-center gap-1.5 rounded-lg p-2 transition-colors hover:bg-muted touch-manipulation active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold text-white"
                  style={{ backgroundColor: ch.color }}
                  aria-hidden="true"
                >
                  {ch.glyph}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {ch.label}
                </span>
              </button>
            ))}
          </div>

          {/* 复制链接 */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              分享链接
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
              <Link2
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                readOnly
                value={shareUrl}
                aria-label="分享链接"
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={copying || !shareUrl}
                aria-label="复制链接"
                className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 touch-manipulation active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {copying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                {copied ? "已复制" : "复制"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/80">
              链接含活动 ID，仅同圈子成员可查看详情；站外用户会看到分享卡片预览。
            </p>
          </div>
        </div>
        </DialogContent>
      </Dialog>

      {/* 海报弹窗：和分享弹窗并存，独立控制 */}
      {shareUrl ? (
        <SharePosterDialog
          activity={activity}
          shareUrl={shareUrl}
          open={showPoster}
          onOpenChange={setShowPoster}
        />
      ) : null}
    </>
  );
}
