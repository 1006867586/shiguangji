"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUpload, deletePhoto } from "@/hooks/useUpload";
import { cn } from "@/lib/utils";
import type { ActivityPhoto } from "@/types";

interface PhotoUploaderProps {
  activityId: string;
  existingPhotos?: ActivityPhoto[];
  /** 当前用户是否可删除某张照片（发起者可删所有，非发起者只能删自己的） */
  canDeletePhoto?: (photo: ActivityPhoto) => boolean;
  onUploaded?: (photo: ActivityPhoto) => void;
  onDeleted?: (photoId: string) => void;
}

// 包含视频格式：iOS Safari 选 Live Photo 时会同时给出 image + video(MOV) 两个文件
const ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/heic,video/quicktime,video/mp4,video/webm";

/** 从文件名中去除扩展名，用于 Live Photo 图+视频配对识别 */
function basename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

/** 判断文件是否为视频 */
function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

/** 判断文件是否为图片 */
function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * 将用户选择的文件列表分组为「上传任务」：
 * - 同名（去扩展名）的 image + video 配对为 Live Photo
 * - 未配对的图片按普通图片上传
 * - 未配对的视频按普通视频上传
 */
type UploadTask =
  | { type: "live"; image: File; video: File }
  | { type: "image"; file: File }
  | { type: "video"; file: File };

function groupFiles(files: File[]): UploadTask[] {
  const images: File[] = [];
  const videos: File[] = [];
  for (const f of files) {
    if (isImageFile(f)) images.push(f);
    else if (isVideoFile(f)) videos.push(f);
  }

  const tasks: UploadTask[] = [];
  const usedVideoIdx = new Set<number>();

  // 第一轮：按同名配对 Live Photo
  for (const img of images) {
    const imgBase = basename(img.name).toLowerCase();
    const matchIdx = videos.findIndex(
      (v, i) => !usedVideoIdx.has(i) && basename(v.name).toLowerCase() === imgBase
    );
    if (matchIdx >= 0) {
      usedVideoIdx.add(matchIdx);
      tasks.push({ type: "live", image: img, video: videos[matchIdx] });
    }
  }

  // 第二轮：未配对的图片
  for (const img of images) {
    const imgBase = basename(img.name).toLowerCase();
    const paired = tasks.some(
      (t) => t.type === "live" && basename(t.image.name).toLowerCase() === imgBase
    );
    if (!paired) tasks.push({ type: "image", file: img });
  }

  // 第三轮：未配对的视频
  videos.forEach((v, i) => {
    if (!usedVideoIdx.has(i)) tasks.push({ type: "video", file: v });
  });

  return tasks;
}

export function PhotoUploader({
  activityId,
  existingPhotos = [],
  canDeletePhoto,
  onUploaded,
  onDeleted,
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<ActivityPhoto[]>(existingPhotos);
  const { uploading, uploadToActivity, uploadLivePhotoToActivity } = useUpload();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // 分组：同名 image+video 配对为 Live Photo，其余按普通图/视频
    const tasks = groupFiles(Array.from(files));
    let failed = 0;
    for (const task of tasks) {
      try {
        let photo: ActivityPhoto | null = null;
        if (task.type === "live") {
          photo = await uploadLivePhotoToActivity(
            activityId,
            task.image,
            task.video
          );
        } else {
          photo = await uploadToActivity(
            activityId,
            task.file,
            undefined,
            task.type === "video" ? "video" : "image"
          );
        }
        if (photo) {
          setPhotos((prev) => [...prev, photo]);
          onUploaded?.(photo);
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) {
      toast.error(`${failed} 项上传失败`);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDelete = async (photoId: string) => {
    setDeletingId(photoId);
    try {
      await deletePhoto(activityId, photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      onDeleted?.(photoId);
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p) => (
          <div
            key={p.id}
            className="group relative aspect-square overflow-hidden rounded-md bg-muted focus-within:ring-2 focus-within:ring-ring"
          >
            <Image
              src={p.url}
              alt={p.caption ?? "活动照片"}
              fill
              sizes="120px"
              className="object-cover"
              unoptimized
            />
            {canDeletePhoto?.(p) ? (
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                disabled={deletingId === p.id}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                aria-label="删除照片"
              >
                {deletingId === p.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            ) : null}
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation active:scale-[0.98]",
            uploading && "opacity-60"
          )}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Upload className="h-5 w-5" />
              <span className="text-xs">添加照片</span>
            </>
          )}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <p className="mt-2 text-xs text-muted-foreground">
        支持多选，图片自动压缩至 3MB；Live Photo 会保留动态效果
      </p>
    </div>
  );
}

/** 按钮式触发器（用于卡片内快捷上传） */
export function PhotoUploadButton({
  activityId,
  onUploaded,
}: {
  activityId: string;
  onUploaded?: (photo: ActivityPhoto) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { uploading, uploadToActivity, uploadLivePhotoToActivity } = useUpload();

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        补充照片
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = e.target.files;
          if (!files) return;
          const tasks = groupFiles(Array.from(files));
          for (const task of tasks) {
            try {
              let photo: ActivityPhoto | null = null;
              if (task.type === "live") {
                photo = await uploadLivePhotoToActivity(
                  activityId,
                  task.image,
                  task.video
                );
              } else {
                photo = await uploadToActivity(
                  activityId,
                  task.file,
                  undefined,
                  task.type === "video" ? "video" : "image"
                );
              }
              if (photo) onUploaded?.(photo);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "上传失败");
            }
          }
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </>
  );
}
