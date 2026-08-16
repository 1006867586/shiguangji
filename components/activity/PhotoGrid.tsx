"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { MessageSquare, Pencil, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHOTO_GRID_MAX } from "@/lib/constants";

/** PhotoGrid 兼容的媒体项类型（向后兼容 { id, url }） */
export type PhotoGridItem = {
  id: string;
  url: string;
  /** 描述，可选 */
  caption?: string | null;
  /** 媒体类型，缺省视为 image */
  kind?: "image" | "video" | null;
  /**
   * Live Photo 配对的动态视频 URL。
   * 有值时该项视为 Live Photo：默认显示静态图(url)，悬停/长按播放视频。
   */
  paired_video_url?: string | null;
  /** 上传者 id，可选（用于权限判断等） */
  uploaded_by?: string | null;
};

interface PhotoGridProps {
  photos: PhotoGridItem[];
  onPhotoClick?: (index: number) => void;
  className?: string;
  /** 是否显示「编辑描述」按钮（需同时提供 onEditCaption） */
  canEdit?: boolean;
  /** 点击编辑描述时回调，参数为 (photoId, 当前 caption) */
  onEditCaption?: (photoId: string, currentCaption: string | null) => void;
}

/** 九宫格照片网格：1 张大图、2 张并排、3-9 张九宫格 */
export function PhotoGrid({
  photos,
  onPhotoClick,
  className,
  canEdit = false,
  onEditCaption,
}: PhotoGridProps) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [sourceRect, setSourceRect] = useState<DOMRect | null>(null);
  /** 当前悬停的网格项 index，用于触发 Live Photo 视频预览 */
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const visible = useMemo(() => photos.slice(0, PHOTO_GRID_MAX), [photos]);
  const count = visible.length;
  const overflow = photos.length - count;

  if (count === 0) return null;

  const gridClass =
    count === 1
      ? "grid-cols-1"
      : count === 2
      ? "grid-cols-2"
      : count === 4
      ? "grid-cols-2"
      : "grid-cols-3";

  // 多图统一正方形裁剪；单图保留原始比例，用 max-w/max-h 限制极端尺寸
  const aspect = count === 1 ? undefined : "aspect-square";
  const singleWrapClass =
    count === 1 ? "max-w-[65%] max-h-[380px] self-start" : undefined;

  const handleClick = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    onPhotoClick?.(i);
    setSourceRect(e.currentTarget.getBoundingClientRect());
    setLightbox(i);
  };

  const closeLightbox = () => {
    setLightbox(null);
    setSourceRect(null);
  };

  return (
    <>
      <div className={cn("grid gap-1.5", gridClass, className)}>
        {visible.map((p, i) => {
          const isVideo = p.kind === "video";
          const isLivePhoto = !isVideo && !!p.paired_video_url;
          // Live Photo：悬停时播放视频，否则显示静态图
          const showLiveVideo = isLivePhoto && hoveredIdx === i;
          const singleImage = count === 1 && !isVideo && !isLivePhoto;
          return (
            <button
              key={p.id}
              type="button"
              onClick={(e) => handleClick(i, e)}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx((cur) => (cur === i ? null : cur))}
              aria-label={`查看第 ${i + 1} 张${isVideo ? "视频" : isLivePhoto ? "Live Photo" : "照片"}`}
              className={cn(
                "relative overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-border/40 transition-transform hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none",
                aspect,
                singleWrapClass
              )}
            >
              {isVideo ? (
                <video
                  src={p.url}
                  className={cn(
                    "h-full w-full transition-transform duration-300 hover:scale-105 motion-reduce:hover:scale-100",
                    singleWrapClass ? "object-contain" : "object-cover"
                  )}
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : showLiveVideo ? (
                // Live Photo 悬停态：播放动态视频（静音循环）
                <video
                  src={p.paired_video_url as string}
                  className={cn(singleWrapClass ? "object-contain h-full w-full" : "object-cover h-full w-full")}
                  muted
                  loop
                  playsInline
                  autoPlay
                  preload="metadata"
                />
              ) : singleImage ? (
                // 单图：保留原始比例，max-w/max-h 约束在按钮层已设置
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.url}
                  alt={`活动照片 ${i + 1}`}
                  className={cn(
                    "block max-w-full w-auto h-auto transition-transform duration-300 hover:scale-[1.02] motion-reduce:hover:scale-100"
                  )}
                  loading="lazy"
                />
              ) : (
                <Image
                  src={p.url}
                  alt={`活动照片 ${i + 1}`}
                  fill
                  sizes="(max-width: 768px) 33vw, 200px"
                  className="object-cover transition-transform duration-300 hover:scale-105 motion-reduce:hover:scale-100"
                />
              )}
              {/* 视频播放图标 overlay */}
              {isVideo ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="rounded-full bg-black/50 p-1.5 text-white">
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </div>
                </div>
              ) : null}
              {/* Live Photo 角标 */}
              {isLivePhoto ? (
                <div className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-semibold tracking-wide text-white">
                  LIVE
                </div>
              ) : null}
              {/* caption 指示图标（如有描述） */}
              {p.caption ? (
                <div className="pointer-events-none absolute bottom-1 right-1 rounded-full bg-black/50 p-1 text-white">
                  <MessageSquare className="h-3 w-3" />
                </div>
              ) : null}
              {overflow > 0 && i === count - 1 ? (
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/60 text-lg font-semibold text-background backdrop-blur-[2px]">
                  +{overflow}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {lightbox !== null ? (
        <Lightbox
          photos={photos}
          index={lightbox}
          sourceRect={sourceRect}
          onClose={closeLightbox}
          onNavigate={setLightbox}
          canEdit={canEdit}
          onEditCaption={onEditCaption}
        />
      ) : null}
    </>
  );
}

function Lightbox({
  photos,
  index,
  sourceRect,
  onClose,
  onNavigate,
  canEdit = false,
  onEditCaption,
}: {
  photos: PhotoGridItem[];
  index: number;
  sourceRect: DOMRect | null;
  onClose: () => void;
  onNavigate: (i: number) => void;
  canEdit?: boolean;
  onEditCaption?: (photoId: string, currentCaption: string | null) => void;
}) {
  // expanded=true 表示已展开到全屏；false 表示正在收回到 sourceRect 位置
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 下一帧展开：从 sourceRect 位置/大小过渡到全屏
    const id = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const current = photos[index];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1)
        onNavigate(index + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photos.length]);

  // 计算 transform-origin 与初始 scale：让全屏图片看起来从被点击的小图位置弹开
  const vw = typeof window !== "undefined" ? window.innerWidth : 1;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1;
  const hasRect = !!sourceRect && !reduceMotion.current;

  const originX = hasRect
    ? ((sourceRect!.left + sourceRect!.width / 2) / vw) * 100
    : 50;
  const originY = hasRect
    ? ((sourceRect!.top + sourceRect!.height / 2) / vh) * 100
    : 50;
  // 初始缩放比：以宽度为基准（object-contain 时图通常铺满宽度）
  const initialScale = hasRect ? sourceRect!.width / vw : 1;

  const imgWrapStyle: React.CSSProperties = hasRect
    ? {
        transformOrigin: `${originX}% ${originY}%`,
        transform: expanded
          ? "scale(1)"
          : `scale(${Math.max(initialScale, 0.05)})`,
        opacity: expanded ? 1 : 0,
        transition:
          "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out",
      }
    : {};

  const handleClose = () => {
    if (reduceMotion.current) {
      onClose();
      return;
    }
    // 先收回动画，再真正关闭
    setClosing(true);
    setExpanded(false);
    window.setTimeout(onClose, 260);
  };

  const isVideo = current?.kind === "video";
  const isLivePhoto = !isVideo && !!current?.paired_video_url;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center overscroll-contain touch-none",
        "bg-black/90 transition-opacity duration-300",
        expanded && !closing ? "opacity-100" : "opacity-0"
      )}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="照片预览"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white opacity-0 transition-opacity duration-300 hover:bg-white/20 [.group:hover_&]:opacity-100"
        style={{ opacity: expanded && !closing ? 1 : 0 }}
        aria-label="关闭"
      >
        <X className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        className="absolute left-4 top-4 text-sm text-white/80"
        style={{ opacity: expanded && !closing ? 1 : 0, transition: "opacity 300ms ease 100ms" }}
      >
        {index + 1} / {photos.length}
      </button>
      {/* 编辑描述按钮：仅在 canEdit 且提供 onEditCaption 时显示 */}
      {canEdit && onEditCaption && current ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEditCaption(current.id, current.caption ?? null);
          }}
          className="absolute right-4 top-16 z-10 flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
          aria-label="编辑描述"
        >
          <Pencil className="h-3.5 w-3.5" />
          编辑描述
        </button>
      ) : null}
      <div
        className="relative h-full w-full"
        style={imgWrapStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={current.url}
            className="h-full w-full object-contain"
            controls
            playsInline
            autoPlay
          />
        ) : isLivePhoto ? (
          // Live Photo 大图：播放配对动态视频，带控件；fallback 静态图作 poster
          <video
            src={current.paired_video_url as string}
            poster={current.url}
            className="h-full w-full object-contain"
            controls
            loop
            playsInline
            autoPlay
          />
        ) : (
          <Image
            src={current.url}
            alt={`活动照片 ${index + 1}`}
            fill
            sizes="100vw"
            className="object-contain"
            priority
          />
        )}
      </div>
      {/* caption 显示在底部 */}
      {current?.caption ? (
        <div
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-6 pt-10 text-sm text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {current.caption}
        </div>
      ) : null}
      {index > 0 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index - 1);
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white opacity-0 transition-opacity hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
          style={{ opacity: expanded && !closing ? 1 : 0, transition: "opacity 300ms ease 100ms" }}
          aria-label="上一张"
        >
          ‹
        </button>
      ) : null}
      {index < photos.length - 1 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index + 1);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white opacity-0 transition-opacity hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
          style={{ opacity: expanded && !closing ? 1 : 0, transition: "opacity 300ms ease 100ms" }}
          aria-label="下一张"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
