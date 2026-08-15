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
 * 品牌图标用内联 SVG 渲染（来自 simpleicons.org），避免依赖外部图标库。
 */
interface ShareChannel {
  key: string;
  label: string;
  /** 圆形背景色（品牌色） */
  color: string;
  /** 品牌 SVG 图标组件 */
  icon: React.ReactNode;
  /** 构造分享跳转 URL；不支持的平台返回 null（仅提示复制链接） */
  buildUrl: (shareUrl: string, text: string) => string | null;
}

/** 品牌 SVG 图标（24x24 viewBox，白色填充） */
function BrandIcon({ path, size = 20 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

// SVG paths 来自 simpleicons.org
const ICONS = {
  wechat: "M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.405-.032zm-2.71 2.793c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z",
  weibo: "M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.737 5.439v.004h-.002zM9.05 17.219c-.384.616-1.208.884-1.829.602-.612-.279-.793-.991-.406-1.593.379-.595 1.176-.861 1.793-.601.624.267.82.973.442 1.592zm1.27-1.627c-.141.237-.449.353-.689.253-.236-.09-.313-.36-.177-.586.138-.227.436-.346.672-.24.239.09.315.36.18.601l.014-.028zm.176-2.719c-1.893-.493-4.033.45-4.857 2.118-.836 1.704-.026 3.591 1.886 4.21 1.983.641 4.318-.341 5.132-2.179.8-1.793-.201-3.642-2.161-4.149zm7.563-1.224c-.346-.105-.57-.18-.405-.615.375-.977.42-1.804.014-2.404-.766-1.139-2.859-1.079-5.263-.03 0 0-.751.331-.558-.27.36-1.186.299-2.187-.27-2.756-1.345-1.346-4.926.046-8.005 3.103C1.366 11.488 0 14.253 0 16.605c0 4.487 5.754 7.218 11.385 7.218 7.373 0 12.273-4.283 12.273-7.683 0-2.053-1.731-3.221-3.279-3.625zm1.953-6.054c-1.875-2.075-4.641-2.871-7.188-2.286-.586.135-.955.721-.82 1.305.135.585.72.955 1.305.82 1.798-.39 3.729.165 5.042 1.62 1.314 1.451 1.668 3.42 1.042 5.165-.187.566.12 1.176.685 1.36.566.187 1.176-.12 1.36-.685.915-2.783.375-5.85-1.836-8.299h.405zM18.72 3.372c-.904-1.002-2.219-1.623-3.51-1.719-.572-.042-1.069.39-1.11.96-.042.572.39 1.069.96 1.11.865.064 1.74.477 2.34 1.143.6.666.859 1.567.726 2.426-.083.568.311 1.098.879 1.182.568.083 1.098-.311 1.182-.879.221-1.501-.231-3.045-1.467-4.223z",
  qq: "M12.003 0c-4.098 0-7.42 3.324-7.42 7.424 0 .327.023.65.067.965-.165-.043-.33-.062-.491-.062-.758 0-1.37.328-1.671.891-.301.563-.255 1.332.105 2.051.301.602.762 1.055 1.266 1.242.234.605.551 1.215.918 1.781-1.348.516-2.832 1.336-3.984 2.586C.592 17.379-.332 19.05.117 20.586c.301 1.023 1.207 1.746 2.484 1.988.375.07.789.105 1.242.105 1.566 0 3.531-.375 5.625-1.105.918.328 1.875.516 2.836.516.957 0 1.91-.188 2.824-.512 2.098.73 4.063 1.105 5.629 1.105.453 0 .867-.035 1.242-.105 1.277-.242 2.184-.965 2.484-1.988.449-1.535-.477-3.207-1.664-4.492-1.152-1.25-2.637-2.07-3.984-2.586.367-.566.684-1.176.918-1.781.504-.187.965-.641 1.266-1.242.359-.719.406-1.488.105-2.051-.301-.563-.914-.891-1.672-.891-.16 0-.326.02-.492.062.047-.315.066-.638.066-.965C19.421 3.324 16.101 0 12.003 0zm0 1.5c3.266 0 5.922 2.656 5.922 5.924 0 .246-.016.492-.047.738l-.105.867.844-.258c.246-.074.473-.121.668-.121.406 0 .668.121.801.371.137.258.105.707-.105 1.129-.215.43-.535.723-.844.828l-.328.117-.121.328c-.27.723-.641 1.438-1.082 2.098l-.285.426.355.199c1.531.852 2.93 1.93 3.832 2.902.914.992 1.336 1.949 1.094 2.77-.18.609-.707.984-1.605 1.156-.422.078-.91.117-1.434.117-1.301 0-2.852-.273-4.492-.773l-.41-.129-.355.219c-.777.48-1.668.758-2.566.758-.898 0-1.785-.277-2.563-.758l-.355-.219-.41.129c-1.641.5-3.191.773-4.492.773-.523 0-1.012-.039-1.434-.117-.898-.172-1.426-.547-1.605-1.156-.242-.82.18-1.777 1.094-2.77.902-.973 2.301-2.051 3.832-2.902l.355-.199-.285-.426c-.441-.66-.813-1.375-1.082-2.098l-.121-.328-.328-.117c-.309-.105-.629-.398-.844-.828-.211-.422-.242-.871-.105-1.129.133-.25.395-.371.801-.371.195 0 .422.047.668.121l.844.258-.105-.867c-.031-.246-.047-.492-.047-.738C6.081 4.156 8.737 1.5 12.003 1.5z",
  twitter: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  facebook: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
};

const CHANNELS: ShareChannel[] = [
  {
    key: "wechat",
    label: "微信",
    color: "#07c160",
    icon: <BrandIcon path={ICONS.wechat} />,
    // 微信不提供网页跳转分享网关，点击后复制链接引导去微信粘贴
    buildUrl: () => null,
  },
  {
    key: "weibo",
    label: "微博",
    color: "#e6162d",
    icon: <BrandIcon path={ICONS.weibo} />,
    buildUrl: (url, text) =>
      `https://service.weibo.com/share/share.php?url=${encodeURIComponent(
        url
      )}&title=${encodeURIComponent(text)}`,
  },
  {
    key: "qq",
    label: "QQ",
    color: "#12b7f5",
    icon: <BrandIcon path={ICONS.qq} />,
    buildUrl: (url, text) =>
      `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(
        url
      )}&title=${encodeURIComponent(text)}`,
  },
  {
    key: "twitter",
    label: "X",
    color: "#000000",
    icon: <BrandIcon path={ICONS.twitter} />,
    buildUrl: (url, text) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(
        url
      )}&text=${encodeURIComponent(text)}`,
  },
  {
    key: "facebook",
    label: "Facebook",
    color: "#1877f2",
    icon: <BrandIcon path={ICONS.facebook} />,
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

/**
 * Web Share API 能力诊断。
 * navigator.share 只在「安全上下文（HTTPS/localhost）+ 完整内核浏览器」可用：
 * - insecure：站点经 HTTP 访问，浏览器禁用分享 API
 * - inApp：微信/QQ/微博等内置浏览器阉割了分享 API
 * - unsupported：国产浏览器（UC/夸克/小米等）未实现该 API
 */
type ShareCapability =
  | { supported: true }
  | { supported: false; reason: "insecure" | "inApp" | "unsupported" };

function detectShareCapability(): ShareCapability {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    return { supported: true };
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return { supported: false, reason: "insecure" };
  }
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent;
    if (/MicroMessenger|WeChat|Mobile.*QQ\/|QQ\/[\d.]+.*Mobile|WeiBo/i.test(ua)) {
      return { supported: false, reason: "inApp" };
    }
  }
  return { supported: false, reason: "unsupported" };
}

/** 不可用时展示给用户的原因与建议 */
const SHARE_UNSUPPORTED_HINT: Record<
  Exclude<ShareCapability, { supported: true }>["reason"],
  { desc: string; tip: string }
> = {
  insecure: {
    desc: "站点未启用 HTTPS，浏览器禁用了分享面板",
    tip: "已复制链接；站点升级 HTTPS 后即可唤起App分享",
  },
  inApp: {
    desc: "微信/QQ 内置浏览器不支持唤起系统分享",
    tip: "已复制链接；点右上角用系统浏览器打开本页，即可唤起App分享",
  },
  unsupported: {
    desc: "当前浏览器未提供系统分享面板",
    tip: "已复制链接；建议用 Chrome/Safari/华为浏览器打开本页唤起App分享",
  },
};

export function ExternalShareSheet({
  activity,
  open,
  onOpenChange,
}: ExternalShareSheetProps) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [showPoster, setShowPoster] = useState(false);
  /**
   * Web Share API 能力（挂载时诊断一次）。
   * 支持时「系统分享」直接唤起系统分享面板（选微信/QQ/微博即 App 分享）；
   * 不支持时该入口仍然展示，但降级为「复制链接 + 原因说明」，
   * 让用户明确知道为什么网页唤不起 App 分享（HTTP / 内置浏览器 / 内核阉割）。
   */
  const [shareCapability, setShareCapability] = useState<ShareCapability>({
    supported: true,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      setShareCapability(detectShareCapability());
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

  /**
   * 唤起系统分享面板（Web Share API）。
   * 移动端面板包含微信/QQ/微博/短信等所有已装 App，选中即进入该 App
   * 的分享流程；桌面 Chrome 打开系统级分享菜单。
   * @returns true 表示已发起（含用户取消），false 表示不支持/失败
   */
  const handleSystemShare = useCallback(async (): Promise<boolean> => {
    if (typeof navigator.share !== "function" || !shareUrl) return false;
    try {
      await navigator.share({
        title: `${APP_NAME} · 聚餐记录`,
        text: shareText,
        url: shareUrl,
      });
      onOpenChange(false);
      return true;
    } catch (err) {
      // 用户主动取消面板：静默处理
      if (err instanceof DOMException && err.name === "AbortError") return true;
      return false;
    }
  }, [shareUrl, shareText, onOpenChange]);

  /**
   * 点击「系统分享」卡片：
   * - 支持 → 直接唤起系统分享面板
   * - 不支持 → 复制链接 + 说明原因与解决办法
   */
  const handleShareCardClick = useCallback(async () => {
    if (shareCapability.supported) {
      if (await handleSystemShare()) return;
      // 极少数：诊断为支持但调用失败，走复制兜底
    }
    const reason = shareCapability.supported
      ? "unsupported"
      : shareCapability.reason;
    await handleCopyLink();
    toast.info(SHARE_UNSUPPORTED_HINT[reason].tip);
  }, [shareCapability, handleSystemShare, handleCopyLink]);

  const handleChannel = async (channel: ShareChannel) => {
    if (channel.key === "wechat") {
      // 微信无网页分享网关：优先系统分享面板（面板里选微信即为 App 分享），
      // 不支持（微信内置浏览器/旧内核）时复制链接引导粘贴
      if (await handleSystemShare()) return;
      await handleCopyLink();
      toast.info("链接已复制，请打开微信粘贴发送给好友或朋友圈");
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
                  生成后可分享到社交平台，或长按海报发送给朋友
                </div>
              </div>
            </div>
            <span className="text-xs font-medium text-amber-700/80">立即生成 →</span>
          </button>

          {/* 系统分享（唤起App）：始终展示；不支持时降级为复制链接并说明原因 */}
          <button
            type="button"
            onClick={() => void handleShareCardClick()}
            className={
              shareCapability.supported
                ? "flex w-full items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3.5 text-left transition-colors hover:bg-primary/10 touch-manipulation active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                : "flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3.5 text-left transition-colors hover:bg-muted/50 touch-manipulation active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            }
          >
            <div className="flex items-center gap-2.5">
              <span
                className={
                  shareCapability.supported
                    ? "flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"
                    : "flex h-10 w-10 items-center justify-center rounded-lg bg-muted-foreground/20 text-muted-foreground"
                }
                aria-hidden="true"
              >
                <Share2 className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {shareCapability.supported
                    ? "系统分享（唤起App）"
                    : "系统分享不可用"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {shareCapability.supported
                    ? "打开系统分享面板，可直接选微信、QQ、微博等App分享"
                    : SHARE_UNSUPPORTED_HINT[shareCapability.reason].desc}
                </div>
              </div>
            </div>
            <span
              className={
                shareCapability.supported
                  ? "text-xs font-medium text-primary/80"
                  : "text-xs font-medium text-muted-foreground/80"
              }
            >
              {shareCapability.supported ? "分享 →" : "复制链接 →"}
            </span>
          </button>

          {/* 渠道网格（链接分享） */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              链接分享
            </div>
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
                    className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: ch.color }}
                    aria-hidden="true"
                  >
                    {ch.icon}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {ch.label}
                  </span>
                </button>
              ))}
            </div>
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
