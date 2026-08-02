"use client";

import { useCallback, useState } from "react";
import imageCompression from "browser-image-compression";
import type { Options } from "browser-image-compression";
import { fetchData, fetcher } from "@/lib/fetcher";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/constants";
import type { ActivityPhoto, AddPhotoBody, MediaKind } from "@/types";

interface UseUploadReturn {
  uploading: boolean;
  progress: number;
  error: string | null;
  /** 压缩并直传 R2,返回公开访问 URL */
  uploadFile: (file: File, kind?: MediaKind) => Promise<string | null>;
  /** 上传并把 URL 写入某活动(合并 presign + PUT + 写库) */
  uploadToActivity: (
    activityId: string,
    file: File,
    caption?: string,
    kind?: MediaKind
  ) => Promise<ActivityPhoto | null>;
  /**
   * 上传 Live Photo(静态图 + 动态视频配对)并写入某活动。
   * 图片走压缩,视频直传;两份都 PUT 成功后再 POST /photos 带 pairedVideoUrl。
   */
  uploadLivePhotoToActivity: (
    activityId: string,
    imageFile: File,
    videoFile: File,
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
 * - kind === "video" 跳过 browser-image-compression 直传,使用 50MB 体积限制
 * - 其他情况走图片压缩 + 3MB 体积限制
 */
async function performUpload(
  file: File,
  onProgress?: (pct: number) => void,
  kind?: MediaKind
): Promise<{ url: string; key: string }> {
  // 根据文件类型 / kind 决定走图片压缩还是视频直传
  const isVideo =
    kind === "video" ||
    (!kind && file.type.startsWith("video/"));

  let processed: File = file;

  if (!isVideo && file.type.startsWith("image/")) {
    // 图片:压缩
    try {
      processed = await imageCompression(file, COMPRESSION_OPTIONS);
    } catch {
      // 压缩失败则用原图
      processed = file;
    }
  }

  // 体积限制:图片 3MB,视频 50MB
  if (isVideo) {
    if (processed.size > MAX_VIDEO_BYTES) {
      throw new Error("视频过大,请选择小于 50MB 的视频");
    }
  } else if (processed.size > MAX_IMAGE_BYTES) {
    throw new Error("图片过大,请选择小于 3MB 的图片");
  }

  // 1. 获取预签名 URL(网络错误给友好提示,对应"图片上传无响应"问题)
  let presign: { presignedUrl: string; publicUrl: string; key: string };
  try {
    presign = await fetchData<{
      presignedUrl: string;
      publicUrl: string;
      key: string;
    }>("/api/upload/presign", {
      method: "POST",
      body: JSON.stringify({
        filename: processed.name,
        contentType: processed.type,
        kind: isVideo ? "video" : "image",
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      throw new Error("无法连接到服务器,请检查网络或稍后重试");
    }
    throw e;
  }

  // 2. PUT 到 R2(XHR 真实进度 + 1 次重试;网络错误给友好提示)
  try {
    await uploadWithRetry(
      presign.presignedUrl,
      processed,
      { "content-type": processed.type },
      onProgress
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("网络错误")) {
      throw new Error("上传到存储服务失败,请检查存储服务配置或网络连接");
    }
    throw e;
  }

  return { url: presign.publicUrl, key: presign.key };
}

export function useUpload(): UseUploadReturn {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File, kind?: MediaKind): Promise<string | null> => {
      setUploading(true);
      setError(null);
      setProgress(0);
      try {
        const { url } = await performUpload(file, setProgress, kind);
        setProgress(100);
        return url;
      } catch (e) {
        const message = e instanceof Error ? e.message : "上传失败";
        setError(message);
        throw e;
      } finally {
        setUploading(false);
      }
    },
    []
  );

  const uploadToActivity = useCallback(
    async (
      activityId: string,
      file: File,
      caption?: string,
      kind?: MediaKind
    ): Promise<ActivityPhoto | null> => {
      setUploading(true);
      setError(null);
      setProgress(0);

      // Step 1: 压缩 + presign + PUT 到 R2
      let uploadResult: { url: string; key: string };
      try {
        uploadResult = await performUpload(file, setProgress, kind);
        setProgress(100);
      } catch (e) {
        setError(e instanceof Error ? e.message : "上传失败");
        setUploading(false);
        return null;
      }

      // Step 2: 写库 POST /photos。
      // 若 PUT 成功但 POST 失败,会产生 R2 孤儿对象:best-effort 清理 + 记录 key
      try {
        const body: AddPhotoBody = {
          url: uploadResult.url,
          caption,
          kind,
        };
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

  const uploadLivePhotoToActivity = useCallback(
    async (
      activityId: string,
      imageFile: File,
      videoFile: File,
      caption?: string
    ): Promise<ActivityPhoto | null> => {
      setUploading(true);
      setError(null);
      setProgress(0);

      // Step 1: 并行上传图片(压缩) + 视频(直传)，进度各占 50%
      let imageUrl: string;
      let videoUrl: string;
      try {
        // 图片与视频并行 presign+PUT；进度合并为 0-100
        const onImgProgress = (pct: number) =>
          setProgress(Math.round(pct * 0.5));
        const onVidProgress = (pct: number) =>
          setProgress(Math.round(50 + pct * 0.5));

        // performUpload 内部已处理图片压缩与视频体积校验
        const [imgRes, vidRes] = await Promise.all([
          performUpload(imageFile, onImgProgress, "image"),
          performUpload(videoFile, onVidProgress, "video"),
        ]);
        imageUrl = imgRes.url;
        videoUrl = vidRes.url;
        setProgress(100);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Live Photo 上传失败");
        setUploading(false);
        return null;
      }

      // Step 2: 写库 POST /photos，携带 pairedVideoUrl
      try {
        const body: AddPhotoBody = {
          url: imageUrl,
          caption,
          kind: "image",
          pairedVideoUrl: videoUrl,
        };
        return await fetchData<ActivityPhoto>(
          `/api/activities/${activityId}/photos`,
          {
            method: "POST",
            body: JSON.stringify(body),
          }
        );
      } catch (e) {
        console.error(
          `[useUpload] Live Photo 写库失败: imageUrl=${imageUrl} videoUrl=${videoUrl}`,
          e
        );
        throw e;
      } finally {
        setUploading(false);
      }
    },
    []
  );

  return {
    uploading,
    progress,
    error,
    uploadFile,
    uploadToActivity,
    uploadLivePhotoToActivity,
  };
}

/** 删除照片 */
export async function deletePhoto(activityId: string, photoId: string) {
  return fetcher<{ success: boolean }>(
    `/api/activities/${activityId}/photos/${photoId}`,
    { method: "DELETE" }
  );
}
