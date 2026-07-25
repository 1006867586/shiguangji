"use client";

import { useEffect, useMemo, useState } from "react";
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
        {visible.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleClick(i)}
            aria-label={`查看第 ${i + 1} 张照片`}
            className={cn(
              "relative overflow-hidden rounded-md bg-muted",
              aspect
            )}
          >
            <Image
              src={p.url}
              alt={`活动照片 ${i + 1}`}
              fill
              sizes="(max-width: 768px) 33vw, 200px"
              className="object-cover transition-transform hover:scale-105"
              unoptimized
            />
            {overflow > 0 && i === count - 1 ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-medium text-white">
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
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
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
}: {
  photos: { id: string; url: string }[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
}) {
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 animate-fade-in"
      onClick={onClose}
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
      <div
        className="relative h-full w-full"
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
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
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
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
          aria-label="下一张"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
