"use client";

import { useCallback, useState } from "react";
import { fetchData } from "@/lib/fetcher";
import type { ActivityPhoto } from "@/types";

interface UsePhotoCaptionReturn {
  /** 调用 PATCH 接口更新指定 photoId 的 caption */
  updateCaption: (photoId: string, caption: string) => Promise<ActivityPhoto>;
  loading: boolean;
  error: string | null;
}

/**
 * usePhotoCaption — 修改活动照片描述。
 * 仅封装请求与 loading/error 状态，不维护本地缓存（由调用方自行更新 activity.photos）。
 */
export function usePhotoCaption(activityId: string): UsePhotoCaptionReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateCaption = useCallback(
    async (photoId: string, caption: string): Promise<ActivityPhoto> => {
      setLoading(true);
      setError(null);
      try {
        const trimmed = caption.trim();
        const updated = await fetchData<ActivityPhoto>(
          `/api/activities/${activityId}/photos/${photoId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ caption: trimmed }),
          }
        );
        return updated;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "更新描述失败";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [activityId]
  );

  return { updateCaption, loading, error };
}
