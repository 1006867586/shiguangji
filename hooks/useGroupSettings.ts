"use client";

import { useCallback, useState } from "react";
import { fetchData } from "@/lib/fetcher";
import type { Group, UpdateGroupBody } from "@/types";

/** useGroupSettings 返回值 */
interface UseGroupSettingsReturn {
  /** 更新团体信息（仅 admin） */
  update: (body: UpdateGroupBody) => Promise<Group>;
  /** 重置邀请码（仅 admin），返回新邀请码 */
  resetInviteCode: () => Promise<string>;
  loading: boolean;
  error: string | null;
}

/**
 * useGroupSettings — 管理团体设置（更新信息 / 重置邀请码）。
 * 内部维护 loading 与 error 状态，便于表单提交反馈。
 */
export function useGroupSettings(groupId: string | null): UseGroupSettingsReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    async (body: UpdateGroupBody) => {
      if (!groupId) throw new Error("缺少 groupId");
      setLoading(true);
      setError(null);
      try {
        const updated = await updateGroup(groupId, body);
        return updated;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "更新失败";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [groupId]
  );

  const resetInviteCode = useCallback(async () => {
    if (!groupId) throw new Error("缺少 groupId");
    setLoading(true);
    setError(null);
    try {
      const res = await fetchData<{ inviteCode: string }>(
        `/api/groups/${groupId}/reset-invite-code`,
        { method: "POST" }
      );
      return res.inviteCode;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "重置邀请码失败";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  return { update, resetInviteCode, loading, error };
}

/** updateGroup — 更新团体信息（独立函数，可在组件外调用） */
export async function updateGroup(
  groupId: string,
  body: UpdateGroupBody
): Promise<Group> {
  return fetchData<Group>(`/api/groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
