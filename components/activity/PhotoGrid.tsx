"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHOTO_GRID_MAX } from "@/lib/constants";

interface PhotoGridProps {
  photos: { id: string; url: string }[];
  onPhotoClick?: (index: number) => void;
  className?: string;
}

/** 朋友圈风格照片网格：1 张大图、2 张并排、3-9 张九宫格 */
export function PhotoGrid({ photos, onPhotoClick, className }: PhotoGridProps) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [sourceRect, setSourceRect] = useState<DOMRect | null>(null);
  const visible = useMemo(() => photos.slice(0, PHOTO_GRID_MAX), [photos]);
  const count = visible.length;
  const overflow = photos.length - count;

  if (count === 0) return null;

  const gridClass =
    count === 1
      ? "grid-cols-1 max-w-[60%]"
      : count === 2
      ? "grid-cols-2"
      : count === 4
      ? "grid-cols-2"
      : "grid-cols-3";

  const aspect = count === 1 ? "aspect-square" : "aspect-square";

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
        {visible.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={(e) => handleClick(i, e)}
            aria-label={`查看第 ${i + 1} 张照片`}
            className={cn(
              "relative overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-border/40 transition-transform hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none",
              aspect
            )}
          >
            <Image
              src={p.url}
              alt={`活动照片 ${i + 1}`}
              fill
              sizes="(max-width: 768px) 33vw, 200px"
              className="object-cover transition-transform duration-300 hover:scale-105 motion-reduce:hover:scale-100"
              unoptimized
            />
            {overflow > 0 && i === count - 1 ? (
              <div className="absolute inset-0 flex items-center justify-center bg-foreground/60 text-lg font-semibold text-background backdrop-blur-[2px]">
                +{overflow}
              </div>
            ) : null}
          </button>
        ))}
      </div>

      {lightbox !== null ? (
        <Lightbox
          photos={photos}
          index={lightbox}
          sourceRect={sourceRect}
          onClose={closeLightbox}
          onNavigate={setLightbox}
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
}: {
  photos: { id: string; url: string }[];
  index: number;
  sourceRect: DOMRect | null;
  onClose: () => void;
  onNavigate: (i: number) => void;
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
      <div
        className="relative h-full w-full"
        style={imgWrapStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={photos[index].url}
          alt={`活动照片 ${index + 1}`}
          fill
          sizes="100vw"
          className="object-contain"
          unoptimized
          priority
        />
      </div>
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
