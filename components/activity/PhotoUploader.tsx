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
  canDelete?: boolean;
  onUploaded?: (photo: ActivityPhoto) => void;
  onDeleted?: (photoId: string) => void;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic";

export function PhotoUploader({
  activityId,
  existingPhotos = [],
  canDelete = false,
  onUploaded,
  onDeleted,
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<ActivityPhoto[]>(existingPhotos);
  const { uploading, uploadToActivity } = useUpload();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let failed = 0;
    for (const file of Array.from(files)) {
      try {
        const photo = await uploadToActivity(activityId, file);
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
      toast.error(`${failed} 张上传失败`);
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
            className="group relative aspect-square overflow-hidden rounded-md bg-muted"
          >
            <Image
              src={p.url}
              alt={p.caption ?? "活动照片"}
              fill
              sizes="120px"
              className="object-cover"
              unoptimized
            />
            {canDelete ? (
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                disabled={deletingId === p.id}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
                aria-label="删除"
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
            "flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
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
        支持多选，单张自动压缩至 3MB 以内
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
  const { uploading, uploadToActivity } = useUpload();

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
          for (const file of Array.from(files)) {
            try {
              const photo = await uploadToActivity(activityId, file);
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
