"use client";

import { useCallback, useState } from "react";
import imageCompression from "browser-image-compression";
import { fetchData, fetcher } from "@/lib/fetcher";
import { MAX_IMAGE_BYTES } from "@/lib/constants";
import type { ActivityPhoto, AddPhotoBody } from "@/types";

interface UseUploadReturn {
  uploading: boolean;
  progress: number;
  error: string | null;
  /** 压缩并直传 R2，返回公开访问 URL */
  uploadFile: (file: File) => Promise<string | null>;
  /** 上传并把 URL 写入某活动（合并 presign + PUT + 写库） */
  uploadToActivity: (
    activityId: string,
    file: File,
    caption?: string
  ) => Promise<ActivityPhoto | null>;
}

const COMPRESSION_OPTIONS = {
  maxSizeMB: 3,
  maxWidthOrHeight: 2048,
  useWebWorker: true,
};

export function useUpload(): UseUploadReturn {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      // 压缩（非图片直接跳过）
      let processed: File = file;
      if (file.type.startsWith("image/")) {
        try {
          processed = await imageCompression(file, COMPRESSION_OPTIONS);
        } catch {
          // 压缩失败则用原图
          processed = file;
        }
      }

      if (processed.size > MAX_IMAGE_BYTES) {
        throw new Error("图片过大，请选择小于 3MB 的图片");
      }

      // 1. 获取预签名 URL
      const presign = await fetchData<{
        presignedUrl: string;
        publicUrl: string;
        key: string;
      }>("/api/upload/presign", {
        method: "POST",
        body: JSON.stringify({
          filename: processed.name,
          contentType: processed.type,
        }),
      });

      // 2. PUT 到 R2
      const putRes = await fetch(presign.presignedUrl, {
        method: "PUT",
        body: processed,
        headers: { "content-type": processed.type },
      });

      if (!putRes.ok) {
        throw new Error(`上传失败 (${putRes.status})`);
      }
      setProgress(100);
      return presign.publicUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  const uploadToActivity = useCallback(
    async (
      activityId: string,
      file: File,
      caption?: string
    ): Promise<ActivityPhoto | null> => {
      const url = await uploadFile(file);
      if (!url) return null;

      const body: AddPhotoBody = { url, caption };
      const photo = await fetchData<ActivityPhoto>(
        `/api/activities/${activityId}/photos`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
      return photo;
    },
    [uploadFile]
  );

  return { uploading, progress, error, uploadFile, uploadToActivity };
}

/** 删除照片 */
export async function deletePhoto(activityId: string, photoId: string) {
  return fetcher<{ success: boolean }>(
    `/api/activities/${activityId}/photos/${photoId}`,
    { method: "DELETE" }
  );
}
