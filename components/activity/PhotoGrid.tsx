"use client";

import { useEffect, useMemo, useState } from "react";
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

/** 朋友圈风格照片网格：1 张大图、2 张并排、3-9 张九宫格 */
export function PhotoGrid({
  photos,
  onPhotoClick,
  className,
  canEdit = false,
  onEditCaption,
}: PhotoGridProps) {
  const [lightbox, setLightbox] = useState<number | null>(null);
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

  const handleClick = (i: number) => {
    onPhotoClick?.(i);
    setLightbox(i);
  };

  return (
    <>
      <div className={cn("grid gap-1", gridClass, className)}>
        {visible.map((p, i) => {
          const isVideo = p.kind === "video";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleClick(i)}
              aria-label={`查看第 ${i + 1} 张${isVideo ? "视频" : "照片"}`}
              className={cn(
                "relative overflow-hidden rounded-md bg-muted",
                aspect
              )}
            >
              {isVideo ? (
                <video
                  src={p.url}
                  className="h-full w-full object-cover transition-transform hover:scale-105 motion-reduce:hover:scale-100"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <Image
                  src={p.url}
                  alt={`活动照片 ${i + 1}`}
                  fill
                  sizes="(max-width: 768px) 33vw, 200px"
                  className="object-cover transition-transform hover:scale-105 motion-reduce:hover:scale-100"
                  unoptimized
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
              {/* caption 指示图标（如有描述） */}
              {p.caption ? (
                <div className="pointer-events-none absolute bottom-1 right-1 rounded-full bg-black/50 p-1 text-white">
                  <MessageSquare className="h-3 w-3" />
                </div>
              ) : null}
              {overflow > 0 && i === count - 1 ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-medium text-white">
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
          onClose={() => setLightbox(null)}
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
  onClose,
  onNavigate,
  canEdit = false,
  onEditCaption,
}: {
  photos: PhotoGridItem[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
  canEdit?: boolean;
  onEditCaption?: (photoId: string, currentCaption: string | null) => void;
}) {
  const current = photos[index];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1)
        onNavigate(index + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, photos.length, onClose, onNavigate]);

  const isVideo = current?.kind === "video";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 animate-fade-in overscroll-contain touch-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="照片预览"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="关闭"
      >
        <X className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute left-4 top-4 text-sm text-white/80"
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
        ) : (
          <Image
            src={current.url}
            alt={`活动照片 ${index + 1}`}
            fill
            sizes="100vw"
            className="object-contain"
            unoptimized
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
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
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
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
          aria-label="下一张"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
