"use client";

import { useCallback, useState } from "react";
import imageCompression from "browser-image-compression";
import type { Options } from "browser-image-compression";
import { fetchData, fetcher } from "@/lib/fetcher";
import { MAX_IMAGE_BYTES } from "@/lib/constants";
import type { ActivityPhoto, AddPhotoBody } from "@/types";

interface UseUploadReturn {
  uploading: boolean;
  progress: number;
  error: string | null;
  /** 压缩并直传 R2,返回公开访问 URL */
  uploadFile: (file: File) => Promise<string | null>;
  /** 上传并把 URL 写入某活动(合并 presign + PUT + 写库) */
  uploadToActivity: (
    activityId: string,
    file: File,
    caption?: string
  ) => Promise<ActivityPhoto | null>;
}

const COMPRESSION_OPTIONS: Options = {
  maxSizeMB: 3,
  maxWidthOrHeight: 2048,
  useWebWorker: true,
};

/** 用 XHR 实现 PUT 上传,支持真实 upload.onprogress 进度回调 */
function uploadWithXhr(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`上传失败 (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("网络错误"));
    xhr.send(body);
  });
}

/** PUT 失败时按指数退避重试(retries=1:最多重试 1 次) */
async function uploadWithRetry(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void,
  retries = 1
): Promise<void> {
  try {
    await uploadWithXhr(url, body, headers, onProgress);
  } catch (e) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 1000));
      return uploadWithRetry(url, body, headers, onProgress, retries - 1);
    }
    throw e;
  }
}

/**
 * 压缩 + presign + PUT 到 R2。返回 { url, key }。
 * 不管理 hook 状态,便于 uploadFile / uploadToActivity 复用。
 */
async function performUpload(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ url: string; key: string }> {
  // 压缩(非图片直接跳过)
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
    throw new Error("图片过大,请选择小于 3MB 的图片");
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

  // 2. PUT 到 R2(XHR 真实进度 + 1 次重试)
  await uploadWithRetry(
    presign.presignedUrl,
    processed,
    { "content-type": processed.type },
    onProgress
  );

  return { url: presign.publicUrl, key: presign.key };
}

export function useUpload(): UseUploadReturn {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const { url } = await performUpload(file, setProgress);
      setProgress(100);
      return url;
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
      setUploading(true);
      setError(null);
      setProgress(0);

      // Step 1: 压缩 + presign + PUT 到 R2
      let uploadResult: { url: string; key: string };
      try {
        uploadResult = await performUpload(file, setProgress);
        setProgress(100);
      } catch (e) {
        setError(e instanceof Error ? e.message : "上传失败");
        setUploading(false);
        return null;
      }

      // Step 2: 写库 POST /photos。
      // 若 PUT 成功但 POST 失败,会产生 R2 孤儿对象:best-effort 清理 + 记录 key
      try {
        const body: AddPhotoBody = { url: uploadResult.url, caption };
        return await fetchData<ActivityPhoto>(
          `/api/activities/${activityId}/photos`,
          {
            method: "POST",
            body: JSON.stringify(body),
          }
        );
      } catch (e) {
        console.error(
          `[useUpload] R2 orphan: key=${uploadResult.key} url=${uploadResult.url}`,
          e
        );
        // R2 公共 URL 通常只读,DELETE 大概率无效;保留尝试 + 日志便于后续清理
        try {
          await fetch(
            `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${uploadResult.key}`,
            { method: "DELETE" }
          ).catch(() => {});
        } catch {
          // ignore cleanup failure
        }
        throw e;
      } finally {
        setUploading(false);
      }
    },
    []
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
