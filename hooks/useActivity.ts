"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchData, fetcher } from "@/lib/fetcher";
import type {
  Activity,
  Comment,
  CreateActivityBody,
  CreateCommentBody,
  UpdateActivityBody,
} from "@/types";

/** 获取单个活动详情 */
export function useActivity(activityId: string | null) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activityId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchData<Activity>(`/api/activities/${activityId}`);
      setActivity(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    load();
  }, [load]);

  return { activity, setActivity, loading, error, reload: load };
}

/** 创建活动（原创或转发） */
export async function createActivity(body: CreateActivityBody & {
  parseLink?: boolean;
  linkUrl?: string;
}) {
  return fetchData<{ id: string }>("/api/activities", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** 删除活动 */
export async function deleteActivity(id: string) {
  return fetcher<{ success: boolean }>(`/api/activities/${id}`, {
    method: "DELETE",
  });
}

/** 编辑活动（仅作者，仅原创类型） */
export async function updateActivity(
  id: string,
  body: UpdateActivityBody
): Promise<Activity> {
  return fetchData<Activity>(`/api/activities/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** 点赞 / 取消点赞 */
export async function toggleLike(id: string): Promise<{ liked: boolean }> {
  return fetchData<{ liked: boolean }>(`/api/activities/${id}/like`, {
    method: "POST",
  });
}

/** 转发 */
export async function repostActivity(
  id: string,
  opts: { groupId?: string; comment?: string; content?: string }
) {
  return fetchData<{ id: string }>(`/api/activities/${id}/repost`, {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

/** 评论：获取 + 发表 */
export function useComments(activityId: string | null) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activityId) return;
    setLoading(true);
    try {
      const data = await fetchData<Comment[]>(
        `/api/activities/${activityId}/comments`
      );
      setComments(data);
    } catch {
      // 忽略
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    load();
  }, [load]);

  const addComment = useCallback(
    async (body: CreateCommentBody) => {
      const created = await fetchData<Comment>(
        `/api/activities/${activityId}/comments`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
      setComments((prev) => {
        if (created.parent_id) {
          return prev.map((c) =>
            c.id === created.parent_id
              ? { ...c, replies: [...(c.replies ?? []), created] }
              : c
          );
        }
        return [...prev, created];
      });
      return created;
    },
    [activityId]
  );

  const removeComment = useCallback(async (commentId: string) => {
    await fetcher(`/api/activities/${activityId}/comments/${commentId}`, {
      method: "DELETE",
    });
    setComments((prev) =>
      prev
        .map((c) => ({
          ...c,
          replies: (c.replies ?? []).filter((r) => r.id !== commentId),
        }))
        .filter((c) => c.id !== commentId)
    );
  }, [activityId]);

  return { comments, setComments, loading, addComment, removeComment, reload: load };
}
